import type {
  ChecklistDefinition,
  ChecklistState,
  ChecklistTaskDefinition,
  ChecklistTaskState,
  TaskId,
} from "./types";

export const DEFAULT_CATEGORY = "Tasks";

export const createEmptyDefinition = (): ChecklistDefinition => ({
  tasks: [],
});

export const createEmptyState = (): ChecklistState => ({
  tasks: {},
});

export const defaultTaskState = (): ChecklistTaskState => ({
  completed: false,
  explicitlyHidden: false,
});

export const sortTasks = (tasks: ChecklistTaskDefinition[]): ChecklistTaskDefinition[] => {
  return [...tasks].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    return a.title.localeCompare(b.title);
  });
};

export const ensureStateForDefinition = (
  definition: ChecklistDefinition,
  state: ChecklistState,
): ChecklistState => {
  const nextTasks = { ...state.tasks };

  for (const task of definition.tasks) {
    if (!nextTasks[task.id]) {
      nextTasks[task.id] = defaultTaskState();
    }
  }

  for (const taskId of Object.keys(nextTasks)) {
    if (!definition.tasks.some((task) => task.id === taskId)) {
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
  const patchedTasks = definition.tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      dependencies: [...nextDependencies],
    };
  });

  return detectCycle(patchedTasks);
};

export const normalizeDefinition = (raw: unknown): ChecklistDefinition => {
  const tasks = Array.isArray((raw as ChecklistDefinition | undefined)?.tasks)
    ? (raw as ChecklistDefinition).tasks
    : [];

  const normalizedTasks = tasks.map((task, index) => {
    const typedTask = task as Partial<ChecklistTaskDefinition>;

    return {
      id: String(typedTask.id ?? crypto.randomUUID()),
      order: Number.isFinite(typedTask.order) ? Number(typedTask.order) : index,
      category:
        typeof typedTask.category === "string" && typedTask.category.trim().length > 0
          ? typedTask.category
          : DEFAULT_CATEGORY,
      title: typeof typedTask.title === "string" ? typedTask.title : "",
      description: typeof typedTask.description === "string" ? typedTask.description : "",
      dependencies: Array.isArray(typedTask.dependencies)
        ? typedTask.dependencies.map((dependency) => String(dependency))
        : [],
    };
  });

  const taskIdSet = new Set(normalizedTasks.map((task) => task.id));

  const withFilteredDependencies = normalizedTasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.filter(
      (dependency) => dependency !== task.id && taskIdSet.has(dependency),
    ),
  }));

  if (detectCycle(withFilteredDependencies)) {
    throw new Error("Checklist definition has circular dependencies.");
  }

  return {
    tasks: withFilteredDependencies,
  };
};

export const normalizeState = (raw: unknown): ChecklistState => {
  const maybeTasks = (raw as ChecklistState | undefined)?.tasks;

  if (!maybeTasks || typeof maybeTasks !== "object" || Array.isArray(maybeTasks)) {
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
