"use client";

import { RightHeader } from "./RightHeader";
import { TaskDetails } from "./TaskDetails";
import type {
  ChecklistMode,
  ChecklistState,
  ChecklistTaskDefinition,
  TaskId,
} from "../../lib/types";

type RightColumnProps = {
  mode: ChecklistMode;
  selectedTask: ChecklistTaskDefinition | null;
  isLoaded: boolean;
  errorMessage: string | null;
  state: ChecklistState;
  taskMap: Map<TaskId, ChecklistTaskDefinition>;
  isSettingDependencies: boolean;
  onDeleteSelectedTask: () => void;
  onUpdateTask: (
    taskId: TaskId,
    updater: (task: ChecklistTaskDefinition) => ChecklistTaskDefinition,
  ) => void;
  onUpdateTaskState: (
    taskId: TaskId,
    updater: (taskState: ChecklistState["tasks"][TaskId]) => ChecklistState["tasks"][TaskId],
  ) => void;
  onStartSetDependencies: () => void;
  onConfirmSetDependencies: () => void;
  onClearSelectedTaskDependencies: () => void;
};

export function RightColumn({
  mode,
  selectedTask,
  isLoaded,
  errorMessage,
  state,
  taskMap,
  isSettingDependencies,
  onDeleteSelectedTask,
  onUpdateTask,
  onUpdateTaskState,
  onStartSetDependencies,
  onConfirmSetDependencies,
  onClearSelectedTaskDependencies,
}: RightColumnProps) {
  return (
    <>
      <RightHeader mode={mode} selectedTask={selectedTask} />

      {!isLoaded && <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading checklist...</p>}

      {isLoaded && !selectedTask && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Select a task to view details.</p>
      )}

      {isLoaded && selectedTask && (
        <div className="space-y-4">
          <TaskDetails
            mode={mode}
            selectedTask={selectedTask}
            state={state}
            taskMap={taskMap}
            isSettingDependencies={isSettingDependencies}
            onDeleteSelectedTask={onDeleteSelectedTask}
            onUpdateTask={onUpdateTask}
            onUpdateTaskState={onUpdateTaskState}
            onStartSetDependencies={onStartSetDependencies}
            onConfirmSetDependencies={onConfirmSetDependencies}
            onClearSelectedTaskDependencies={onClearSelectedTaskDependencies}
          />
        </div>
      )}

      {errorMessage && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {errorMessage}
        </p>
      )}
    </>
  );
}
