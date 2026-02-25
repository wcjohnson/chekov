import { fromKvPairsToRecord } from "./utils";
import {
  CATEGORIES_STORE,
  CATEGORY_HIDDEN_STORE,
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
import type { TaskId } from "./types";

export type ExportedTaskDefinition = {
  id: TaskId;
  category: string;
  title: string;
  description: string;
  type?: "task" | "warning";
  dependencies?: string[];
  tags?: string[];
};

export type ExportedChecklistDefinition = {
  categories: string[];
  tasksByCategory: Record<string, ExportedTaskDefinition[]>;
  tagColors: Record<string, TagColorKey>;
};

export type ExportedChecklistTaskState = {
  completed: boolean;
  explicitlyHidden: boolean;
};

export type ExportedChecklistCategoryVisibilityByMode = {
  task: Record<string, boolean>;
  edit: Record<string, boolean>;
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
  const normalizedTasksByCategory: Record<string, ExportedTaskDefinition[]> =
    {};

  const allTaskIds = new Set<TaskId>();
  const warningTaskIds = new Set<TaskId>();

  for (const tasks of Object.values(definition.tasksByCategory)) {
    for (const task of tasks ?? []) {
      allTaskIds.add(task.id);
      if (task.type === "warning") {
        warningTaskIds.add(task.id);
      }
    }
  }

  for (const [category, tasks] of Object.entries(definition.tasksByCategory)) {
    normalizedTasksByCategory[category] = (tasks ?? []).map((task) => {
      const normalizedType = task.type === "warning" ? "warning" : "task";
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
        description: task.description,
        ...(normalizedType === "warning" ? { type: "warning" as const } : {}),
        ...(normalizedDependencies.length > 0
          ? { dependencies: normalizedDependencies }
          : {}),
        ...(normalizedTags.length > 0 ? { tags: normalizedTags } : {}),
      };
    });
  }

  const categories = definition.categories.filter(
    (category) => (normalizedTasksByCategory[category] ?? []).length > 0,
  );

  const filteredTasksByCategory: Record<string, ExportedTaskDefinition[]> = {};
  for (const category of categories) {
    filteredTasksByCategory[category] =
      normalizedTasksByCategory[category] ?? [];
  }

  const usedTags = new Set<string>();
  for (const tasks of Object.values(filteredTasksByCategory)) {
    for (const task of tasks) {
      for (const tag of task.tags ?? []) {
        usedTags.add(tag);
      }
    }
  }

  const normalizedTagColors: Record<string, TagColorKey> = {};
  for (const [tag, color] of Object.entries(definition.tagColors ?? {})) {
    if (usedTags.has(tag)) {
      normalizedTagColors[tag] = color;
    }
  }

  return {
    categories,
    tasksByCategory: filteredTasksByCategory,
    tagColors: normalizedTagColors,
  };
}

function normalizeChecklistState(
  state: ExportedChecklistState,
  normalizedDefinition: ExportedChecklistDefinition,
): ExportedChecklistState {
  // Remove state for tasks that don't exist in the definition.
  // Remove category visibility state for categories that don't exist in the definition.
  const validTaskIds = new Set<TaskId>();
  for (const tasks of Object.values(normalizedDefinition.tasksByCategory)) {
    for (const task of tasks ?? []) {
      validTaskIds.add(task.id);
    }
  }

  const normalizedTasks: Record<TaskId, ExportedChecklistTaskState> = {};
  for (const [taskId, taskState] of Object.entries(state.tasks ?? {})) {
    if (!validTaskIds.has(taskId)) {
      continue;
    }

    normalizedTasks[taskId] = {
      completed: Boolean(taskState?.completed),
      explicitlyHidden: Boolean(taskState?.explicitlyHidden),
    };
  }

  const validCategories = new Set(normalizedDefinition.categories);

  const normalizedCategoryVisibilityByMode: ExportedChecklistCategoryVisibilityByMode =
    {
      task: {},
      edit: {},
    };

  for (const [category, isVisible] of Object.entries(
    state.categoryVisibilityByMode?.task ?? {},
  )) {
    if (validCategories.has(category)) {
      normalizedCategoryVisibilityByMode.task[category] = Boolean(isVisible);
    }
  }

  for (const [category, isVisible] of Object.entries(
    state.categoryVisibilityByMode?.edit ?? {},
  )) {
    if (validCategories.has(category)) {
      normalizedCategoryVisibilityByMode.edit[category] = Boolean(isVisible);
    }
  }

  return {
    tasks: normalizedTasks,
    categoryVisibilityByMode: normalizedCategoryVisibilityByMode,
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
    db.getAllKeys(TAG_COLORS_STORE),
    db.getAll(TAG_COLORS_STORE),
  ]);

  const categories = maybeCategories ?? [];
  const taskRecord = fromKvPairsToRecord(taskKeys, taskValues);
  const taskTagsRecord = fromKvPairsToRecord(taskTagKeys, taskTagValues);
  const taskDependenciesRecord = fromKvPairsToRecord(
    taskDependencyKeys,
    taskDependencyValues,
  );
  const categoryTasksRecord = fromKvPairsToRecord(
    categoryTaskKeys,
    categoryTaskValues,
  );
  const tagColorsRecord = fromKvPairsToRecord(tagColorKeys, tagColorValues);

  const tasksByCategory: Record<string, ExportedTaskDefinition[]> = {};
  categories.forEach((category) => {
    const taskIds = categoryTasksRecord[category] ?? [];
    const categoryTasks: ExportedTaskDefinition[] = [];

    for (const taskId of taskIds) {
      const task = taskRecord[taskId];
      if (!task) {
        continue;
      }

      categoryTasks.push({
        id: taskId,
        category,
        title: task.title,
        description: task.description,
        ...(task.type === "warning" ? { type: "warning" as const } : {}),
        ...(Array.from(taskDependenciesRecord[taskId] ?? []).length > 0
          ? { dependencies: Array.from(taskDependenciesRecord[taskId] ?? []) }
          : {}),
        ...(Array.from(taskTagsRecord[taskId] ?? []).length > 0
          ? { tags: Array.from(taskTagsRecord[taskId] ?? []) }
          : {}),
      });
    }

    tasksByCategory[category] = categoryTasks;
  });

  return normalizeChecklistDefinition({
    categories,
    tasksByCategory,
    tagColors: tagColorsRecord,
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
    db.get(CATEGORY_HIDDEN_STORE, "task"),
    db.get(CATEGORY_HIDDEN_STORE, "edit"),
  ]);
  const visibilityTask = maybeVisibilityTask ?? new Set<string>();
  const visibilityEdit = maybeVisibilityEdit ?? new Set<string>();

  const taskCompletionRecord = fromKvPairsToRecord(
    taskCompletionKeys,
    taskCompletionValues,
  );
  const warningTaskIds = new Set<TaskId>();
  for (const tasks of Object.values(definition.tasksByCategory)) {
    for (const task of tasks ?? []) {
      if (task.type === "warning") {
        warningTaskIds.add(task.id);
      }
    }
  }

  const tasks: Record<TaskId, ExportedChecklistTaskState> = {};
  taskCompletionKeys.forEach((taskId) => {
    if (warningTaskIds.has(taskId)) {
      return;
    }

    const completed = taskCompletionRecord[taskId] ?? false;
    const explicitlyHidden = visibilityTask.has(taskId);
    tasks[taskId] = { completed, explicitlyHidden };
  });

  const categoryVisibilityByMode: ExportedChecklistCategoryVisibilityByMode = {
    task: {},
    edit: {},
  };
  visibilityTask.forEach((category) => {
    categoryVisibilityByMode.task[category] = true;
  });
  visibilityEdit.forEach((category) => {
    categoryVisibilityByMode.edit[category] = true;
  });

  return normalizeChecklistState(
    { tasks, categoryVisibilityByMode },
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
      TAG_COLORS_STORE,
      TASK_COMPLETION_STORE,
      TASK_HIDDEN_STORE,
      CATEGORY_HIDDEN_STORE,
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
  const tagColorsStore = transaction.objectStore(TAG_COLORS_STORE);
  const completedTasksStore = transaction.objectStore(TASK_COMPLETION_STORE);
  const hiddenTasksStore = transaction.objectStore(TASK_HIDDEN_STORE);
  const categoryHiddenStore = transaction.objectStore(CATEGORY_HIDDEN_STORE);

  await Promise.all([
    tasksStore.clear(),
    taskTagsStore.clear(),
    taskDependenciesStore.clear(),
    categoriesStore.clear(),
    categoryTasksStore.clear(),
    tagColorsStore.clear(),
    completedTasksStore.clear(),
    hiddenTasksStore.clear(),
    categoryHiddenStore.clear(),
  ]);

  await categoriesStore.put(normalizedDefinition.categories, "categories");

  for (const [tag, color] of Object.entries(normalizedDefinition.tagColors)) {
    await tagColorsStore.put(color, tag);
  }

  for (const category of normalizedDefinition.categories) {
    const tasks = normalizedDefinition.tasksByCategory[category] ?? [];
    const taskIds = tasks.map((task) => task.id);

    await categoryTasksStore.put(taskIds, category);

    for (const task of tasks) {
      await tasksStore.put(
        {
          id: task.id,
          title: task.title,
          description: task.description,
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
  const warningTaskIds = new Set<TaskId>();
  for (const tasks of Object.values(definition.tasksByCategory)) {
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
    [TASK_COMPLETION_STORE, TASK_HIDDEN_STORE, CATEGORY_HIDDEN_STORE],
    "readwrite",
  );

  const taskCompletionStore = transaction.objectStore(TASK_COMPLETION_STORE);
  const taskHiddenStore = transaction.objectStore(TASK_HIDDEN_STORE);
  const categoryHiddenStore = transaction.objectStore(CATEGORY_HIDDEN_STORE);

  await Promise.all([
    taskCompletionStore.clear(),
    taskHiddenStore.clear(),
    categoryHiddenStore.clear(),
  ]);

  for (const [taskId, taskState] of Object.entries(normalizedState.tasks)) {
    if (taskState.completed && !warningTaskIds.has(taskId)) {
      await taskCompletionStore.put(true, taskId);
    }

    if (taskState.explicitlyHidden) {
      await taskHiddenStore.put(true, taskId);
    }
  }

  const taskVisibleCategories = new Set<string>();
  const editVisibleCategories = new Set<string>();

  for (const [category, isVisible] of Object.entries(
    normalizedState.categoryVisibilityByMode.task,
  )) {
    if (isVisible) {
      taskVisibleCategories.add(category);
    }
  }

  for (const [category, isVisible] of Object.entries(
    normalizedState.categoryVisibilityByMode.edit,
  )) {
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
