import type { TagColorKey } from "../tagColors";
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
  openers?: ExportedDependencyExpression;
  closers?: ExportedDependencyExpression;
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

export type ExportedDependencyExpression = {
  tasks: TaskId[];
  expression?: BooleanExpression;
};
