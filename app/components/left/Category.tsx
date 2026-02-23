"use client";

import { Task } from "./Task";
import type {
  ChecklistMode,
  ChecklistState,
  ChecklistTaskDefinition,
  TaskId,
} from "../../lib/types";
import { dependenciesAreComplete } from "@/app/lib/checklist";

type CategoryProps = {
  category: string;
  tasks: ChecklistTaskDefinition[];
  taskVisibilityMap: Map<TaskId, boolean>;
  mode: ChecklistMode;
  state: ChecklistState;
  selectedTaskId: TaskId | null;
  isSettingDependencies: boolean;
  editSelectedTaskIds: Set<TaskId>;
  pendingDependencyIds: Set<TaskId>;
  onSelectTask: (taskId: TaskId) => void;
  onToggleComplete: (taskId: TaskId) => void;
  onToggleEditSelection: (taskId: TaskId) => void;
  onTogglePendingDependency: (taskId: TaskId) => void;
};

export function Category({
  category,
  tasks,
  taskVisibilityMap,
  mode,
  state,
  selectedTaskId,
  isSettingDependencies,
  editSelectedTaskIds,
  pendingDependencyIds,
  onSelectTask,
  onToggleComplete,
  onToggleEditSelection,
  onTogglePendingDependency,
}: CategoryProps) {
  const visibleTasks = tasks.filter((task) => taskVisibilityMap.has(task.id));

  if (visibleTasks.length === 0) {
    return null;
  }

  return (
    <details
      open
      className="rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900">
        {category} ({visibleTasks.length})
      </summary>
      <div className="space-y-1 px-2 pb-2">
        {visibleTasks.map((task, index) => {
          const taskState = state.tasks[task.id] ?? {
            completed: false,
            explicitlyHidden: false,
          };

          return (
            <Task
              key={task.id}
              task={task}
              taskState={taskState}
              category={category}
              index={index}
              mode={mode}
              isSettingDependencies={isSettingDependencies}
              selectedTaskId={selectedTaskId}
              isSelected={selectedTaskId === task.id}
              isEditSelected={editSelectedTaskIds.has(task.id)}
              isPendingDependency={pendingDependencyIds.has(task.id)}
              dependenciesComplete={dependenciesAreComplete(task, state)}
              onSelectTask={onSelectTask}
              onToggleComplete={onToggleComplete}
              onToggleEditSelection={onToggleEditSelection}
              onTogglePendingDependency={onTogglePendingDependency}
            />
          );
        })}
      </div>
    </details>
  );
}
