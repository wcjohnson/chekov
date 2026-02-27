export type TaskId = string;
export type CategoryName = string;

export type ChecklistMode = "task" | "edit";

export type TaskBreakout = {
  visibleCategories: string[];
  categoryTasks: Map<string, TaskId[]>;
  orderedCategoryTasks: TaskId[][];
  visibleTasks: Set<TaskId>;
};

export enum BooleanOp {
  And = 1,
  Or = 2,
  Not = 3,
}

export type BooleanExpression =
  | TaskId
  | [BooleanOp.And, ...BooleanExpression[]]
  | [BooleanOp.Or, ...BooleanExpression[]]
  | [BooleanOp.Not, BooleanExpression];

export type StoredTask = {
  id: TaskId;
  title: string;
  description: string;
  category: CategoryName;
};

export type DependencyExpression = {
  taskSet: Set<TaskId>;
  expression?: BooleanExpression;
};
