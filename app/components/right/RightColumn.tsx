"use client";

import { RightHeader } from "./RightHeader";
import { TaskDetails } from "./TaskDetails";
import type { ChecklistMode, TaskId } from "../../lib/data/types";
import { useTaskDetailQuery } from "@/app/lib/data/queries";
import { useDeleteTasksMutation } from "@/app/lib/data/mutations";

type RightColumnProps = {
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;
  completionsWithReminders: Set<TaskId>;
  openTasks: Set<TaskId>;
  errorMessage: string | null;
  titleFocusTaskId: TaskId | null;
  onTitleFocused: () => void;
};

export function RightColumn({
  mode,
  selectedTaskId,
  completionsWithReminders,
  openTasks,
  errorMessage,
  titleFocusTaskId,
  onTitleFocused,
}: RightColumnProps) {
  const detail = useTaskDetailQuery(selectedTaskId ?? "").data;
  const deleteTasksMutation = useDeleteTasksMutation();

  const handleDeleteTask = () => {
    if (!selectedTaskId) {
      return;
    }

    deleteTasksMutation.mutate([selectedTaskId]);
  };

  return (
    <>
      <RightHeader
        mode={mode}
        selectedTaskId={selectedTaskId}
        selectedTaskDetail={detail}
        onDeleteTask={handleDeleteTask}
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
            completionsWithReminders={completionsWithReminders}
            openTasks={openTasks}
            shouldFocusTitle={titleFocusTaskId === selectedTaskId}
            onTitleFocused={onTitleFocused}
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
