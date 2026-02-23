import { openDB } from "idb";
import {
  createEmptyDefinition,
  createEmptyState,
  ensureStateForDefinition,
  normalizeDefinition,
  normalizeState,
} from "./checklist";
import type { ChecklistDefinition, ChecklistState } from "./types";

const DB_NAME = "chekov-db";
const DB_VERSION = 2;
const TASKS_STORE = "tasks";
const TASK_DEPENDENCIES_STORE = "taskDependencies";
const COMPLETED_TASKS_STORE = "completedTasks";
const HIDDEN_TASKS_STORE = "hiddenTasks";
const CATEGORIES_STORE = "categories";
const CATEGORY_TASK_ORDER_STORE = "categoryTaskOrder";
const TAG_COLORS_STORE = "tagColors";
const CATEGORY_VISIBILITY_STORE = "categoryVisibility";
const PRIMARY_KEY = "current";
const COMPLETED_KEY = "completed";
const HIDDEN_KEY = "hidden";
const CATEGORY_VISIBILITY_KEY = "byMode";

type StoredTask = {
  id: string;
  title: string;
  description: string;
  tags?: Set<string>;
};

type StoredCategoryVisibility = ChecklistState["categoryVisibilityByMode"];

let dbPromise: ReturnType<typeof openDB> | null = null;

const getDb = async () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const storeName of Array.from(db.objectStoreNames)) {
          db.deleteObjectStore(storeName);
        }

        db.createObjectStore(TASKS_STORE);
        db.createObjectStore(TASK_DEPENDENCIES_STORE);
        db.createObjectStore(COMPLETED_TASKS_STORE);
        db.createObjectStore(HIDDEN_TASKS_STORE);
        db.createObjectStore(CATEGORIES_STORE);
        db.createObjectStore(CATEGORY_TASK_ORDER_STORE);
        db.createObjectStore(TAG_COLORS_STORE);
        db.createObjectStore(CATEGORY_VISIBILITY_STORE);
      },
    });
  }

  return dbPromise;
};

export const loadDefinition = async (): Promise<ChecklistDefinition> => {
  const db = await getDb();
  if (!db) {
    return createEmptyDefinition();
  }

  const [
    categoriesRaw,
    tagColorsRaw,
    taskKeysRaw,
    taskValuesRaw,
    dependencyKeysRaw,
    dependencyValuesRaw,
  ] = await Promise.all([
    db.get(CATEGORIES_STORE, PRIMARY_KEY),
    db.get(TAG_COLORS_STORE, PRIMARY_KEY),
    db.getAllKeys(TASKS_STORE),
    db.getAll(TASKS_STORE),
    db.getAllKeys(TASK_DEPENDENCIES_STORE),
    db.getAll(TASK_DEPENDENCIES_STORE),
  ]);

  const categories = Array.isArray(categoriesRaw)
    ? categoriesRaw
        .map((category) =>
          typeof category === "string" ? category.trim() : "",
        )
        .filter((category) => category.length > 0)
    : [];

  const normalizedCategories = categories.length > 0 ? categories : [];
  const storedTasksMap = new Map<string, StoredTask>();

  for (let index = 0; index < taskKeysRaw.length; index += 1) {
    const rawTaskId = taskKeysRaw[index];
    const value = taskValuesRaw[index];
    if (typeof rawTaskId === "undefined") {
      continue;
    }

    const taskId = String(rawTaskId);
    const storedTask = value as Partial<StoredTask>;
    const normalizedTags = new Set(
      Array.isArray(storedTask.tags)
        ? []
        : Array.from(storedTask.tags ?? [])
            .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
            .filter((tag) => tag.length > 0),
    );

    storedTasksMap.set(taskId, {
      id: taskId,
      title: typeof storedTask.title === "string" ? storedTask.title : "",
      description:
        typeof storedTask.description === "string"
          ? storedTask.description
          : "",
      ...(normalizedTags.size > 0 ? { tags: normalizedTags } : {}),
    });
  }

  const dependencyMap = new Map<string, Set<string>>();
  for (let index = 0; index < dependencyKeysRaw.length; index += 1) {
    const rawTaskId = dependencyKeysRaw[index];
    const value = dependencyValuesRaw[index];
    if (typeof rawTaskId === "undefined") {
      continue;
    }

    const taskId = String(rawTaskId);
    const dependencies = new Set(
      Array.from((value as Set<unknown>) ?? [])
        .map((dependency) => String(dependency))
        .filter((dependency) => dependency !== taskId),
    );
    dependencyMap.set(taskId, dependencies);
  }

  const tasksByCategory: ChecklistDefinition["tasksByCategory"] = {};
  const seenTaskIds = new Set<string>();

  for (const category of normalizedCategories) {
    const orderRaw = await db.get(CATEGORY_TASK_ORDER_STORE, category);
    const orderedIds = Array.isArray(orderRaw)
      ? orderRaw.map((taskId) => String(taskId))
      : [];
    const categoryTasks: ChecklistDefinition["tasksByCategory"][string] = [];

    for (const taskId of orderedIds) {
      const storedTask = storedTasksMap.get(taskId);
      if (!storedTask || seenTaskIds.has(taskId)) {
        continue;
      }

      seenTaskIds.add(taskId);
      categoryTasks.push({
        id: storedTask.id,
        title: storedTask.title,
        description: storedTask.description,
        dependencies: Array.from(dependencyMap.get(taskId) ?? []),
        ...(storedTask.tags && storedTask.tags.size > 0
          ? { tags: new Set(storedTask.tags) }
          : {}),
      });
    }

    tasksByCategory[category] = categoryTasks;
  }

  const allTaskIds = new Set(
    normalizedCategories.flatMap((category) =>
      (tasksByCategory[category] ?? []).map((task) => task.id),
    ),
  );

  const tagColorsInput =
    tagColorsRaw &&
    typeof tagColorsRaw === "object" &&
    !Array.isArray(tagColorsRaw)
      ? (tagColorsRaw as Record<string, unknown>)
      : {};
  const filteredTagColors: Record<string, string> = {};

  for (const [tag, color] of Object.entries(tagColorsInput)) {
    if (typeof color === "string") {
      filteredTagColors[tag] = color;
    }
  }

  const definitionCandidate: ChecklistDefinition = {
    categories: normalizedCategories,
    tasksByCategory,
    tagColors: filteredTagColors as ChecklistDefinition["tagColors"],
  };

  const normalized = normalizeDefinition(definitionCandidate);

  for (const category of normalized.categories) {
    normalized.tasksByCategory[category] = (
      normalized.tasksByCategory[category] ?? []
    ).map((task) => ({
      ...task,
      dependencies: task.dependencies.filter((dependency) =>
        allTaskIds.has(dependency),
      ),
    }));
  }

  return normalized;
};

export const loadState = async (): Promise<ChecklistState> => {
  const db = await getDb();
  if (!db) {
    return createEmptyState();
  }

  const [completedRaw, hiddenRaw, categoryVisibilityRaw] = await Promise.all([
    db.get(COMPLETED_TASKS_STORE, COMPLETED_KEY),
    db.get(HIDDEN_TASKS_STORE, HIDDEN_KEY),
    db.get(CATEGORY_VISIBILITY_STORE, CATEGORY_VISIBILITY_KEY),
  ]);

  const completedSet = new Set(
    Array.from((completedRaw as Set<unknown>) ?? []).map((taskId) =>
      String(taskId),
    ),
  );
  const hiddenSet = new Set(
    Array.from((hiddenRaw as Set<unknown>) ?? []).map((taskId) =>
      String(taskId),
    ),
  );

  const taskIds = new Set<string>([...completedSet, ...hiddenSet]);
  const tasks: ChecklistState["tasks"] = {};

  for (const taskId of taskIds) {
    tasks[taskId] = {
      completed: completedSet.has(taskId),
      explicitlyHidden: hiddenSet.has(taskId),
    };
  }

  const categoryVisibilityByMode =
    categoryVisibilityRaw &&
    typeof categoryVisibilityRaw === "object" &&
    !Array.isArray(categoryVisibilityRaw)
      ? (categoryVisibilityRaw as StoredCategoryVisibility)
      : {
          task: {},
          edit: {},
        };

  return normalizeState({
    tasks,
    categoryVisibilityByMode,
  });
};

export const saveDefinition = async (
  definition: ChecklistDefinition,
): Promise<void> => {
  const db = await getDb();
  if (!db) {
    return;
  }
  const normalized = normalizeDefinition(definition);

  const transaction = db.transaction(
    [
      TASKS_STORE,
      TASK_DEPENDENCIES_STORE,
      CATEGORIES_STORE,
      CATEGORY_TASK_ORDER_STORE,
      TAG_COLORS_STORE,
    ],
    "readwrite",
  );

  await Promise.all([
    transaction.objectStore(TASKS_STORE).clear(),
    transaction.objectStore(TASK_DEPENDENCIES_STORE).clear(),
    transaction.objectStore(CATEGORY_TASK_ORDER_STORE).clear(),
  ]);

  await transaction
    .objectStore(CATEGORIES_STORE)
    .put([...normalized.categories], PRIMARY_KEY);
  await transaction
    .objectStore(TAG_COLORS_STORE)
    .put({ ...normalized.tagColors }, PRIMARY_KEY);

  for (const category of normalized.categories) {
    const tasks = normalized.tasksByCategory[category] ?? [];
    await transaction.objectStore(CATEGORY_TASK_ORDER_STORE).put(
      tasks.map((task) => task.id),
      category,
    );

    for (const task of tasks) {
      const taskDocument: StoredTask = {
        id: task.id,
        title: task.title,
        description: task.description,
        ...(task.tags && task.tags.size > 0
          ? { tags: new Set(task.tags) }
          : {}),
      };

      await transaction.objectStore(TASKS_STORE).put(taskDocument, task.id);
      await transaction
        .objectStore(TASK_DEPENDENCIES_STORE)
        .put(new Set(task.dependencies), task.id);
    }
  }

  await transaction.done;
};

export const saveState = async (state: ChecklistState): Promise<void> => {
  const db = await getDb();
  if (!db) {
    return;
  }
  const normalized = normalizeState(state);

  const completed = new Set<string>();
  const hidden = new Set<string>();

  for (const [taskId, taskState] of Object.entries(normalized.tasks)) {
    if (taskState.completed) {
      completed.add(taskId);
    }

    if (taskState.explicitlyHidden) {
      hidden.add(taskId);
    }
  }

  const transaction = db.transaction(
    [COMPLETED_TASKS_STORE, HIDDEN_TASKS_STORE, CATEGORY_VISIBILITY_STORE],
    "readwrite",
  );

  await Promise.all([
    transaction
      .objectStore(COMPLETED_TASKS_STORE)
      .put(completed, COMPLETED_KEY),
    transaction.objectStore(HIDDEN_TASKS_STORE).put(hidden, HIDDEN_KEY),
    transaction
      .objectStore(CATEGORY_VISIBILITY_STORE)
      .put(normalized.categoryVisibilityByMode, CATEGORY_VISIBILITY_KEY),
  ]);

  await transaction.done;
};

export const saveAll = async (
  definition: ChecklistDefinition,
  state: ChecklistState,
): Promise<{ definition: ChecklistDefinition; state: ChecklistState }> => {
  const normalizedDefinition = normalizeDefinition(definition);
  const normalizedState = ensureStateForDefinition(
    normalizedDefinition,
    normalizeState(state),
  );

  await Promise.all([
    saveDefinition(normalizedDefinition),
    saveState(normalizedState),
  ]);

  return {
    definition: normalizedDefinition,
    state: normalizedState,
  };
};
