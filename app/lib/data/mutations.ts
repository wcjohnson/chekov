// React Query mutations

import { useMutation } from "@tanstack/react-query";
import {
  CATEGORIES_STORE,
  CATEGORY_COLLAPSED_STORE,
  CATEGORY_DEPENDENCIES_STORE,
  CATEGORY_TASKS_STORE,
  clearDb,
  getDb,
  queryClient,
  TAG_COLORS_STORE,
  TASK_COMPLETION_STORE,
  TASK_DEPENDENCIES_STORE,
  TASK_HIDDEN_STORE,
  TASK_REMINDERS_STORE,
  TASK_TAGS_STORE,
  TASKS_STORE,
} from "@/app/lib/data/store";
import {
  type CategoryName,
  type DependencyExpression,
  type TaskDetail,
  type TaskDependencies,
  type TaskId,
} from "@/app/lib/data/types";
import { normalizeDependencyExpression } from "@/app/lib/booleanExpression";
import {
  DependencyCycleError,
  detectCycle,
  fromKvPairsToMap,
} from "@/app/lib/utils";
import { getStoredTagColorKey, type TagColorKey } from "@/app/lib/tagColors";

const EMPTY_DEPENDENCY_SET = new Set<TaskId>();

function normalizeOptionalDependencyExpression(
  dependencyExpression: DependencyExpression | null | undefined,
): DependencyExpression | undefined {
  if (!dependencyExpression) {
    return undefined;
  }

  const normalized = normalizeDependencyExpression(dependencyExpression);
  if (normalized.taskSet.size === 0) {
    return undefined;
  }

  return normalized;
}

function normalizeTaskDependencies(
  taskDependencies: TaskDependencies,
): TaskDependencies | null {
  const openers = normalizeOptionalDependencyExpression(
    taskDependencies.openers,
  );
  const closers = normalizeOptionalDependencyExpression(
    taskDependencies.closers,
  );

  if (!openers && !closers) {
    return null;
  }

  return {
    ...(openers ? { openers } : null),
    ...(closers ? { closers } : null),
  };
}

export function useCreateTaskMutation() {
  return useMutation({
    mutationFn: async (category: string) => {
      const db = await getDb();
      const task: TaskDetail = {
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

      return task.id;
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
      const updatedDependencyEntries: Array<[TaskId, TaskDependencies | null]> =
        [];

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
          TASK_REMINDERS_STORE,
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
      const taskRemindersStore = tx.objectStore(TASK_REMINDERS_STORE);
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
          taskRemindersStore.delete(taskId),
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
        const existingTaskDependencies = dependencyValues[index];
        const openerDependencies = new Set(
          existingTaskDependencies?.openers?.taskSet ?? EMPTY_DEPENDENCY_SET,
        );
        const closerDependencies = new Set(
          existingTaskDependencies?.closers?.taskSet ?? EMPTY_DEPENDENCY_SET,
        );

        if (existingTaskIds.has(dependencyTaskId)) {
          continue;
        }

        let changed = false;
        for (const removedTaskId of existingTaskIds) {
          if (openerDependencies.delete(removedTaskId)) {
            changed = true;
          }

          if (closerDependencies.delete(removedTaskId)) {
            changed = true;
          }
        }

        if (!changed) {
          continue;
        }

        const normalizedTaskDependencies = normalizeTaskDependencies({
          openers:
            openerDependencies.size > 0
              ? {
                  ...(existingTaskDependencies?.openers ?? {}),
                  taskSet: openerDependencies,
                }
              : undefined,
          closers:
            closerDependencies.size > 0
              ? {
                  ...(existingTaskDependencies?.closers ?? {}),
                  taskSet: closerDependencies,
                }
              : undefined,
        });

        if (!normalizedTaskDependencies) {
          await taskDependenciesStore.delete(dependencyTaskId);
          updatedDependencyEntries.push([dependencyTaskId, null]);
        } else {
          await taskDependenciesStore.put(
            normalizedTaskDependencies,
            dependencyTaskId,
          );
          updatedDependencyEntries.push([
            dependencyTaskId,
            normalizedTaskDependencies,
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
      queryClient.invalidateQueries({ queryKey: ["allKnownTags"] });
      queryClient.invalidateQueries({
        queryKey: ["dependencies"],
      });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["hiddens"] });

      for (const [taskId, dependencyExpression] of updatedDependencyEntries) {
        queryClient.setQueryData(
          ["task", "dependencies", taskId],
          dependencyExpression,
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
          queryKey: ["task", "reminder", taskId],
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

export function useTaskReminderMutation() {
  return useMutation({
    mutationFn: async ({
      taskId,
      isReminder,
    }: {
      taskId: TaskId;
      isReminder: boolean;
    }) => {
      const db = await getDb();

      if (isReminder) {
        const tx = db.transaction(
          [TASK_REMINDERS_STORE, TASK_COMPLETION_STORE],
          "readwrite",
        );
        const remindersStore = tx.objectStore(TASK_REMINDERS_STORE);
        const completionStore = tx.objectStore(TASK_COMPLETION_STORE);

        await remindersStore.put(true, taskId);
        await completionStore.delete(taskId);

        await tx.done;
        return;
      }

      await db.delete(TASK_REMINDERS_STORE, taskId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", "reminder", variables.taskId],
      });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
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
      taskDependencies,
    }: {
      taskId: TaskId;
      taskDependencies: TaskDependencies;
    }) => {
      const db = await getDb();
      const persistedTaskDependencies =
        normalizeTaskDependencies(taskDependencies);

      // Easy case, no cycle detection needed
      if (!persistedTaskDependencies) {
        await db.delete(TASK_DEPENDENCIES_STORE, taskId);
        return [taskId, null, null] as const;
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

      const openerGraph = new Map<TaskId, Set<TaskId>>();
      const closerGraph = new Map<TaskId, Set<TaskId>>();
      for (const [
        graphTaskId,
        graphTaskDependencies,
      ] of dependencyGraph.entries()) {
        openerGraph.set(
          graphTaskId,
          graphTaskDependencies.openers?.taskSet ?? EMPTY_DEPENDENCY_SET,
        );
        closerGraph.set(
          graphTaskId,
          graphTaskDependencies.closers?.taskSet ?? EMPTY_DEPENDENCY_SET,
        );
      }

      const openerCycle = detectCycle(
        openerGraph,
        taskId,
        persistedTaskDependencies.openers?.taskSet ?? EMPTY_DEPENDENCY_SET,
      );

      if (openerCycle) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new DependencyCycleError(openerCycle, "openers");
      }

      const closerCycle = detectCycle(
        closerGraph,
        taskId,
        persistedTaskDependencies.closers?.taskSet ?? EMPTY_DEPENDENCY_SET,
      );

      if (closerCycle) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new DependencyCycleError(closerCycle, "closers");
      }

      await dependenciesStore.put(persistedTaskDependencies, taskId);

      await tx.done;

      return [taskId, persistedTaskDependencies, dependencyGraph] as const;
    },
    onSuccess: ([taskId, taskDependencies, dependencyGraph]) => {
      queryClient.setQueryData(
        ["task", "dependencies", taskId],
        taskDependencies,
      );
      if (dependencyGraph && taskDependencies) {
        dependencyGraph.set(taskId, taskDependencies);
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
      queryClient.invalidateQueries({
        queryKey: ["allKnownTags"],
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
      queryClient.invalidateQueries({
        queryKey: ["allKnownTags"],
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
      queryClient.invalidateQueries({
        queryKey: ["allKnownTags"],
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
          TASK_REMINDERS_STORE,
          TASKS_STORE,
          CATEGORY_TASKS_STORE,
          CATEGORY_COLLAPSED_STORE,
        ],
        "readwrite",
      );

      const completionStore = tx.objectStore(TASK_COMPLETION_STORE);
      const remindersStore = tx.objectStore(TASK_REMINDERS_STORE);
      const tasksStore = tx.objectStore(TASKS_STORE);
      const categoryTasksStore = tx.objectStore(CATEGORY_TASKS_STORE);
      const categoryHiddenStore = tx.objectStore(CATEGORY_COLLAPSED_STORE);

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
      const reminderTaskIds = new Set<string>(
        await remindersStore.getAllKeys(),
      );
      const allCategoryTasksComplete = categoryTaskIds.every(
        (categoryTaskId) =>
          reminderTaskIds.has(categoryTaskId) ||
          completedTaskIds.has(categoryTaskId),
      );

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
      await clearDb();
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
      const storedColorKey = getStoredTagColorKey(colorKey);
      if (storedColorKey) {
        await db.put(TAG_COLORS_STORE, storedColorKey, tag);
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
