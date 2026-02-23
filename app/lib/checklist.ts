import type {
  ChecklistDefinition,
  ChecklistState,
  ChecklistTaskDefinition,
  ChecklistTaskState,
  TaskId,
} from "./types";
import { isTagColorKey, type TagColorKey } from "./tagColors";

export const DEFAULT_CATEGORY = "Tasks";

export const createEmptyDefinition = (): ChecklistDefinition => ({
  categories: [DEFAULT_CATEGORY],
  tagColors: {},
  tasksByCategory: {
    [DEFAULT_CATEGORY]: [
      {
        id: crypto.randomUUID(),
        title: "Untitled Task",
        description: "",
        dependencies: [],
      },
    ],
  },
});

export const createEmptyState = (): ChecklistState => ({
  tasks: {},
  categoryVisibilityByMode: {
    task: {},
    edit: {},
  },
});

export const defaultTaskState = (): ChecklistTaskState => ({
  completed: false,
  explicitlyHidden: false,
});

export const flattenDefinitionTasks = (
  definition: ChecklistDefinition,
): ChecklistTaskDefinition[] => {
  const flattened: ChecklistTaskDefinition[] = [];

  for (const category of definition.categories) {
    flattened.push(...(definition.tasksByCategory[category] ?? []));
  }

  return flattened;
};

export const ensureStateForDefinition = (
  definition: ChecklistDefinition,
  state: ChecklistState,
): ChecklistState => {
  const nextTasks = { ...state.tasks };
  const nextCategoryVisibilityByMode: ChecklistState["categoryVisibilityByMode"] =
    {
      task: { ...(state.categoryVisibilityByMode?.task ?? {}) },
      edit: { ...(state.categoryVisibilityByMode?.edit ?? {}) },
    };
  const allTasks = flattenDefinitionTasks(definition);

  for (const task of allTasks) {
    if (!nextTasks[task.id]) {
      nextTasks[task.id] = defaultTaskState();
    }
  }

  for (const taskId of Object.keys(nextTasks)) {
    if (!allTasks.some((task) => task.id === taskId)) {
      delete nextTasks[taskId];
    }
  }

  const validCategories = new Set(definition.categories);

  for (const category of definition.categories) {
    if (typeof nextCategoryVisibilityByMode.task[category] !== "boolean") {
      nextCategoryVisibilityByMode.task[category] = true;
    }

    if (typeof nextCategoryVisibilityByMode.edit[category] !== "boolean") {
      nextCategoryVisibilityByMode.edit[category] = true;
    }
  }

  for (const category of Object.keys(nextCategoryVisibilityByMode.task)) {
    if (!validCategories.has(category)) {
      delete nextCategoryVisibilityByMode.task[category];
    }
  }

  for (const category of Object.keys(nextCategoryVisibilityByMode.edit)) {
    if (!validCategories.has(category)) {
      delete nextCategoryVisibilityByMode.edit[category];
    }
  }

  return {
    tasks: nextTasks,
    categoryVisibilityByMode: nextCategoryVisibilityByMode,
  };
};

export const dependenciesAreComplete = (
  task: ChecklistTaskDefinition,
  state: ChecklistState,
): boolean => {
  for (const dependencyId of task.dependencies) {
    if (!state.tasks[dependencyId]?.completed) {
      return false;
    }
  }

  return true;
};

export const detectCycle = (tasks: ChecklistTaskDefinition[]): boolean => {
  const graph = new Map<TaskId, TaskId[]>();

  for (const task of tasks) {
    graph.set(task.id, task.dependencies);
  }

  const temp = new Set<TaskId>();
  const perm = new Set<TaskId>();

  const visit = (node: TaskId): boolean => {
    if (perm.has(node)) {
      return false;
    }

    if (temp.has(node)) {
      return true;
    }

    temp.add(node);

    for (const neighbor of graph.get(node) ?? []) {
      if (visit(neighbor)) {
        return true;
      }
    }

    temp.delete(node);
    perm.add(node);

    return false;
  };

  for (const task of tasks) {
    if (visit(task.id)) {
      return true;
    }
  }

  return false;
};

export const wouldCreateCycle = (
  definition: ChecklistDefinition,
  taskId: TaskId,
  nextDependencies: TaskId[],
): boolean => {
  const patchedTasks = flattenDefinitionTasks(definition).map((task) =>
    task.id === taskId
      ? {
          ...task,
          dependencies: [...nextDependencies],
        }
      : task,
  );

  return detectCycle(patchedTasks);
};

export const normalizeDefinition = (raw: unknown): ChecklistDefinition => {
  const typedRaw = raw as
    | ChecklistDefinition
    | {
        tasks?: Array<
          Partial<ChecklistTaskDefinition> & {
            category?: unknown;
            order?: unknown;
          }
        >;
      }
    | undefined;

  const hasLegacyTasks =
    Boolean(typedRaw && typeof typedRaw === "object" && "tasks" in typedRaw) &&
    Array.isArray((typedRaw as { tasks?: unknown }).tasks);

  let categories: string[];
  let tasksByCategoryRaw: Record<string, unknown>;
  let tagColorsRaw: Record<string, unknown>;

  if (hasLegacyTasks) {
    const grouped: Record<string, Array<Partial<ChecklistTaskDefinition>>> = {};

    for (const task of (
      typedRaw as {
        tasks?: Array<
          Partial<ChecklistTaskDefinition> & { category?: unknown }
        >;
      }
    ).tasks ?? []) {
      const categoryName =
        typeof (task as { category?: unknown }).category === "string" &&
        String((task as { category?: unknown }).category).trim().length > 0
          ? String((task as { category?: unknown }).category)
          : DEFAULT_CATEGORY;

      if (!grouped[categoryName]) {
        grouped[categoryName] = [];
      }

      grouped[categoryName].push(task);
    }

    categories = Object.keys(grouped);
    tasksByCategoryRaw = grouped;
    tagColorsRaw = {};
  } else {
    const rawObject = typedRaw as {
      categories?: unknown;
      tasksByCategory?: unknown;
      tagColors?: unknown;
    };

    const maybeCategories = Array.isArray(rawObject?.categories)
      ? rawObject.categories
      : [];
    categories = maybeCategories
      .map((category) => (typeof category === "string" ? category.trim() : ""))
      .filter((category) => category.length > 0);

    const maybeTasksByCategory = rawObject?.tasksByCategory;
    tasksByCategoryRaw =
      maybeTasksByCategory &&
      typeof maybeTasksByCategory === "object" &&
      !Array.isArray(maybeTasksByCategory)
        ? (maybeTasksByCategory as Record<string, unknown>)
        : {};

    const maybeTagColors = rawObject?.tagColors;
    tagColorsRaw =
      maybeTagColors &&
      typeof maybeTagColors === "object" &&
      !Array.isArray(maybeTagColors)
        ? (maybeTagColors as Record<string, unknown>)
        : {};
  }

  const normalizedTasksByCategory: Record<string, ChecklistTaskDefinition[]> =
    {};
  const normalizedCategories: string[] = [];
  const seenCategories = new Set<string>();

  const registerCategory = (category: string) => {
    const normalizedName = category.trim();
    if (normalizedName.length === 0 || seenCategories.has(normalizedName)) {
      return;
    }

    seenCategories.add(normalizedName);
    normalizedCategories.push(normalizedName);
  };

  for (const category of categories) {
    registerCategory(category);
  }

  for (const category of Object.keys(tasksByCategoryRaw)) {
    registerCategory(category);
  }

  if (normalizedCategories.length === 0) {
    registerCategory(DEFAULT_CATEGORY);
  }

  for (const category of normalizedCategories) {
    const rawTasks = Array.isArray(tasksByCategoryRaw[category])
      ? (tasksByCategoryRaw[category] as Array<
          Partial<ChecklistTaskDefinition>
        >)
      : [];

    normalizedTasksByCategory[category] = rawTasks.map((task) => {
      const rawTags = (task as { tags?: unknown }).tags;

      const normalizedTagValues =
        rawTags instanceof Set
          ? Array.from(rawTags)
          : Array.isArray(rawTags)
            ? rawTags
            : [];

      const normalizedTags = new Set(
        normalizedTagValues
          .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
          .filter((tag) => tag.length > 0),
      );

      return {
        id: String(task.id ?? crypto.randomUUID()),
        title: typeof task.title === "string" ? task.title : "",
        description:
          typeof task.description === "string" ? task.description : "",
        dependencies: Array.isArray(task.dependencies)
          ? task.dependencies.map((dependency) => String(dependency))
          : [],
        ...(normalizedTags.size > 0 ? { tags: normalizedTags } : {}),
      };
    });
  }

  const allTasks = normalizedCategories.flatMap(
    (category) => normalizedTasksByCategory[category] ?? [],
  );
  const taskIdSet = new Set(allTasks.map((task) => task.id));

  const filteredTasksByCategory: Record<string, ChecklistTaskDefinition[]> = {};

  for (const category of normalizedCategories) {
    filteredTasksByCategory[category] = (
      normalizedTasksByCategory[category] ?? []
    ).map((task) => {
      const normalizedTags = new Set(task.tags ?? []);

      return {
        ...task,
        dependencies: task.dependencies.filter(
          (dependency) => dependency !== task.id && taskIdSet.has(dependency),
        ),
        ...(normalizedTags.size > 0 ? { tags: normalizedTags } : {}),
      };
    });
  }

  if (detectCycle(Object.values(filteredTasksByCategory).flat())) {
    throw new Error("Checklist definition has circular dependencies.");
  }

  const usedTags = new Set<string>();

  for (const task of Object.values(filteredTasksByCategory).flat()) {
    for (const tag of task.tags ?? []) {
      usedTags.add(tag);
    }
  }

  const normalizedTagColors: Record<string, TagColorKey> = {};

  for (const [rawTag, rawColor] of Object.entries(tagColorsRaw)) {
    const tag = rawTag.trim();
    const color = typeof rawColor === "string" ? rawColor : "";

    if (tag.length === 0 || !usedTags.has(tag) || !isTagColorKey(color)) {
      continue;
    }

    normalizedTagColors[tag] = color;
  }

  return {
    categories: normalizedCategories,
    tasksByCategory: filteredTasksByCategory,
    tagColors: normalizedTagColors,
  };
};

export const normalizeState = (raw: unknown): ChecklistState => {
  const typedRaw = raw as Partial<ChecklistState> | undefined;
  const maybeTasks = typedRaw?.tasks;

  const normalizedTasks: ChecklistState["tasks"] = {};

  if (
    maybeTasks &&
    typeof maybeTasks === "object" &&
    !Array.isArray(maybeTasks)
  ) {
    for (const [taskId, taskState] of Object.entries(maybeTasks)) {
      const typedState = taskState as Partial<ChecklistTaskState>;

      normalizedTasks[taskId] = {
        completed: Boolean(typedState.completed),
        explicitlyHidden: Boolean(typedState.explicitlyHidden),
      };
    }
  }

  const maybeVisibilityByMode = typedRaw?.categoryVisibilityByMode;
  const maybeTaskVisibility =
    maybeVisibilityByMode &&
    typeof maybeVisibilityByMode === "object" &&
    !Array.isArray(maybeVisibilityByMode)
      ? (
          maybeVisibilityByMode as Partial<
            ChecklistState["categoryVisibilityByMode"]
          >
        ).task
      : undefined;
  const maybeEditVisibility =
    maybeVisibilityByMode &&
    typeof maybeVisibilityByMode === "object" &&
    !Array.isArray(maybeVisibilityByMode)
      ? (
          maybeVisibilityByMode as Partial<
            ChecklistState["categoryVisibilityByMode"]
          >
        ).edit
      : undefined;

  const normalizedTaskVisibility: Record<string, boolean> = {};
  const normalizedEditVisibility: Record<string, boolean> = {};

  if (
    maybeTaskVisibility &&
    typeof maybeTaskVisibility === "object" &&
    !Array.isArray(maybeTaskVisibility)
  ) {
    for (const [category, isOpen] of Object.entries(maybeTaskVisibility)) {
      normalizedTaskVisibility[category] = Boolean(isOpen);
    }
  }

  if (
    maybeEditVisibility &&
    typeof maybeEditVisibility === "object" &&
    !Array.isArray(maybeEditVisibility)
  ) {
    for (const [category, isOpen] of Object.entries(maybeEditVisibility)) {
      normalizedEditVisibility[category] = Boolean(isOpen);
    }
  }

  return {
    tasks: normalizedTasks,
    categoryVisibilityByMode: {
      task: normalizedTaskVisibility,
      edit: normalizedEditVisibility,
    },
  };
};
