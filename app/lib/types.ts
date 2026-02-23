export type TaskId = string;

export type ChecklistTaskDefinition = {
  id: TaskId;
  order: number;
  category: string;
  title: string;
  description: string;
  dependencies: TaskId[];
};

export type ChecklistDefinition = {
  tasks: ChecklistTaskDefinition[];
};

export type ChecklistTaskState = {
  completed: boolean;
  explicitlyHidden: boolean;
};

export type ChecklistState = {
  tasks: Record<TaskId, ChecklistTaskState>;
};

export type ChecklistMode = "task" | "edit";
