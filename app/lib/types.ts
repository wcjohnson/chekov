export type TaskId = string;

export type ChecklistMode = "task" | "edit";

export type TaskBreakout = {
  visibleCategories: string[];
  categoryTasks: Map<string, TaskId[]>;
  orderedCategoryTasks: TaskId[][];
  visibleTasks: Set<TaskId>;
};
