import { fromKvPairsToMap, mapToRecord, recordToMap } from "./utils";
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
  TASKS_STORE,
} from "./storage";
import type { TagColorKey } from "./tagColors";
import type { CategoryName, TaskId } from "@/app/lib/types";

export type ExportedTaskDefinition = {
  id: TaskId;
  category: CategoryName;
  title: string;
  description?: string;
  type?: "task" | "warning";
  dependencies?: TaskId[];
  tags?: string[];
};

export type ExportedChecklistDefinition = {
  categories: CategoryName[];
  tasksByCategory: Record<CategoryName, ExportedTaskDefinition[]>;
  tagColors: Record<string, TagColorKey>;
  categoryDependencies?: Record<CategoryName, TaskId[]>;
};

export type ExportedChecklistTaskState = {
  completed: boolean;
  explicitlyHidden: boolean;
};

export type ExportedChecklistCategoryVisibilityByMode = {
  task: Record<CategoryName, boolean>;
  edit: Record<CategoryName, boolean>;
};

export type ExportedChecklistState = {
  tasks: Record<TaskId, ExportedChecklistTaskState>;
  categoryVisibilityByMode: ExportedChecklistCategoryVisibilityByMode;
};

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
  const warningTaskIds = new Set<TaskId>();

  for (const [, tasks] of tasksByCategoryEntries) {
    for (const task of tasks ?? []) {
      allTaskIds.add(task.id);
      if (task.type === "warning") {
        warningTaskIds.add(task.id);
      }
    }
  }

  for (const [category, tasks] of tasksByCategoryEntries) {
    normalizedTasksByCategory.set(
      category,
      (tasks ?? []).map((task) => {
        const normalizedType = task.type === "warning" ? "warning" : "task";
        const normalizedDescription = task.description ?? "";
        const normalizedDependencies = Array.from(
          new Set<TaskId>(
            Array.from(task.dependencies ?? []).filter(
              (dependencyId) =>
                dependencyId !== task.id &&
                allTaskIds.has(dependencyId) &&
                !warningTaskIds.has(dependencyId),
            ),
          ),
        );

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
          ...(normalizedType === "warning" ? { type: "warning" as const } : {}),
          ...(normalizedDependencies.length > 0
            ? { dependencies: normalizedDependencies }
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
    if (usedTags.has(tag)) {
      normalizedTagColors.set(tag, color);
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
    taskDependencyValues,
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
    taskDependencyValues,
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

      const taskDependencies =
        taskDependenciesMap.get(taskId) ?? new Set<string>();
      const taskTags = taskTagsMap.get(taskId) ?? new Set<string>();

      categoryTasks.push({
        id: taskId,
        category,
        title: task.title,
        ...(task.description.length > 0
          ? { description: task.description }
          : {}),
        ...(task.type === "warning" ? { type: "warning" as const } : {}),
        ...(Array.from(taskDependencies).length > 0
          ? { dependencies: Array.from(taskDependencies) }
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
    maybeVisibilityTask,
    maybeVisibilityEdit,
  ] = await Promise.all([
    db.getAllKeys(TASK_COMPLETION_STORE),
    db.getAll(TASK_COMPLETION_STORE),
    db.get(CATEGORY_COLLAPSED_STORE, "task"),
    db.get(CATEGORY_COLLAPSED_STORE, "edit"),
  ]);
  const visibilityTask = maybeVisibilityTask ?? new Set<string>();
  const visibilityEdit = maybeVisibilityEdit ?? new Set<string>();

  const taskCompletionMap = fromKvPairsToMap(
    taskCompletionKeys,
    taskCompletionValues,
  );
  const definitionTasksByCategory = recordToMap(definition.tasksByCategory);

  const warningTaskIds = new Set<TaskId>();
  for (const tasks of definitionTasksByCategory.values()) {
    for (const task of tasks ?? []) {
      if (task.type === "warning") {
        warningTaskIds.add(task.id);
      }
    }
  }

  const tasks = new Map<TaskId, ExportedChecklistTaskState>();
  taskCompletionKeys.forEach((taskId) => {
    if (warningTaskIds.has(taskId)) {
      return;
    }

    const completed = Boolean(taskCompletionMap.get(taskId));
    const explicitlyHidden = visibilityTask.has(taskId);
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
          ...(task.type === "warning" ? { type: "warning" as const } : {}),
        },
        task.id,
      );

      if (task.dependencies && task.dependencies.length > 0) {
        await taskDependenciesStore.put(new Set(task.dependencies), task.id);
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

  const warningTaskIds = new Set<TaskId>();
  for (const tasks of definitionTasksByCategory.values()) {
    for (const task of tasks ?? []) {
      if (task.type === "warning") {
        warningTaskIds.add(task.id);
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
    if (taskState.completed && !warningTaskIds.has(taskId)) {
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
