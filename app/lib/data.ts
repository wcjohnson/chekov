import { openDB, type DBSchema } from "idb";
import type { TagColorKey } from "./tagColors";
import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { CategoryName, TaskId } from "./types";
import { detectCycle, fromKvPairsToMap } from "./utils";
import { useMemo } from "react";

const DB_NAME = "chekov-db";
const DB_VERSION = 5;
export const TASKS_STORE = "tasks";
export const TASK_TAGS_STORE = "taskTags";
export const TASK_DEPENDENCIES_STORE = "taskDependencies";
export const TASK_COMPLETION_STORE = "taskCompletion";
export const TASK_WARNINGS_STORE = "taskWarnings";
export const TASK_HIDDEN_STORE = "taskHidden";
export const CATEGORIES_STORE = "categories";
export const CATEGORY_TASKS_STORE = "categoryTasks";
export const CATEGORY_DEPENDENCIES_STORE = "categoryDependencies";
export const TAG_COLORS_STORE = "tagColors";
export const CATEGORY_COLLAPSED_STORE = "categoryCollapsed";

export type StoredTask = {
  id: TaskId;
  title: string;
  description: string;
  category: CategoryName;
};

interface ChekovDB extends DBSchema {
  [TASKS_STORE]: {
    key: TaskId;
    value: StoredTask;
  };
  [TASK_TAGS_STORE]: {
    key: TaskId;
    value: Set<string>;
  };
  [TASK_DEPENDENCIES_STORE]: {
    key: TaskId;
    value: Set<TaskId>;
  };
  [TASK_COMPLETION_STORE]: {
    key: TaskId;
    value: true;
  };
  [TASK_WARNINGS_STORE]: {
    key: TaskId;
    value: true;
  };
  [TASK_HIDDEN_STORE]: {
    key: TaskId;
    value: true;
  };
  [CATEGORIES_STORE]: {
    key: "categories";
    value: CategoryName[];
  };
  [CATEGORY_TASKS_STORE]: {
    key: CategoryName;
    value: TaskId[];
  };
  [CATEGORY_DEPENDENCIES_STORE]: {
    key: CategoryName;
    value: Set<TaskId>;
  };
  [TAG_COLORS_STORE]: {
    key: string;
    value: TagColorKey;
  };
  [CATEGORY_COLLAPSED_STORE]: {
    key: "task" | "edit";
    value: Set<CategoryName>;
  };
}

let dbPromise: ReturnType<typeof openDB<ChekovDB>> | null = null;

export const getDb = async () => {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is not available");
  }

  if (!dbPromise) {
    dbPromise = openDB<ChekovDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const storeName of Array.from(db.objectStoreNames)) {
          db.deleteObjectStore(storeName);
        }

        db.createObjectStore(TASKS_STORE);
        db.createObjectStore(TASK_TAGS_STORE);
        db.createObjectStore(TASK_DEPENDENCIES_STORE);
        db.createObjectStore(TASK_COMPLETION_STORE);
        db.createObjectStore(TASK_WARNINGS_STORE);
        db.createObjectStore(TASK_HIDDEN_STORE);
        db.createObjectStore(CATEGORIES_STORE);
        db.createObjectStore(CATEGORY_TASKS_STORE);
        db.createObjectStore(CATEGORY_DEPENDENCIES_STORE);
        db.createObjectStore(TAG_COLORS_STORE);
        db.createObjectStore(CATEGORY_COLLAPSED_STORE);
      },
    });
  }

  return dbPromise;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
});

//////////////////////////// MUTTS

export function useCreateTaskMutation() {
  return useMutation({
    mutationFn: async (category: string) => {
      const db = await getDb();
      const task: StoredTask = {
        id: crypto.randomUUID(),
        title: "Untitled task",
        description: "",
        category,
      };
      // In a transaction:
      // - Create category if it doesnt exist
      // - Add task to tasks store
      // - Add task id to categoryTasks store
      const tx = db.transaction(
        [CATEGORIES_STORE, TASKS_STORE, CATEGORY_TASKS_STORE],
        "readwrite",
      );
      const categoryStore = tx.objectStore(CATEGORIES_STORE);
      const tasksStore = tx.objectStore(TASKS_STORE);
      const categoryTasksStore = tx.objectStore(CATEGORY_TASKS_STORE);

      // Create category if it doesn't exist
      const existingCategories = (await categoryStore.get("categories")) ?? [];
      if (!existingCategories.includes(category)) {
        await categoryStore.put(
          [...existingCategories, category],
          "categories",
        );
      }

      // Add task to tasks store
      await tasksStore.put(task, task.id);

      // Add task id to categoryTasks store
      const existingCategoryTasks =
        (await categoryTasksStore.get(category)) ?? [];
      await categoryTasksStore.put(
        [...existingCategoryTasks, task.id],
        category,
      );

      await tx.done;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskSet"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categoryTasks"] });
      queryClient.invalidateQueries({ queryKey: ["details"] });
    },
  });
}

export function useDeleteTasksMutation() {
  return useMutation({
    mutationFn: async (taskIds: TaskId[]) => {
      const db = await getDb();
      const updatedDependencyEntries: Array<[TaskId, Set<string>]> = [];

      // In a transaction:
      // - Remove tasks from tasks store
      // - Remove task ids from categoryTasks store
      // - Remove tasks tags, dependencies, completion, and hidden status
      // - If the task is a dependency for other tasks, remove it from their dependencies. Do this for each task.
      // - If any task's category has no more tasks, remove the category from both categories and categoryTasks stores
      const tx = db.transaction(
        [
          TASKS_STORE,
          TASK_TAGS_STORE,
          TASK_DEPENDENCIES_STORE,
          TASK_COMPLETION_STORE,
          TASK_WARNINGS_STORE,
          TASK_HIDDEN_STORE,
          CATEGORIES_STORE,
          CATEGORY_TASKS_STORE,
        ],
        "readwrite",
      );

      const tasksStore = tx.objectStore(TASKS_STORE);
      const taskTagsStore = tx.objectStore(TASK_TAGS_STORE);
      const taskDependenciesStore = tx.objectStore(TASK_DEPENDENCIES_STORE);
      const taskCompletionStore = tx.objectStore(TASK_COMPLETION_STORE);
      const taskWarningsStore = tx.objectStore(TASK_WARNINGS_STORE);
      const taskHiddenStore = tx.objectStore(TASK_HIDDEN_STORE);
      const categoriesStore = tx.objectStore(CATEGORIES_STORE);
      const categoryTasksStore = tx.objectStore(CATEGORY_TASKS_STORE);

      const deleteTaskIds = new Set(taskIds.filter(Boolean));
      if (deleteTaskIds.size === 0) {
        await tx.done;
        return {
          deletedTaskIds: [] as TaskId[],
          updatedDependencyEntries,
        };
      }

      const existingTasks = await Promise.all(
        Array.from(deleteTaskIds).map((taskId) => tasksStore.get(taskId)),
      );
      const existingTaskIds = new Set<TaskId>();
      const affectedCategories = new Set<string>();

      for (const task of existingTasks) {
        if (!task) {
          continue;
        }

        existingTaskIds.add(task.id);
        affectedCategories.add(task.category);
      }

      if (existingTaskIds.size === 0) {
        await tx.done;
        return {
          deletedTaskIds: [] as TaskId[],
          updatedDependencyEntries,
        };
      }

      const dependencyTaskIds = await taskDependenciesStore.getAllKeys();
      const dependencyValues = await taskDependenciesStore.getAll();

      await Promise.all(
        Array.from(existingTaskIds).flatMap((taskId) => [
          tasksStore.delete(taskId),
          taskTagsStore.delete(taskId),
          taskDependenciesStore.delete(taskId),
          taskCompletionStore.delete(taskId),
          taskWarningsStore.delete(taskId),
          taskHiddenStore.delete(taskId),
        ]),
      );

      for (const category of affectedCategories) {
        const categoryTaskIds = (await categoryTasksStore.get(category)) ?? [];
        const nextCategoryTaskIds = categoryTaskIds.filter(
          (id) => !existingTaskIds.has(id),
        );

        if (nextCategoryTaskIds.length > 0) {
          await categoryTasksStore.put(nextCategoryTaskIds, category);
        } else {
          await categoryTasksStore.delete(category);
        }
      }

      const categories = (await categoriesStore.get("categories")) ?? [];

      const filteredCategories: string[] = [];
      for (const category of categories) {
        const categoryTaskIds = await categoryTasksStore.get(category);
        if ((categoryTaskIds ?? []).length > 0) {
          filteredCategories.push(category);
        }
      }

      await categoriesStore.put(filteredCategories, "categories");

      for (let index = 0; index < dependencyTaskIds.length; index += 1) {
        const dependencyTaskId = dependencyTaskIds[index];
        const dependencies = dependencyValues[index] ?? new Set<string>();

        if (existingTaskIds.has(dependencyTaskId)) {
          continue;
        }

        let changed = false;
        for (const removedTaskId of existingTaskIds) {
          if (dependencies.delete(removedTaskId)) {
            changed = true;
          }
        }

        if (!changed) {
          continue;
        }

        if (dependencies.size === 0) {
          await taskDependenciesStore.delete(dependencyTaskId);
          updatedDependencyEntries.push([dependencyTaskId, new Set<string>()]);
        } else {
          await taskDependenciesStore.put(dependencies, dependencyTaskId);
          updatedDependencyEntries.push([
            dependencyTaskId,
            new Set<string>(dependencies),
          ]);
        }
      }

      await tx.done;
      return {
        deletedTaskIds: Array.from(existingTaskIds),
        updatedDependencyEntries,
      };
    },
    onSuccess: ({ deletedTaskIds, updatedDependencyEntries }) => {
      queryClient.invalidateQueries({ queryKey: ["taskSet"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categoryTasks"] });
      queryClient.invalidateQueries({ queryKey: ["details"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({
        queryKey: ["dependencies"],
      });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
      queryClient.invalidateQueries({ queryKey: ["warnings"] });
      queryClient.invalidateQueries({ queryKey: ["hiddens"] });

      for (const [taskId, dependencies] of updatedDependencyEntries) {
        queryClient.setQueryData(
          ["task", "dependencies", taskId],
          dependencies,
        );
      }

      for (const taskId of deletedTaskIds) {
        queryClient.invalidateQueries({ queryKey: ["task", "detail", taskId] });
        queryClient.invalidateQueries({ queryKey: ["task", "tags", taskId] });
        queryClient.invalidateQueries({
          queryKey: ["task", "dependencies", taskId],
        });
        queryClient.invalidateQueries({
          queryKey: ["task", "completion", taskId],
        });
        queryClient.invalidateQueries({ queryKey: ["task", "hidden", taskId] });
        queryClient.invalidateQueries({
          queryKey: ["task", "warning", taskId],
        });
      }
    },
  });
}

export function useMoveTaskMutation() {
  return useMutation({
    mutationFn: async ({
      fromCategory,
      fromIndex,
      toCategory,
      toIndex,
    }: {
      fromCategory: string;
      fromIndex: number;
      toCategory: string;
      toIndex: number;
    }) => {
      const db = await getDb();
      // In a transaction:
      // - If categories are different, remove task id from old category.
      // - If new category doesn't exist, create it.
      // - If categories are different, add task to new category at the proper index.
      // - If categories are same, move task id to proper index within category.
      // - Update task's category in tasks store.
      // - If categories are different and old category is now empty, remove it from all store tables.
      const tx = db.transaction(
        [
          TASKS_STORE,
          CATEGORIES_STORE,
          CATEGORY_TASKS_STORE,
          CATEGORY_COLLAPSED_STORE,
        ],
        "readwrite",
      );

      const tasksStore = tx.objectStore(TASKS_STORE);
      const categoriesStore = tx.objectStore(CATEGORIES_STORE);
      const categoryTasksStore = tx.objectStore(CATEGORY_TASKS_STORE);
      const categoryHiddenStore = tx.objectStore(CATEGORY_COLLAPSED_STORE);

      const fromTaskIds = (await categoryTasksStore.get(fromCategory)) ?? [];
      const taskId = fromTaskIds[fromIndex];
      if (!taskId) {
        tx.abort();
        await tx.done.catch(() => undefined);
        return;
      }

      const task = await tasksStore.get(taskId);
      if (!task) {
        tx.abort();
        await tx.done.catch(() => undefined);
        return;
      }

      const isSameCategory = fromCategory === toCategory;

      const categories = (await categoriesStore.get("categories")) ?? [];
      const toTaskIds = isSameCategory
        ? fromTaskIds
        : ((await categoryTasksStore.get(toCategory)) ?? []);

      if (isSameCategory) {
        const withoutTask = toTaskIds.filter((id) => id !== taskId);
        const clampedIndex = Math.max(0, Math.min(toIndex, withoutTask.length));
        withoutTask.splice(clampedIndex, 0, taskId);
        await categoryTasksStore.put(withoutTask, toCategory);
      } else {
        let deletedCategory: string | undefined = undefined;
        let addedCategory: string | undefined = undefined;
        let nextCategories = categories;

        const nextFromTaskIds = fromTaskIds.filter((id) => id !== taskId);
        const nextToTaskIds = toTaskIds.filter((id) => id !== taskId);
        const clampedIndex = Math.max(
          0,
          Math.min(toIndex, nextToTaskIds.length),
        );
        nextToTaskIds.splice(clampedIndex, 0, taskId);

        if (nextFromTaskIds.length === 0) deletedCategory = fromCategory;
        if (nextToTaskIds.length === 1) addedCategory = toCategory;

        // Replace category task lists
        if (nextFromTaskIds.length > 0) {
          await categoryTasksStore.put(nextFromTaskIds, fromCategory);
        }
        await categoryTasksStore.put(nextToTaskIds, toCategory);

        // Remove categories from main list
        if (deletedCategory) {
          await categoryTasksStore.delete(deletedCategory);
          nextCategories = nextCategories.filter(
            (category) => category !== deletedCategory,
          );
        }

        if (addedCategory) {
          nextCategories.push(addedCategory);
        }

        await categoriesStore.put(nextCategories, "categories");

        // Remove hidden category state for removed categories
        if (deletedCategory) {
          const hiddenTaskCategories =
            (await categoryHiddenStore.get("task")) ?? new Set<string>();
          const hiddenEditCategories =
            (await categoryHiddenStore.get("edit")) ?? new Set<string>();

          hiddenTaskCategories.delete(deletedCategory);
          hiddenEditCategories.delete(deletedCategory);

          await categoryHiddenStore.put(hiddenTaskCategories, "task");
          await categoryHiddenStore.put(hiddenEditCategories, "edit");
        }
      }

      // Rewrite base task category
      await tasksStore.put({ ...task, category: toCategory }, taskId);

      await tx.done;
      return taskId;
    },
    onSuccess: (movedTaskId) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categoryTasks"] });
      queryClient.invalidateQueries({ queryKey: ["categoryHidden"] });
      if (movedTaskId) {
        queryClient.invalidateQueries({
          queryKey: ["task", "detail", movedTaskId],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["details"] });
    },
  });
}

export function useMoveCategoryMutation() {
  return useMutation({
    mutationFn: async ({
      fromIndex,
      toIndex,
    }: {
      fromIndex: number;
      toIndex: number;
    }) => {
      const db = await getDb();
      const categories = (await db.get(CATEGORIES_STORE, "categories")) ?? [];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= categories.length) {
        return;
      }
      const [movedCategory] = categories.splice(fromIndex, 1);
      categories.splice(toIndex, 0, movedCategory);
      await db.put(CATEGORIES_STORE, categories, "categories");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useTaskDetailMutation() {
  return useMutation({
    mutationFn: async (variables: {
      taskId: TaskId;
      title?: string | undefined;
      description?: string | undefined;
    }) => {
      const { taskId, title, description } = variables;
      const db = await getDb();
      const task = await db.get(TASKS_STORE, taskId);
      if (!task) {
        return;
      }
      if (title !== undefined) task.title = title;
      if (description !== undefined) task.description = description;

      await db.put(TASKS_STORE, task, taskId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "detail", variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["details"],
      });
    },
  });
}

export function useTaskWarningMutation() {
  return useMutation({
    mutationFn: async ({
      taskId,
      isWarning,
    }: {
      taskId: TaskId;
      isWarning: boolean;
    }) => {
      const db = await getDb();

      if (isWarning) {
        const tx = db.transaction(
          [TASK_WARNINGS_STORE, TASK_COMPLETION_STORE, TASK_DEPENDENCIES_STORE],
          "readwrite",
        );
        const warningsStore = tx.objectStore(TASK_WARNINGS_STORE);
        const completionStore = tx.objectStore(TASK_COMPLETION_STORE);
        const dependenciesStore = tx.objectStore(TASK_DEPENDENCIES_STORE);

        await warningsStore.put(true, taskId);
        await completionStore.delete(taskId);

        const dependencyTaskIds = await dependenciesStore.getAllKeys();
        const dependencyValues = await dependenciesStore.getAll();

        for (let index = 0; index < dependencyTaskIds.length; index += 1) {
          const dependencyTaskId = dependencyTaskIds[index];
          const dependencies = dependencyValues[index] ?? new Set<string>();
          if (!dependencies.delete(taskId)) {
            continue;
          }

          if (dependencies.size === 0) {
            await dependenciesStore.delete(dependencyTaskId);
          } else {
            await dependenciesStore.put(dependencies, dependencyTaskId);
          }
        }

        await tx.done;
        return;
      }

      await db.delete(TASK_WARNINGS_STORE, taskId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "warning", variables.taskId],
      });
      queryClient.invalidateQueries({ queryKey: ["warnings"] });
      queryClient.invalidateQueries({
        queryKey: ["task", "completion", variables.taskId],
      });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
      queryClient.invalidateQueries({ queryKey: ["dependencies"] });
    },
  });
}

export function useTaskDependenciesMutation() {
  return useMutation({
    mutationFn: async ({
      taskId,
      dependencies,
    }: {
      taskId: TaskId;
      dependencies: Set<string>;
    }) => {
      const db = await getDb();

      // Easy case, no cycle detection needed
      if (dependencies.size === 0) {
        await db.delete(TASK_DEPENDENCIES_STORE, taskId);
        return [taskId, new Set<string>(), null] as const;
      }

      // Run cycle detection here
      const tx = db.transaction([TASK_DEPENDENCIES_STORE], "readwrite");
      const dependenciesStore = tx.objectStore(TASK_DEPENDENCIES_STORE);

      console.log("Fetching ALL task dependencies for cycle detection");
      const dependencyTaskIds = await dependenciesStore.getAllKeys();
      const dependencyValues = await dependenciesStore.getAll();
      const dependencyGraph = fromKvPairsToMap(
        dependencyTaskIds,
        dependencyValues,
      );

      if (!dependencyGraph.has(taskId)) {
        dependencyGraph.set(taskId, new Set<string>());
      }

      if (detectCycle(dependencyGraph, taskId, dependencies)) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new Error("Dependency cycle detected");
      }

      await dependenciesStore.put(dependencies, taskId);

      await tx.done;

      return [taskId, dependencies, dependencyGraph] as const;
    },
    onSuccess: ([taskId, dependencies, dependencyGraph]) => {
      queryClient.setQueryData(["task", "dependencies", taskId], dependencies);
      if (dependencyGraph) {
        dependencyGraph.set(taskId, dependencies);
        queryClient.setQueryData(["dependencies"], dependencyGraph);
      } else {
        queryClient.invalidateQueries({
          queryKey: ["dependencies"],
        });
      }
    },
  });
}

export function useCategoryDependenciesMutation() {
  return useMutation({
    mutationFn: async ({
      category,
      dependencies,
    }: {
      category: CategoryName;
      dependencies: Set<TaskId>;
    }) => {
      const db = await getDb();

      if (dependencies.size === 0) {
        await db.delete(CATEGORY_DEPENDENCIES_STORE, category);
        return [category, new Set<TaskId>(), null] as const;
      }

      const tx = db.transaction([CATEGORY_DEPENDENCIES_STORE], "readwrite");
      const categoryDependenciesStore = tx.objectStore(
        CATEGORY_DEPENDENCIES_STORE,
      );

      await categoryDependenciesStore.put(dependencies, category);

      const categoryDependencyKeys =
        await categoryDependenciesStore.getAllKeys();
      const categoryDependencyValues = await categoryDependenciesStore.getAll();
      const categoryDependencyMap = fromKvPairsToMap(
        categoryDependencyKeys,
        categoryDependencyValues,
      );

      await tx.done;

      return [category, dependencies, categoryDependencyMap] as const;
    },
    onSuccess: ([category, dependencies, categoryDependencyMap]) => {
      queryClient.setQueryData(
        ["category", "dependencies", category],
        dependencies,
      );

      if (categoryDependencyMap) {
        categoryDependencyMap.set(category, dependencies);
        queryClient.setQueryData(
          ["categoryDependencies"],
          categoryDependencyMap,
        );
      } else {
        queryClient.invalidateQueries({
          queryKey: ["categoryDependencies"],
        });
      }
    },
  });
}

export function useTaskTagsMutation() {
  return useMutation({
    mutationFn: async ({
      taskId,
      tags,
    }: {
      taskId: TaskId;
      tags: Set<string>;
    }) => {
      const db = await getDb();
      if (tags.size === 0) {
        await db.delete(TASK_TAGS_STORE, taskId);
      } else {
        await db.put(TASK_TAGS_STORE, tags, taskId);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "tags", variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tags"],
      });
    },
  });
}

export function useTaskAddTagMutation() {
  return useMutation({
    mutationFn: async ({ taskId, tag }: { taskId: TaskId; tag: string }) => {
      if (!taskId || !tag) return;
      const trimmedTag = tag.trim();
      if (!trimmedTag) return;
      const db = await getDb();
      const tx = db.transaction([TASK_TAGS_STORE], "readwrite");
      const tagStore = tx.objectStore(TASK_TAGS_STORE);
      const existingTags = (await tagStore.get(taskId)) ?? new Set<string>();
      existingTags.add(trimmedTag);
      await tagStore.put(existingTags, taskId);
      await tx.done;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "tags", variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tags"],
      });
    },
  });
}

export function useTaskRemoveTagMutation() {
  return useMutation({
    mutationFn: async ({ taskId, tag }: { taskId: TaskId; tag: string }) => {
      if (!taskId || !tag) return;
      const trimmedTag = tag.trim();
      if (!trimmedTag) return;
      const db = await getDb();
      const tx = db.transaction([TASK_TAGS_STORE], "readwrite");
      const tagStore = tx.objectStore(TASK_TAGS_STORE);
      const existingTags = (await tagStore.get(taskId)) ?? new Set<string>();
      existingTags.delete(trimmedTag);
      if (existingTags.size === 0) {
        await tagStore.delete(taskId);
      } else {
        await tagStore.put(existingTags, taskId);
      }
      await tx.done;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "tags", variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tags"],
      });
    },
  });
}

export function useTaskHiddenMutation() {
  return useMutation({
    mutationFn: async ({
      taskId,
      isHidden,
    }: {
      taskId: TaskId;
      isHidden: boolean;
    }) => {
      if (!taskId) return;
      const db = await getDb();
      if (isHidden) {
        await db.put(TASK_HIDDEN_STORE, true, taskId);
      } else {
        await db.delete(TASK_HIDDEN_STORE, taskId);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "hidden", variables.taskId],
      });
      queryClient.invalidateQueries({ queryKey: ["hiddens"] });
    },
  });
}

export function useUnhideAllTasksMutation() {
  return useMutation({
    mutationFn: async () => {
      const db = await getDb();
      await db.clear(TASK_HIDDEN_STORE);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", "hidden"] });
      queryClient.invalidateQueries({ queryKey: ["hiddens"] });
    },
  });
}

export function useTaskCompletionMutation() {
  return useMutation({
    mutationFn: async ({
      taskId,
      isCompleted,
    }: {
      taskId: TaskId;
      isCompleted: boolean;
    }) => {
      const db = await getDb();
      const tx = db.transaction(
        [
          TASK_COMPLETION_STORE,
          TASK_WARNINGS_STORE,
          TASKS_STORE,
          CATEGORY_TASKS_STORE,
          CATEGORY_COLLAPSED_STORE,
          TASK_DEPENDENCIES_STORE,
        ],
        "readwrite",
      );

      const completionStore = tx.objectStore(TASK_COMPLETION_STORE);
      const warningsStore = tx.objectStore(TASK_WARNINGS_STORE);
      const tasksStore = tx.objectStore(TASKS_STORE);
      const categoryTasksStore = tx.objectStore(CATEGORY_TASKS_STORE);
      const categoryHiddenStore = tx.objectStore(CATEGORY_COLLAPSED_STORE);
      const dependenciesStore = tx.objectStore(TASK_DEPENDENCIES_STORE);

      if (isCompleted) {
        await completionStore.put(true, taskId);
      } else {
        await completionStore.delete(taskId);
      }

      const task = await tasksStore.get(taskId);
      if (!task) {
        await tx.done;
        return;
      }

      // If this completion caused a category to become fully completed, add the category to the hidden categories list
      const categoryTaskIds =
        (await categoryTasksStore.get(task.category)) ?? [];
      const completedTaskIds = new Set<string>(
        await completionStore.getAllKeys(),
      );
      const warningTaskIds = new Set<string>(await warningsStore.getAllKeys());

      let allCategoryTasksComplete = true;
      for (const categoryTaskId of categoryTaskIds) {
        if (warningTaskIds.has(categoryTaskId)) {
          const warningDependencies =
            (await dependenciesStore.get(categoryTaskId)) ?? new Set<string>();
          for (const dependencyId of warningDependencies) {
            if (!completedTaskIds.has(dependencyId)) {
              allCategoryTasksComplete = false;
              break;
            }
          }
        } else if (!completedTaskIds.has(categoryTaskId)) {
          allCategoryTasksComplete = false;
        }

        if (!allCategoryTasksComplete) {
          break;
        }
      }

      const hiddenTaskCategories =
        (await categoryHiddenStore.get("task")) ?? new Set<string>();
      if (allCategoryTasksComplete) {
        hiddenTaskCategories.add(task.category);
      }
      await categoryHiddenStore.put(hiddenTaskCategories, "task");

      await tx.done;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "completion", variables.taskId],
      });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
      queryClient.invalidateQueries({ queryKey: ["collapsedCategories"] });
    },
  });
}

export function useUncompleteAllTasksMutation() {
  return useMutation({
    mutationFn: async () => {
      const db = await getDb();
      await db.clear(TASK_COMPLETION_STORE);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", "completion"] });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
    },
  });
}

export function useClearDatabaseMutation() {
  return useMutation({
    mutationFn: async () => {
      const db = await getDb();
      const tx = db.transaction(
        [
          TASKS_STORE,
          TASK_TAGS_STORE,
          TASK_DEPENDENCIES_STORE,
          TASK_COMPLETION_STORE,
          TASK_WARNINGS_STORE,
          TASK_HIDDEN_STORE,
          CATEGORIES_STORE,
          CATEGORY_TASKS_STORE,
          CATEGORY_DEPENDENCIES_STORE,
          TAG_COLORS_STORE,
          CATEGORY_COLLAPSED_STORE,
        ],
        "readwrite",
      );

      await Promise.all([
        tx.objectStore(TASKS_STORE).clear(),
        tx.objectStore(TASK_TAGS_STORE).clear(),
        tx.objectStore(TASK_DEPENDENCIES_STORE).clear(),
        tx.objectStore(TASK_COMPLETION_STORE).clear(),
        tx.objectStore(TASK_WARNINGS_STORE).clear(),
        tx.objectStore(TASK_HIDDEN_STORE).clear(),
        tx.objectStore(CATEGORIES_STORE).clear(),
        tx.objectStore(CATEGORY_TASKS_STORE).clear(),
        tx.objectStore(CATEGORY_DEPENDENCIES_STORE).clear(),
        tx.objectStore(TAG_COLORS_STORE).clear(),
        tx.objectStore(CATEGORY_COLLAPSED_STORE).clear(),
      ]);

      await tx.done;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useCategoryCollapsedMutation() {
  return useMutation({
    mutationFn: async ({
      category,
      mode,
      isHidden,
    }: {
      category: string;
      mode: "task" | "edit";
      isHidden: boolean;
    }) => {
      const db = await getDb();
      const hiddenCategories =
        (await db.get(CATEGORY_COLLAPSED_STORE, mode)) ?? new Set<string>();

      if (isHidden) {
        hiddenCategories.add(category);
      } else {
        hiddenCategories.delete(category);
      }

      await db.put(CATEGORY_COLLAPSED_STORE, hiddenCategories, mode);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["collapsedCategories"],
      });
    },
  });
}

export function useTagColorMutation() {
  return useMutation({
    mutationFn: async ({
      tag,
      colorKey,
    }: {
      tag: string;
      colorKey: TagColorKey | null | undefined;
    }) => {
      const db = await getDb();
      if (colorKey) {
        await db.put(TAG_COLORS_STORE, colorKey, tag);
      } else {
        await db.delete(TAG_COLORS_STORE, tag);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tagColors"],
      });
    },
  });
}

//////////////// QUERIES

function getQueryArgs_categories() {
  return {
    queryKey: ["categories"],
    queryFn: async () => {
      console.log("Fetching category order");
      const db = await getDb();
      const categories = await db.get(CATEGORIES_STORE, "categories");
      if (categories === undefined) {
        return [];
      }
      return categories;
    },
  };
}

export function useCategoriesQuery() {
  return useQuery(getQueryArgs_categories());
}

function getQueryArgs_categoriesTasks() {
  return {
    queryKey: ["categoryTasks"],
    queryFn: async () => {
      console.log("Fetching ALL category task maps");
      const db = await getDb();
      const categoryKeys = await db.getAllKeys(CATEGORY_TASKS_STORE);
      const categoryValues = await db.getAll(CATEGORY_TASKS_STORE);
      return fromKvPairsToMap(categoryKeys, categoryValues);
    },
  };
}

export function useCategoriesTasksQuery() {
  return useQuery(getQueryArgs_categoriesTasks());
}

function getQueryArgs_categoryDependencies() {
  return {
    queryKey: ["categoryDependencies"],
    queryFn: async () => {
      console.log("Fetching ALL category dependencies");
      const db = await getDb();
      const categoryKeys = await db.getAllKeys(CATEGORY_DEPENDENCIES_STORE);
      const dependencyValues = await db.getAll(CATEGORY_DEPENDENCIES_STORE);
      const map = fromKvPairsToMap(categoryKeys, dependencyValues);

      for (const [category, dependencies] of map.entries()) {
        queryClient.setQueryData(
          ["category", "dependencies", category],
          dependencies,
        );
      }

      return map;
    },
  };
}

export function useCategoryDependenciesQuery() {
  return useQuery(getQueryArgs_categoryDependencies());
}

function getQueryArgs_dependencies() {
  return {
    queryKey: ["dependencies"],
    queryFn: async () => {
      console.log("Fetching ALL task dependencies");
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASK_DEPENDENCIES_STORE);
      const dependencies = await db.getAll(TASK_DEPENDENCIES_STORE);
      const map = fromKvPairsToMap(taskIds, dependencies);
      for (const [taskId, dependencies] of map.entries()) {
        queryClient.setQueryData(
          ["task", "dependencies", taskId],
          dependencies,
        );
      }

      return map;
    },
  };
}

export function useDependenciesQuery() {
  return useQuery(getQueryArgs_dependencies());
}

function getQueryArgs_completions() {
  return {
    queryKey: ["completions"],
    queryFn: async () => {
      console.log("Fetching ALL task completions");
      const db = await getDb();
      const allTasks = new Set<string>(
        await db.getAllKeys(TASK_COMPLETION_STORE),
      );
      for (const taskId of allTasks) {
        queryClient.setQueryData(["task", "completion", taskId], true);
      }
      return allTasks;
    },
  };
}

export function useCompletionsQuery() {
  return useQuery(getQueryArgs_completions());
}

function getQueryArgs_warnings() {
  return {
    queryKey: ["warnings"],
    queryFn: async () => {
      console.log("Fetching ALL task warnings");
      const db = await getDb();
      const allWarningTasks = new Set<string>(
        await db.getAllKeys(TASK_WARNINGS_STORE),
      );
      for (const taskId of allWarningTasks) {
        queryClient.setQueryData(["task", "warning", taskId], true);
      }
      return allWarningTasks;
    },
  };
}

export function useWarningsQuery() {
  return useQuery(getQueryArgs_warnings());
}

function getQueryArgs_details(enabled?: boolean) {
  return {
    queryKey: ["details"],
    enabled: enabled === undefined ? true : enabled,
    queryFn: async () => {
      console.log("Fetching ALL task details");
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASKS_STORE);
      const details = await db.getAll(TASKS_STORE);
      const map = fromKvPairsToMap(taskIds, details);
      for (const [taskId, detail] of map.entries()) {
        queryClient.setQueryData(["task", "detail", taskId], detail);
      }
      return map;
    },
  };
}

export function useDetailsQuery(enabled?: boolean) {
  return useQuery(getQueryArgs_details(enabled));
}

function getQueryArgs_taskSet() {
  return {
    queryKey: ["taskSet"],
    queryFn: async () => {
      console.log("Fetching taskSet");
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASKS_STORE);
      const taskSet = new Set<string>(taskIds);
      return taskSet;
    },
  };
}

export function useTaskSetQuery() {
  return useQuery(getQueryArgs_taskSet());
}

export function getQueryArgs_tags(enabled?: boolean) {
  return {
    queryKey: ["tags"],
    enabled: enabled === undefined ? true : enabled,
    queryFn: async () => {
      console.log("Fetching ALL tags");
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASK_TAGS_STORE);
      const tags = await db.getAll(TASK_TAGS_STORE);
      const map = fromKvPairsToMap(taskIds, tags);
      for (const [taskId, tags] of map.entries()) {
        queryClient.setQueryData(["task", "tags", taskId], tags);
      }
      return map;
    },
  };
}

export function useTagsQuery(enabled?: boolean) {
  return useQuery(getQueryArgs_tags(enabled));
}

export function useTaskDetailQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "detail", taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const db = await getDb();
      console.log("Fetching task detail for", taskId);
      const res = await db.get(TASKS_STORE, taskId);
      return res === undefined ? null : res;
    },
  });
}

export function useTaskTagsQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "tags", taskId],
    queryFn: async () => {
      const db = await getDb();
      const tags = await db.get(TASK_TAGS_STORE, taskId);
      if (tags === undefined) {
        return new Set<string>();
      }
      return tags;
    },
  });
}

export function useTaskDependenciesQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "dependencies", taskId],
    queryFn: async () => {
      const db = await getDb();
      const dependencies = await db.get(TASK_DEPENDENCIES_STORE, taskId);
      if (dependencies === undefined) {
        return new Set<string>();
      }
      return dependencies;
    },
  });
}

export function useCategoryDependencyQuery(category: CategoryName) {
  return useQuery({
    queryKey: ["category", "dependencies", category],
    queryFn: async () => {
      const db = await getDb();
      const dependencies = await db.get(CATEGORY_DEPENDENCIES_STORE, category);
      if (dependencies === undefined) {
        return new Set<TaskId>();
      }
      return dependencies;
    },
  });
}

export function useTaskCompletionQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "completion", taskId],
    queryFn: async () => {
      const db = await getDb();
      const isCompleted = await db.get(TASK_COMPLETION_STORE, taskId);
      return !!isCompleted;
    },
  });
}

export function useTaskWarningQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "warning", taskId],
    queryFn: async () => {
      const db = await getDb();
      const isWarning = await db.get(TASK_WARNINGS_STORE, taskId);
      return !!isWarning;
    },
  });
}

export function useTaskHiddenQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "hidden", taskId],
    queryFn: async () => {
      const db = await getDb();
      const isHidden = await db.get(TASK_HIDDEN_STORE, taskId);
      return !!isHidden;
    },
  });
}

function getQueryArgs_hiddens() {
  return {
    queryKey: ["hiddens"],
    queryFn: async () => {
      const db = await getDb();
      const allHiddenTasks = new Set<string>(
        await db.getAllKeys(TASK_HIDDEN_STORE),
      );
      return allHiddenTasks;
    },
    onSuccess: (hiddenTaskIds: Set<string>) => {
      for (const taskId of hiddenTaskIds) {
        queryClient.setQueryData(["task", "hidden", taskId], true);
      }
    },
  };
}

export function useTaskHiddensQuery() {
  return useQuery(getQueryArgs_hiddens());
}

export function useCollapsedCategoriesQuery() {
  return useQuery({
    queryKey: ["collapsedCategories"],
    queryFn: async () => {
      const db = await getDb();

      const hiddenTaskCategories =
        (await db.get(CATEGORY_COLLAPSED_STORE, "task")) ?? new Set<string>();
      const hiddenEditCategories =
        (await db.get(CATEGORY_COLLAPSED_STORE, "edit")) ?? new Set<string>();

      return { task: hiddenTaskCategories, edit: hiddenEditCategories };
    },
  });
}

export function useTagColorsQuery() {
  return useQuery({
    queryKey: ["tagColors"],
    queryFn: async () => {
      const db = await getDb();
      const colorKeys = await db.getAllKeys(TAG_COLORS_STORE);
      const colorValues = await db.getAll(TAG_COLORS_STORE);
      return fromKvPairsToMap(colorKeys, colorValues);
    },
  });
}

export function useAllKnownTagsQuery() {
  return useQuery({
    queryKey: ["allKnownTags"],
    queryFn: async () => {
      const db = await getDb();
      const tags = await db.getAll(TASK_TAGS_STORE);
      let allTags = new Set<string>();
      for (const tagSet of tags) {
        allTags = allTags.union(tagSet);
      }
      return allTags;
    },
  });
}

//////////// DERIVED DATA

export function useTaskStructure() {
  const taskSet = useTaskSetQuery();
  const categories = useCategoriesQuery();
  const categoryTasks = useCategoriesTasksQuery();

  return {
    taskSet: taskSet.data ?? new Set<string>(),
    categories: categories.data ?? [],
    categoryTasks: categoryTasks.data ?? new Map<string, string[]>(),
  };
}

export function useTasksWithCompleteDependencies(
  taskSet: Set<string> | undefined,
  dependencies: Map<string, Set<string>> | undefined,
  completions: Set<string> | undefined,
) {
  return useMemo(() => {
    if (!taskSet || !dependencies || !completions) {
      return new Set<string>();
    }

    const tasksWithCompleteDependencies = new Set<string>();

    for (const taskId of taskSet) {
      const taskDependencies = dependencies.get(taskId) ?? new Set<string>();
      let hasIncompleteDependency = false;
      for (const depId of taskDependencies) {
        if (!completions.has(depId)) {
          hasIncompleteDependency = true;
          break;
        }
      }
      if (!hasIncompleteDependency) {
        tasksWithCompleteDependencies.add(taskId);
      }
    }

    return tasksWithCompleteDependencies;
  }, [taskSet, dependencies, completions]);
}

export function useTasksMatchingSearch(searchQuery: string) {
  const taskSetQuery = useTaskSetQuery();
  const taskSet = taskSetQuery.data;
  const trimmedQuery = searchQuery.trim();
  const searchEnabled = trimmedQuery.length > 2;

  const detailsQuery = useDetailsQuery(searchEnabled);
  const tagsQuery = useTagsQuery(searchEnabled);

  return useMemo(() => {
    if (!taskSet) {
      return new Set<string>();
    }
    const details = detailsQuery.data;
    const tags = tagsQuery.data;

    // No search query, return all tasks
    if (!searchQuery) return taskSet;
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      return taskSet;
    }
    const lowerCaseSearchQuery = trimmedQuery.toLowerCase();
    const matchingTasks = new Set<string>();

    for (const taskId of taskSet) {
      const detail = details?.get(taskId);
      const taskTags = tags?.get(taskId);

      const categoryMatch = detail?.category
        .toLowerCase()
        .includes(lowerCaseSearchQuery);
      if (categoryMatch) {
        matchingTasks.add(taskId);
        continue;
      }

      const titleMatch = detail?.title
        .toLowerCase()
        .includes(lowerCaseSearchQuery);
      if (titleMatch) {
        matchingTasks.add(taskId);
        continue;
      }

      const descriptionMatch = detail?.description
        .toLowerCase()
        .includes(lowerCaseSearchQuery);
      if (descriptionMatch) {
        matchingTasks.add(taskId);
        continue;
      }
      const tagsMatch = taskTags
        ? Array.from(taskTags).some((tag) =>
            tag.toLowerCase().includes(lowerCaseSearchQuery),
          )
        : false;

      if (titleMatch || descriptionMatch || tagsMatch) {
        matchingTasks.add(taskId);
      }
    }

    return matchingTasks;
  }, [searchQuery, taskSet, detailsQuery.data, tagsQuery.data]);
}
