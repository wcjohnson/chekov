import { openDB, type DBSchema } from "idb";
import type { TagColorKey } from "./tagColors";
import {
  QueryClient,
  useMutation,
  useQueries,
  useQuery,
} from "@tanstack/react-query";
import type { TaskId } from "./types";
import { fromKvPairsToRecord } from "./utils";
import { useMemo } from "react";

const DB_NAME = "chekov-db";
const DB_VERSION = 3;
export const TASKS_STORE = "tasks";
export const TASK_TAGS_STORE = "taskTags";
export const TASK_DEPENDENCIES_STORE = "taskDependencies";
export const TASK_COMPLETION_STORE = "taskCompletion";
export const TASK_HIDDEN_STORE = "taskHidden";
export const CATEGORIES_STORE = "categories";
export const CATEGORY_TASKS_STORE = "categoryTasks";
export const TAG_COLORS_STORE = "tagColors";
export const CATEGORY_HIDDEN_STORE = "categoryHidden";

export type StoredTask = {
  id: string;
  title: string;
  description: string;
  category: string;
};

interface ChekovDB extends DBSchema {
  [TASKS_STORE]: {
    key: string;
    value: StoredTask;
  };
  [TASK_TAGS_STORE]: {
    key: string;
    value: Set<string>;
  };
  [TASK_DEPENDENCIES_STORE]: {
    key: string;
    value: Set<string>;
  };
  [TASK_COMPLETION_STORE]: {
    key: string;
    value: true;
  };
  [TASK_HIDDEN_STORE]: {
    key: string;
    value: true;
  };
  [CATEGORIES_STORE]: {
    key: "categories";
    value: string[];
  };
  [CATEGORY_TASKS_STORE]: {
    key: string;
    value: string[];
  };
  [TAG_COLORS_STORE]: {
    key: string;
    value: TagColorKey;
  };
  [CATEGORY_HIDDEN_STORE]: {
    key: "task" | "edit";
    value: Set<string>;
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
        db.createObjectStore(TASK_HIDDEN_STORE);
        db.createObjectStore(CATEGORIES_STORE);
        db.createObjectStore(CATEGORY_TASKS_STORE);
        db.createObjectStore(TAG_COLORS_STORE);
        db.createObjectStore(CATEGORY_HIDDEN_STORE);
      },
    });
  }

  return dbPromise;
};

export const queryClient = new QueryClient();

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
      const taskHiddenStore = tx.objectStore(TASK_HIDDEN_STORE);
      const categoriesStore = tx.objectStore(CATEGORIES_STORE);
      const categoryTasksStore = tx.objectStore(CATEGORY_TASKS_STORE);

      const deleteTaskIds = new Set(taskIds.filter(Boolean));
      if (deleteTaskIds.size === 0) {
        await tx.done;
        return [] as TaskId[];
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
        return [] as TaskId[];
      }

      const dependencyTaskIds = await taskDependenciesStore.getAllKeys();
      const dependencyValues = await taskDependenciesStore.getAll();

      await Promise.all(
        Array.from(existingTaskIds).flatMap((taskId) => [
          tasksStore.delete(taskId),
          taskTagsStore.delete(taskId),
          taskDependenciesStore.delete(taskId),
          taskCompletionStore.delete(taskId),
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
        } else {
          await taskDependenciesStore.put(dependencies, dependencyTaskId);
        }
      }

      await tx.done;
      return Array.from(existingTaskIds);
    },
    onSuccess: (deletedTaskIds) => {
      queryClient.invalidateQueries({ queryKey: ["taskSet"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categoryTasks"] });
      queryClient.invalidateQueries({ queryKey: ["details"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({
        queryKey: ["dependencies"],
      });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
      queryClient.invalidateQueries({ queryKey: ["hiddens"] });

      for (const taskId of deletedTaskIds) {
        queryClient.invalidateQueries({ queryKey: ["task", "detail", taskId] });
        queryClient.invalidateQueries({ queryKey: ["task", "tags", taskId] });
        queryClient.invalidateQueries({
          queryKey: ["task", "completion", taskId],
        });
        queryClient.invalidateQueries({ queryKey: ["task", "hidden", taskId] });
      }
    },
  });
}

export function useMoveTaskMutation() {
  return useMutation({
    mutationFn: async ({
      taskId,
      fromCategory,
      toCategory,
      toIndex,
    }: {
      taskId: TaskId;
      fromCategory: string;
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
          CATEGORY_HIDDEN_STORE,
        ],
        "readwrite",
      );

      const tasksStore = tx.objectStore(TASKS_STORE);
      const categoriesStore = tx.objectStore(CATEGORIES_STORE);
      const categoryTasksStore = tx.objectStore(CATEGORY_TASKS_STORE);
      const categoryHiddenStore = tx.objectStore(CATEGORY_HIDDEN_STORE);

      const task = await tasksStore.get(taskId);
      if (!task) {
        await tx.done;
        throw new Error("Task not found");
      }

      const actualFromCategory = task.category ?? fromCategory;
      const isSameCategory = actualFromCategory === toCategory;

      const categories = (await categoriesStore.get("categories")) ?? [];

      const fromTaskIds =
        (await categoryTasksStore.get(actualFromCategory)) ?? [];
      const toTaskIds = isSameCategory
        ? fromTaskIds
        : ((await categoryTasksStore.get(toCategory)) ?? []);

      if (isSameCategory) {
        const withoutTask = toTaskIds.filter((id) => id !== taskId);
        const clampedIndex = Math.max(0, Math.min(toIndex, withoutTask.length));
        withoutTask.splice(clampedIndex, 0, taskId);
        await categoryTasksStore.put(withoutTask, toCategory);
      } else {
        const nextFromTaskIds = fromTaskIds.filter((id) => id !== taskId);

        const nextToTaskIds = toTaskIds.filter((id) => id !== taskId);
        const clampedIndex = Math.max(
          0,
          Math.min(toIndex, nextToTaskIds.length),
        );
        nextToTaskIds.splice(clampedIndex, 0, taskId);

        if (nextFromTaskIds.length > 0) {
          await categoryTasksStore.put(nextFromTaskIds, actualFromCategory);
        } else {
          await categoryTasksStore.delete(actualFromCategory);
        }

        await categoryTasksStore.put(nextToTaskIds, toCategory);

        const nextCategories = categories.filter(
          (category) => category !== actualFromCategory,
        );
        if (!nextCategories.includes(toCategory)) {
          nextCategories.push(toCategory);
        }
        await categoriesStore.put(nextCategories, "categories");

        if (nextFromTaskIds.length === 0) {
          const hiddenTaskCategories =
            (await categoryHiddenStore.get("task")) ?? new Set<string>();
          const hiddenEditCategories =
            (await categoryHiddenStore.get("edit")) ?? new Set<string>();

          hiddenTaskCategories.delete(actualFromCategory);
          hiddenEditCategories.delete(actualFromCategory);

          await categoryHiddenStore.put(hiddenTaskCategories, "task");
          await categoryHiddenStore.put(hiddenEditCategories, "edit");
        }
      }

      await tasksStore.put({ ...task, category: toCategory }, taskId);

      await tx.done;
    },
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["categoryTasks"] });
      queryClient.invalidateQueries({ queryKey: ["categoryHidden"] });
      queryClient.invalidateQueries({
        queryKey: ["task", "detail", variables.taskId],
      });
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
    mutationFn: async ({
      taskId,
      title,
      description,
    }: {
      taskId: TaskId;
      title?: string | undefined;
      description?: string | undefined;
    }) => {
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
      if (dependencies.size === 0) {
        await db.delete(TASK_DEPENDENCIES_STORE, taskId);
      } else {
        await db.put(TASK_DEPENDENCIES_STORE, dependencies, taskId);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "dependencies", variables.taskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dependencies"],
      });
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
      if (isCompleted) {
        await db.put(TASK_COMPLETION_STORE, true, taskId);
      } else {
        await db.delete(TASK_COMPLETION_STORE, taskId);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "completion", variables.taskId],
      });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
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

export function useCategoryHiddenMutation() {
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
        (await db.get(CATEGORY_HIDDEN_STORE, mode)) ?? new Set<string>();

      if (isHidden) {
        hiddenCategories.add(category);
      } else {
        hiddenCategories.delete(category);
      }

      await db.put(CATEGORY_HIDDEN_STORE, hiddenCategories, mode);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["hiddenCategories"],
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

function getQueryArgs_taskSet() {
  return {
    queryKey: ["taskSet"],
    queryFn: async () => {
      const db = await getDb();
      const allTasks = await db.getAllKeys(TASKS_STORE);
      return new Set<string>(allTasks);
    },
  };
}

export function useTaskSet() {
  return useQuery(getQueryArgs_taskSet());
}

function getQueryArgs_categories() {
  return {
    queryKey: ["categories"],
    queryFn: async () => {
      const db = await getDb();
      const categories = await db.get(CATEGORIES_STORE, "categories");
      if (categories === undefined) {
        return [];
      }
      return categories;
    },
  };
}

export function useCategories() {
  return useQuery(getQueryArgs_categories());
}

function getQueryArgs_categoriesTasks() {
  return {
    queryKey: ["categoryTasks"],
    queryFn: async () => {
      const db = await getDb();
      const categoryKeys = await db.getAllKeys(CATEGORY_TASKS_STORE);
      const categoryValues = await db.getAll(CATEGORY_TASKS_STORE);
      return fromKvPairsToRecord(categoryKeys, categoryValues);
    },
  };
}

export function useCategoriesTasks() {
  return useQuery(getQueryArgs_categoriesTasks());
}

function getQueryArgs_dependencies() {
  return {
    queryKey: ["dependencies"],
    queryFn: async () => {
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASK_DEPENDENCIES_STORE);
      const dependencies = await db.getAll(TASK_DEPENDENCIES_STORE);
      return fromKvPairsToRecord(taskIds, dependencies);
    },
  };
}

export function useDependencies() {
  return useQuery(getQueryArgs_dependencies());
}

function getQueryArgs_completions() {
  return {
    queryKey: ["completions"],
    queryFn: async () => {
      const db = await getDb();
      const allTasks = new Set<string>(
        await db.getAllKeys(TASK_COMPLETION_STORE),
      );
      return allTasks;
    },
  };
}

export function useCompletions() {
  return useQuery(getQueryArgs_completions());
}

function getQueryArgs_details() {
  return {
    queryKey: ["details"],
    queryFn: async () => {
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASKS_STORE);
      const details = await db.getAll(TASKS_STORE);
      return fromKvPairsToRecord(taskIds, details);
    },
  };
}

export function useDetails() {
  return useQuery(getQueryArgs_details());
}

export function getQueryArgs_tags() {
  return {
    queryKey: ["tags"],
    queryFn: async () => {
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASK_TAGS_STORE);
      const tags = await db.getAll(TASK_TAGS_STORE);
      return fromKvPairsToRecord(taskIds, tags);
    },
  };
}

export function useTags() {
  return useQuery(getQueryArgs_tags());
}

export function useTasksWithCompleteDependencies(
  taskSet: Set<string> | undefined,
  dependencies: Record<string, Set<string>> | undefined,
  completions: Set<string> | undefined,
) {
  return useMemo(() => {
    if (!taskSet || !dependencies || !completions) {
      return new Set<string>();
    }

    const tasksWithCompleteDependencies = new Set<string>();

    for (const taskId of taskSet) {
      const taskDependencies = dependencies[taskId] ?? new Set<string>();
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

export function useTasksMatchingSearch(
  taskSet: Set<string> | undefined,
  details: Record<string, StoredTask> | undefined,
  tags: Record<string, Set<string>> | undefined,
  searchQuery: string,
) {
  return useMemo(() => {
    if (!taskSet) {
      return new Set<string>();
    }

    // No search query, return all tasks
    if (!searchQuery) return taskSet;
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      return taskSet;
    }
    const lowerCaseSearchQuery = trimmedQuery.toLowerCase();
    const matchingTasks = new Set<string>();

    for (const taskId of taskSet) {
      const detail = details ? details[taskId] : undefined;
      const taskTags = tags ? tags[taskId] : undefined;

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
  }, [taskSet, details, tags, searchQuery]);
}

export function useTaskDetail(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "detail", taskId],
    queryFn: async () => {
      const db = await getDb();
      return db.get(TASKS_STORE, taskId);
    },
  });
}

export function useTaskTags(taskId: TaskId) {
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

export function useTaskDependencies(taskId: TaskId) {
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

export function useTaskCompletion(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "completion", taskId],
    queryFn: async () => {
      const db = await getDb();
      const isCompleted = await db.get(TASK_COMPLETION_STORE, taskId);
      return !!isCompleted;
    },
  });
}

export function useTaskHidden(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "hidden", taskId],
    queryFn: async () => {
      const db = await getDb();
      const isHidden = await db.get(TASK_HIDDEN_STORE, taskId);
      return !!isHidden;
    },
  });
}

export function useTaskHiddens() {
  return useQuery({
    queryKey: ["hiddens"],
    queryFn: async () => {
      const db = await getDb();
      const allHiddenTasks = new Set<string>(
        await db.getAllKeys(TASK_HIDDEN_STORE),
      );
      return allHiddenTasks;
    },
  });
}

export function useHiddenCategories() {
  return useQuery({
    queryKey: ["hiddenCategories"],
    queryFn: async () => {
      const db = await getDb();

      const hiddenTaskCategories =
        (await db.get("categoryHidden", "task")) ?? new Set<string>();
      const hiddenEditCategories =
        (await db.get("categoryHidden", "edit")) ?? new Set<string>();

      return { task: hiddenTaskCategories, edit: hiddenEditCategories };
    },
  });
}

export function useTagColors() {
  return useQuery({
    queryKey: ["tagColors"],
    queryFn: async () => {
      const db = await getDb();
      const colorKeys = await db.getAllKeys(TAG_COLORS_STORE);
      const colorValues = await db.getAll(TAG_COLORS_STORE);
      return fromKvPairsToRecord(colorKeys, colorValues);
    },
  });
}

export function useAllKnownTags() {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function combineTaskStructureQueries(results: any[]) {
  const [taskSet, categories, categoryTasks] = results;
  return {
    taskSet: (taskSet.data as Set<string>) ?? new Set<string>(),
    categories: (categories.data as string[]) ?? [],
    categoryTasks: (categoryTasks.data as Record<string, string[]>) ?? {},
    pending: results.some((result) => result.isPending),
  };
}

export function useTaskStructure() {
  return useQueries({
    queries: [
      getQueryArgs_taskSet(),
      getQueryArgs_categories(),
      getQueryArgs_categoriesTasks(),
    ],
    combine: combineTaskStructureQueries,
  });
}
