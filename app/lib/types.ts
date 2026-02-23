export type TaskId = string;

export type ChecklistTaskDefinition = {
  id: TaskId;
  title: string;
  description: string;
  dependencies: TaskId[];
};

export type ChecklistDefinition = {
  categories: string[];
  tasksByCategory: Record<string, ChecklistTaskDefinition[]>;
};

export type ChecklistTaskState = {
  completed: boolean;
  explicitlyHidden: boolean;
};

export type ChecklistState = {
  tasks: Record<TaskId, ChecklistTaskState>;
};

export type ChecklistMode = "task" | "edit";
