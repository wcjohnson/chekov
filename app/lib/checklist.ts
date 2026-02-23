import type {
  ChecklistDefinition,
  ChecklistState,
  ChecklistTaskDefinition,
  ChecklistTaskState,
  TaskId,
} from "./types";

export const DEFAULT_CATEGORY = "Tasks";

export const createEmptyDefinition = (): ChecklistDefinition => ({
  categories: [DEFAULT_CATEGORY],
  tasksByCategory: {
    [DEFAULT_CATEGORY]: [],
  },
});

export const createEmptyState = (): ChecklistState => ({
  tasks: {},
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

  return { tasks: nextTasks };
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
  } else {
    const rawObject = typedRaw as {
      categories?: unknown;
      tasksByCategory?: unknown;
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

    normalizedTasksByCategory[category] = rawTasks.map((task) => ({
      id: String(task.id ?? crypto.randomUUID()),
      title: typeof task.title === "string" ? task.title : "",
      description: typeof task.description === "string" ? task.description : "",
      dependencies: Array.isArray(task.dependencies)
        ? task.dependencies.map((dependency) => String(dependency))
        : [],
    }));
  }

  const allTasks = normalizedCategories.flatMap(
    (category) => normalizedTasksByCategory[category] ?? [],
  );
  const taskIdSet = new Set(allTasks.map((task) => task.id));

  const filteredTasksByCategory: Record<string, ChecklistTaskDefinition[]> = {};

  for (const category of normalizedCategories) {
    filteredTasksByCategory[category] = (
      normalizedTasksByCategory[category] ?? []
    ).map((task) => ({
      ...task,
      dependencies: task.dependencies.filter(
        (dependency) => dependency !== task.id && taskIdSet.has(dependency),
      ),
    }));
  }

  if (detectCycle(Object.values(filteredTasksByCategory).flat())) {
    throw new Error("Checklist definition has circular dependencies.");
  }

  return {
    categories: normalizedCategories,
    tasksByCategory: filteredTasksByCategory,
  };
};

export const normalizeState = (raw: unknown): ChecklistState => {
  const maybeTasks = (raw as ChecklistState | undefined)?.tasks;

  if (
    !maybeTasks ||
    typeof maybeTasks !== "object" ||
    Array.isArray(maybeTasks)
  ) {
    return createEmptyState();
  }

  const normalizedTasks: ChecklistState["tasks"] = {};

  for (const [taskId, taskState] of Object.entries(maybeTasks)) {
    const typedState = taskState as Partial<ChecklistTaskState>;

    normalizedTasks[taskId] = {
      completed: Boolean(typedState.completed),
      explicitlyHidden: Boolean(typedState.explicitlyHidden),
    };
  }

  return {
    tasks: normalizedTasks,
  };
};
