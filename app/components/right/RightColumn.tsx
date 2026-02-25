"use client";

import { RightHeader } from "./RightHeader";
import { TaskDetails } from "./TaskDetails";
import type { ChecklistMode, TaskId } from "../../lib/types";
import { useTaskDetailQuery } from "@/app/lib/storage";

type RightColumnProps = {
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;
  tasksWithCompleteDependencies: Set<TaskId>;
  errorMessage: string | null;
  isSettingDependencies: boolean;
  onStartSetDependencies: () => void;
  onConfirmSetDependencies: () => void;
  onClearSelectedTaskDependencies: () => void;
};

export function RightColumn({
  mode,
  selectedTaskId,
  tasksWithCompleteDependencies,
  errorMessage,
  isSettingDependencies,
  onStartSetDependencies,
  onConfirmSetDependencies,
  onClearSelectedTaskDependencies,
}: RightColumnProps) {
  const detail = useTaskDetailQuery(selectedTaskId ?? "").data;

  return (
    <>
      <RightHeader
        mode={mode}
        selectedTaskId={selectedTaskId}
        selectedTaskDetail={detail}
      />

      {!selectedTaskId && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Select a task to view details.
        </p>
      )}

      {selectedTaskId && (
        <div className="space-y-4">
          <TaskDetails
            mode={mode}
            selectedTaskId={selectedTaskId}
            selectedTaskDetail={detail}
            tasksWithCompleteDependencies={tasksWithCompleteDependencies}
            isSettingDependencies={isSettingDependencies}
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
