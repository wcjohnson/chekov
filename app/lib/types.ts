import type { TagColorKey } from "./tagColors";

export type TaskId = string;

export type ChecklistTaskDefinition = {
  id: TaskId;
  category: string;
  title: string;
  description: string;
  dependencies: Set<TaskId>;
  tags?: Set<string>;
};

export type ChecklistDefinition = {
  categories: string[];
  tasksByCategory: Record<string, ChecklistTaskDefinition[]>;
  tagColors: Record<string, TagColorKey>;
};

export type ChecklistTaskState = {
  completed: boolean;
  explicitlyHidden: boolean;
};

export type ChecklistCategoryVisibilityByMode = {
  task: Record<string, boolean>;
  edit: Record<string, boolean>;
};

export type ChecklistState = {
  tasks: Record<TaskId, ChecklistTaskState>;
  categoryVisibilityByMode: ChecklistCategoryVisibilityByMode;
};

export type ChecklistMode = "task" | "edit";

export type TaskBreakout = {
  visibleCategories: string[];
  categoryTasks: Record<string, TaskId[]>;
  orderedCategoryTasks: TaskId[][];
  visibleTasks: Set<TaskId>;
};
