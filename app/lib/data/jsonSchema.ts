import type { TaskId, CategoryName, BooleanExpression } from "./types";

export type ExportedTaskDefinition = {
  id: TaskId;
  category: CategoryName;
  title: string;
  description?: string;
  type?: "task" | "warning" | "reminder";
  dependencies?: TaskId[];
  dependencyExpression?: BooleanExpression;
  tags?: string[];
};
