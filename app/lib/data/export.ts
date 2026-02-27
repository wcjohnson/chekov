import { fromKvPairsToMap, mapToRecord, recordToMap } from "@/app/lib/utils";
import {
  CATEGORIES_STORE,
  CATEGORY_DEPENDENCIES_STORE,
  CATEGORY_COLLAPSED_STORE,
  CATEGORY_TASKS_STORE,
  getDb,
  queryClient,
  TAG_COLORS_STORE,
  TASK_COMPLETION_STORE,
  TASK_DEPENDENCIES_STORE,
  TASK_HIDDEN_STORE,
  TASK_TAGS_STORE,
  TASK_REMINDERS_STORE,
  TASKS_STORE,
} from "@/app/lib/data/store";
import { getStoredTagColorKey, type TagColorKey } from "@/app/lib/tagColors";
import {
  type CategoryName,
  type DependencyExpression,
  type TaskDependencies,
  type TaskId,
} from "@/app/lib/data/types";
import {
  normalizeBooleanExpression,
  normalizeDependencyExpression as normalizeStoredDependencyExpression,
} from "../booleanExpression";
import type {
  ExportedChecklistDefinition,
  ExportedDependencyExpression,
  ExportedChecklistState,
  ExportedChecklistTaskState,
  ExportedTaskDefinition,
} from "./jsonSchema";

const isReminderType = (type: ExportedTaskDefinition["type"]): boolean =>
  type === "warning" || type === "reminder";

function normalizeExportedDependencyExpression(
  exportedDependencyExpression: ExportedDependencyExpression | undefined,
  allTaskIds: Set<TaskId>,
  currentTaskId: TaskId,
): DependencyExpression | undefined {
  const normalizedDependencies = Array.from(
    new Set<TaskId>(
      Array.from(exportedDependencyExpression?.tasks ?? []).filter(
        (dependencyId) =>
          dependencyId !== currentTaskId && allTaskIds.has(dependencyId),
      ),
    ),
  );

  const dependencyIdSet = new Set(normalizedDependencies);
  const normalizedExpression = normalizeBooleanExpression(
    exportedDependencyExpression?.expression,
    dependencyIdSet,
  );

  const normalizedStoredDependencyExpression =
    normalizeStoredDependencyExpression({
      taskSet: dependencyIdSet,
      ...(normalizedExpression ? { expression: normalizedExpression } : {}),
    });

  if (normalizedStoredDependencyExpression.taskSet.size === 0) {
    return undefined;
  }

  return normalizedStoredDependencyExpression;
}

function normalizeTaskDependencies(
  openers: DependencyExpression | undefined,
  closers: DependencyExpression | undefined,
): TaskDependencies | undefined {
  const normalizedOpeners = openers;
  const normalizedClosers = closers;

  if (!normalizedOpeners && !normalizedClosers) {
    return undefined;
  }

  return {
    ...(normalizedOpeners ? { openers: normalizedOpeners } : {}),
    ...(normalizedClosers ? { closers: normalizedClosers } : {}),
  };
}

function normalizeChecklistDefinition(
  definition: ExportedChecklistDefinition,
): ExportedChecklistDefinition {
  // Remove tags for tasks that don't exist
  // Remove dependencies for tasks that don't exist
  // Remove empty categories.
  // Remove tag colors for tags which arent used by any task.
  const tasksByCategoryEntries = Object.entries(definition.tasksByCategory);
  const normalizedTasksByCategory = new Map<string, ExportedTaskDefinition[]>();

  const allTaskIds = new Set<TaskId>();
  for (const [, tasks] of tasksByCategoryEntries) {
    for (const task of tasks ?? []) {
      allTaskIds.add(task.id);
    }
  }

  for (const [category, tasks] of tasksByCategoryEntries) {
    normalizedTasksByCategory.set(
      category,
      (tasks ?? []).map((task) => {
        const normalizedType = isReminderType(task.type) ? "reminder" : "task";
        const normalizedDescription = task.description ?? "";
        const normalizedDependencies = Array.from(
          new Set<TaskId>(
            Array.from(task.dependencies ?? []).filter(
              (dependencyId) =>
                dependencyId !== task.id && allTaskIds.has(dependencyId),
            ),
          ),
        );
        const normalizedLegacyOpeners = normalizeExportedDependencyExpression(
          {
            tasks: normalizedDependencies,
            ...(task.dependencyExpression
              ? { expression: task.dependencyExpression }
              : {}),
          },
          allTaskIds,
          task.id,
        );

        const normalizedLegacyClosers =
          normalizedType === "reminder" ? normalizedLegacyOpeners : undefined;

        const normalizedOpeners =
          normalizeExportedDependencyExpression(
            task.openers,
            allTaskIds,
            task.id,
          ) ??
          (normalizedType === "reminder" ? undefined : normalizedLegacyOpeners);
        const normalizedClosers =
          normalizeExportedDependencyExpression(
            task.closers,
            allTaskIds,
            task.id,
          ) ?? normalizedLegacyClosers;
        const normalizedTaskDependencies = normalizeTaskDependencies(
          normalizedOpeners,
          normalizedClosers,
        );
        const normalizedTaskOpeners = normalizedTaskDependencies?.openers;
        const normalizedTaskClosers = normalizedTaskDependencies?.closers;

        const normalizedTags = Array.from(
          new Set(
            Array.from(task.tags ?? []).filter(
              (tag): tag is string => typeof tag === "string" && tag.length > 0,
            ),
          ),
        );

        return {
          id: task.id,
          category: task.category,
          title: task.title,
          ...(normalizedDescription.length > 0
            ? { description: normalizedDescription }
            : {}),
          ...(normalizedType === "reminder"
            ? { type: "reminder" as const }
            : {}),
          ...(normalizedTaskOpeners?.taskSet.size
            ? {
                openers: {
                  tasks: Array.from(normalizedTaskOpeners.taskSet),
                  ...(normalizedTaskOpeners.expression
                    ? {
                        expression: normalizedTaskOpeners.expression,
                      }
                    : {}),
                },
              }
            : {}),
          ...(normalizedTaskClosers?.taskSet.size
            ? {
                closers: {
                  tasks: Array.from(normalizedTaskClosers.taskSet),
                  ...(normalizedTaskClosers.expression
                    ? {
                        expression: normalizedTaskClosers.expression,
                      }
                    : {}),
                },
              }
            : {}),
          ...(normalizedTags.length > 0 ? { tags: normalizedTags } : {}),
        };
      }),
    );
  }

  const categories = definition.categories.filter(
    (category) => (normalizedTasksByCategory.get(category) ?? []).length > 0,
  );

  const filteredTasksByCategory = new Map<string, ExportedTaskDefinition[]>();
  for (const category of categories) {
    filteredTasksByCategory.set(
      category,
      normalizedTasksByCategory.get(category) ?? [],
    );
  }

  const usedTags = new Set<string>();
  for (const tasks of filteredTasksByCategory.values()) {
    for (const task of tasks) {
      for (const tag of task.tags ?? []) {
        usedTags.add(tag);
      }
    }
  }

  const tagColorEntries = Object.entries(definition.tagColors ?? {});
  const normalizedTagColors = new Map<string, TagColorKey>();
  for (const [tag, color] of tagColorEntries) {
    const storedColorKey = getStoredTagColorKey(color);
    if (usedTags.has(tag) && storedColorKey) {
      normalizedTagColors.set(tag, storedColorKey);
    }
  }

  const normalizedCategoryDependencies = new Map<CategoryName, TaskId[]>();
  const inputCategoryDependencies = recordToMap(
    definition.categoryDependencies ?? {},
  );

  for (const category of categories) {
    const categoryDependencies = inputCategoryDependencies.get(category) ?? [];
    const normalizedDependencies = Array.from(
      new Set(
        categoryDependencies.filter((taskId): taskId is TaskId =>
          allTaskIds.has(taskId),
        ),
      ),
    );

    if (normalizedDependencies.length > 0) {
      normalizedCategoryDependencies.set(category, normalizedDependencies);
    }
  }

  return {
    categories,
    tasksByCategory: mapToRecord(filteredTasksByCategory),
    tagColors: mapToRecord(normalizedTagColors),
    categoryDependencies: mapToRecord(normalizedCategoryDependencies),
  };
}

function normalizeChecklistState(
  state: ExportedChecklistState,
  normalizedDefinition: ExportedChecklistDefinition,
): ExportedChecklistState {
  // Remove state for tasks that don't exist in the definition.
  // Remove category visibility state for categories that don't exist in the definition.
  const definitionTasksByCategory = recordToMap(
    normalizedDefinition.tasksByCategory,
  );

  const validTaskIds = new Set<TaskId>();
  for (const tasks of definitionTasksByCategory.values()) {
    for (const task of tasks ?? []) {
      validTaskIds.add(task.id);
    }
  }

  const taskStateMap = recordToMap(state.tasks ?? {});

  const normalizedTasks = new Map<TaskId, ExportedChecklistTaskState>();
  for (const [taskId, taskState] of taskStateMap.entries()) {
    if (!validTaskIds.has(taskId)) {
      continue;
    }

    normalizedTasks.set(taskId, {
      completed: Boolean(taskState?.completed),
      explicitlyHidden: Boolean(taskState?.explicitlyHidden),
    });
  }

  const validCategories = new Set(normalizedDefinition.categories);

  const taskVisibilityMap = recordToMap(state.categoryVisibilityByMode?.task);
  const editVisibilityMap = recordToMap(state.categoryVisibilityByMode?.edit);

  const normalizedTaskVisibility = new Map<string, boolean>();
  const normalizedEditVisibility = new Map<string, boolean>();

  for (const [category, isVisible] of taskVisibilityMap.entries()) {
    if (validCategories.has(category)) {
      normalizedTaskVisibility.set(category, Boolean(isVisible));
    }
  }

  for (const [category, isVisible] of editVisibilityMap.entries()) {
    if (validCategories.has(category)) {
      normalizedEditVisibility.set(category, Boolean(isVisible));
    }
  }

  return {
    tasks: mapToRecord(normalizedTasks),
    categoryVisibilityByMode: {
      task: mapToRecord(normalizedTaskVisibility),
      edit: mapToRecord(normalizedEditVisibility),
    },
  };
}

export async function exportChecklistDefinition(): Promise<ExportedChecklistDefinition> {
  const db = await getDb();

  const [
    taskKeys,
    taskValues,
    taskTagKeys,
    taskTagValues,
    taskDependencyKeys,
    taskDependencyExpressionValues,
    reminderTaskKeys,
    reminderTaskValues,
    maybeCategories,
    categoryTaskKeys,
    categoryTaskValues,
    categoryDependencyKeys,
    categoryDependencyValues,
    tagColorKeys,
    tagColorValues,
  ] = await Promise.all([
    db.getAllKeys(TASKS_STORE),
    db.getAll(TASKS_STORE),
    db.getAllKeys(TASK_TAGS_STORE),
    db.getAll(TASK_TAGS_STORE),
    db.getAllKeys(TASK_DEPENDENCIES_STORE),
    db.getAll(TASK_DEPENDENCIES_STORE),
    db.getAllKeys(TASK_REMINDERS_STORE),
    db.getAll(TASK_REMINDERS_STORE),
    db.get(CATEGORIES_STORE, "categories"),
    db.getAllKeys(CATEGORY_TASKS_STORE),
    db.getAll(CATEGORY_TASKS_STORE),
    db.getAllKeys(CATEGORY_DEPENDENCIES_STORE),
    db.getAll(CATEGORY_DEPENDENCIES_STORE),
    db.getAllKeys(TAG_COLORS_STORE),
    db.getAll(TAG_COLORS_STORE),
  ]);

  const categories = maybeCategories ?? [];
  const taskMap = fromKvPairsToMap(taskKeys, taskValues);
  const taskTagsMap = fromKvPairsToMap(taskTagKeys, taskTagValues);
  const taskDependenciesMap = fromKvPairsToMap(
    taskDependencyKeys,
    taskDependencyExpressionValues,
  );
  const reminderTasksMap = fromKvPairsToMap(
    reminderTaskKeys,
    reminderTaskValues,
  );
  const categoryTasksMap = fromKvPairsToMap(
    categoryTaskKeys,
    categoryTaskValues,
  );
  const categoryDependenciesMap = fromKvPairsToMap(
    categoryDependencyKeys,
    categoryDependencyValues,
  );
  const tagColorsMap = fromKvPairsToMap(tagColorKeys, tagColorValues);

  const tasksByCategory = new Map<string, ExportedTaskDefinition[]>();
  categories.forEach((category) => {
    const taskIds = categoryTasksMap.get(category) ?? [];
    const categoryTasks: ExportedTaskDefinition[] = [];

    for (const taskId of taskIds) {
      const task = taskMap.get(taskId);
      if (!task) {
        continue;
      }

      const taskDependencies = taskDependenciesMap.get(taskId);
      const taskTags = taskTagsMap.get(taskId) ?? new Set<string>();
      const taskOpeners = taskDependencies?.openers;
      const taskClosers = taskDependencies?.closers;

      categoryTasks.push({
        id: taskId,
        category,
        title: task.title,
        ...(task.description.length > 0
          ? { description: task.description }
          : {}),
        ...(reminderTasksMap.has(taskId) ? { type: "reminder" as const } : {}),
        ...(taskOpeners?.taskSet.size
          ? {
              openers: {
                tasks: Array.from(taskOpeners.taskSet),
                ...(taskOpeners.expression
                  ? { expression: taskOpeners.expression }
                  : {}),
              },
            }
          : {}),
        ...(taskClosers?.taskSet.size
          ? {
              closers: {
                tasks: Array.from(taskClosers.taskSet),
                ...(taskClosers.expression
                  ? { expression: taskClosers.expression }
                  : {}),
              },
            }
          : {}),
        ...(Array.from(taskTags).length > 0
          ? { tags: Array.from(taskTags) }
          : {}),
      });
    }

    tasksByCategory.set(category, categoryTasks);
  });

  const categoryDependencies = new Map<CategoryName, TaskId[]>();
  for (const category of categories) {
    const dependencies =
      categoryDependenciesMap.get(category) ?? new Set<TaskId>();
    const dependencyList = Array.from(dependencies);
    if (dependencyList.length > 0) {
      categoryDependencies.set(category, dependencyList);
    }
  }

  return normalizeChecklistDefinition({
    categories,
    tasksByCategory: mapToRecord(tasksByCategory),
    tagColors: mapToRecord(tagColorsMap),
    categoryDependencies: mapToRecord(categoryDependencies),
  });
}

export async function exportChecklistState(): Promise<ExportedChecklistState> {
  const definition = await exportChecklistDefinition();
  const db = await getDb();

  const [
    taskCompletionKeys,
    taskCompletionValues,
    hiddenTaskKeys,
    maybeVisibilityTask,
    maybeVisibilityEdit,
  ] = await Promise.all([
    db.getAllKeys(TASK_COMPLETION_STORE),
    db.getAll(TASK_COMPLETION_STORE),
    db.getAllKeys(TASK_HIDDEN_STORE),
    db.get(CATEGORY_COLLAPSED_STORE, "task"),
    db.get(CATEGORY_COLLAPSED_STORE, "edit"),
  ]);
  const visibilityTask = maybeVisibilityTask ?? new Set<string>();
  const visibilityEdit = maybeVisibilityEdit ?? new Set<string>();
  const hiddenTaskSet = new Set(hiddenTaskKeys);

  const taskCompletionMap = fromKvPairsToMap(
    taskCompletionKeys,
    taskCompletionValues,
  );
  const definitionTasksByCategory = recordToMap(definition.tasksByCategory);

  const reminderTaskIds = new Set<TaskId>();
  for (const tasks of definitionTasksByCategory.values()) {
    for (const task of tasks ?? []) {
      if (isReminderType(task.type)) {
        reminderTaskIds.add(task.id);
      }
    }
  }

  const tasks = new Map<TaskId, ExportedChecklistTaskState>();
  taskCompletionKeys.forEach((taskId) => {
    if (reminderTaskIds.has(taskId)) {
      return;
    }

    const completed = Boolean(taskCompletionMap.get(taskId));
    const explicitlyHidden = hiddenTaskSet.has(taskId);
    tasks.set(taskId, { completed, explicitlyHidden });
  });

  const taskVisibility = new Map<string, boolean>();
  const editVisibility = new Map<string, boolean>();
  visibilityTask.forEach((category) => {
    taskVisibility.set(category, true);
  });
  visibilityEdit.forEach((category) => {
    editVisibility.set(category, true);
  });

  return normalizeChecklistState(
    {
      tasks: mapToRecord(tasks),
      categoryVisibilityByMode: {
        task: mapToRecord(taskVisibility),
        edit: mapToRecord(editVisibility),
      },
    },
    definition,
  );
}

export async function importChecklistDefinition(
  definition: ExportedChecklistDefinition,
) {
  const db = await getDb();

  const normalizedDefinition = normalizeChecklistDefinition(definition);

  // Clear existing IndexedDB tables relating to checklist definition (TASKS_STORE, TASK_TAGS_STORE, TASK_DEPENDENCIES_STORE, CATEGORIES_STORE, CATEGORY_TASKS_STORE, TAG_COLORS_STORE)
  // Replace the content of those tables with content appropriate to the new normalized definition.
  // Use a transaction.
  const transaction = db.transaction(
    [
      TASKS_STORE,
      TASK_TAGS_STORE,
      TASK_DEPENDENCIES_STORE,
      TASK_REMINDERS_STORE,
      CATEGORIES_STORE,
      CATEGORY_TASKS_STORE,
      CATEGORY_DEPENDENCIES_STORE,
      TAG_COLORS_STORE,
      TASK_COMPLETION_STORE,
      TASK_HIDDEN_STORE,
      CATEGORY_COLLAPSED_STORE,
    ],
    "readwrite",
  );

  const tasksStore = transaction.objectStore(TASKS_STORE);
  const taskTagsStore = transaction.objectStore(TASK_TAGS_STORE);
  const taskDependenciesStore = transaction.objectStore(
    TASK_DEPENDENCIES_STORE,
  );
  const taskRemindersStore = transaction.objectStore(TASK_REMINDERS_STORE);
  const categoriesStore = transaction.objectStore(CATEGORIES_STORE);
  const categoryTasksStore = transaction.objectStore(CATEGORY_TASKS_STORE);
  const categoryDependenciesStore = transaction.objectStore(
    CATEGORY_DEPENDENCIES_STORE,
  );
  const tagColorsStore = transaction.objectStore(TAG_COLORS_STORE);
  const completedTasksStore = transaction.objectStore(TASK_COMPLETION_STORE);
  const hiddenTasksStore = transaction.objectStore(TASK_HIDDEN_STORE);
  const categoryHiddenStore = transaction.objectStore(CATEGORY_COLLAPSED_STORE);

  await Promise.all([
    tasksStore.clear(),
    taskTagsStore.clear(),
    taskDependenciesStore.clear(),
    taskRemindersStore.clear(),
    categoriesStore.clear(),
    categoryTasksStore.clear(),
    categoryDependenciesStore.clear(),
    tagColorsStore.clear(),
    completedTasksStore.clear(),
    hiddenTasksStore.clear(),
    categoryHiddenStore.clear(),
  ]);

  await categoriesStore.put(normalizedDefinition.categories, "categories");

  const tagColorsMap = recordToMap(normalizedDefinition.tagColors);

  for (const [tag, color] of tagColorsMap.entries()) {
    await tagColorsStore.put(color, tag);
  }

  const tasksByCategoryMap = recordToMap(normalizedDefinition.tasksByCategory);
  const allTaskIds = new Set<TaskId>(
    Array.from(tasksByCategoryMap.values()).flatMap((categoryTasks) =>
      categoryTasks.map((categoryTask) => categoryTask.id),
    ),
  );
  const categoryDependenciesMap = recordToMap(
    normalizedDefinition.categoryDependencies ?? {},
  );

  for (const category of normalizedDefinition.categories) {
    const tasks = tasksByCategoryMap.get(category) ?? [];
    const taskIds = tasks.map((task) => task.id);
    const categoryDependencies = categoryDependenciesMap.get(category) ?? [];

    await categoryTasksStore.put(taskIds, category);
    if (categoryDependencies.length > 0) {
      await categoryDependenciesStore.put(
        new Set(categoryDependencies),
        category,
      );
    }

    for (const task of tasks) {
      await tasksStore.put(
        {
          id: task.id,
          title: task.title,
          description: task.description ?? "",
          category,
        },
        task.id,
      );

      if (isReminderType(task.type)) {
        await taskRemindersStore.put(true, task.id);
      }

      const normalizedLegacyOpeners = normalizeExportedDependencyExpression(
        task.dependencies
          ? {
              tasks: task.dependencies,
              ...(task.dependencyExpression
                ? { expression: task.dependencyExpression }
                : {}),
            }
          : undefined,
        allTaskIds,
        task.id,
      );
      const normalizedOpeners =
        normalizeExportedDependencyExpression(
          task.openers,
          allTaskIds,
          task.id,
        ) ?? normalizedLegacyOpeners;
      const normalizedClosers = normalizeExportedDependencyExpression(
        task.closers,
        allTaskIds,
        task.id,
      );

      const normalizedTaskDependencies = normalizeTaskDependencies(
        normalizedOpeners,
        normalizedClosers,
      );

      if (normalizedTaskDependencies) {
        await taskDependenciesStore.put(normalizedTaskDependencies, task.id);
      }

      if (task.tags && task.tags.length > 0) {
        await taskTagsStore.put(new Set(task.tags), task.id);
      }
    }
  }

  await transaction.done;
  // Invalidate ALL queries
  queryClient.invalidateQueries();
}

export async function importChecklistState(state: ExportedChecklistState) {
  const db = await getDb();
  const definition = await exportChecklistDefinition();
  const definitionTasksByCategory = recordToMap(definition.tasksByCategory);

  const reminderTaskIds = new Set<TaskId>();
  for (const tasks of definitionTasksByCategory.values()) {
    for (const task of tasks ?? []) {
      if (isReminderType(task.type)) {
        reminderTaskIds.add(task.id);
      }
    }
  }

  const normalizedState = normalizeChecklistState(state, definition);

  // Clear existing IndexedDB tables relating to checklist state (TASK_COMPLETION_STORE, TASK_HIDDEN_STORE, CATEGORY_HIDDEN_STORE)
  // Replace the content of those tables with content appropriate to the new normalized state.
  // Use a transaction.
  const transaction = db.transaction(
    [TASK_COMPLETION_STORE, TASK_HIDDEN_STORE, CATEGORY_COLLAPSED_STORE],
    "readwrite",
  );

  const taskCompletionStore = transaction.objectStore(TASK_COMPLETION_STORE);
  const taskHiddenStore = transaction.objectStore(TASK_HIDDEN_STORE);
  const categoryHiddenStore = transaction.objectStore(CATEGORY_COLLAPSED_STORE);

  await Promise.all([
    taskCompletionStore.clear(),
    taskHiddenStore.clear(),
    categoryHiddenStore.clear(),
  ]);

  const stateTaskMap = recordToMap(normalizedState.tasks);

  for (const [taskId, taskState] of stateTaskMap.entries()) {
    if (taskState.completed && !reminderTaskIds.has(taskId)) {
      await taskCompletionStore.put(true, taskId);
    }

    if (taskState.explicitlyHidden) {
      await taskHiddenStore.put(true, taskId);
    }
  }

  const taskVisibleCategories = new Set<string>();
  const editVisibleCategories = new Set<string>();

  const taskVisibilityMap = recordToMap(
    normalizedState.categoryVisibilityByMode.task,
  );

  for (const [category, isVisible] of taskVisibilityMap.entries()) {
    if (isVisible) {
      taskVisibleCategories.add(category);
    }
  }

  const editVisibilityMap = recordToMap(
    normalizedState.categoryVisibilityByMode.edit,
  );

  for (const [category, isVisible] of editVisibilityMap.entries()) {
    if (isVisible) {
      editVisibleCategories.add(category);
    }
  }

  await categoryHiddenStore.put(taskVisibleCategories, "task");
  await categoryHiddenStore.put(editVisibleCategories, "edit");

  await transaction.done;

  // Invalidate ALL queries
  queryClient.invalidateQueries();
}

export const downloadJson = (fileName: string, data: unknown): void => {
  const serialized = JSON.stringify(
    data,
    (_key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }

      return value;
    },
    2,
  );

  const blob = new Blob([serialized], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const uploadJson = async (file: File): Promise<unknown> => {
  const text = await file.text();
  return JSON.parse(text);
};
