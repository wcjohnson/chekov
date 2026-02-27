"use client";

import type { TaskDetail, ChecklistMode } from "@/app/lib/data/types";

type RightHeaderProps = {
  mode: ChecklistMode;
  selectedTaskId: string | null;
  selectedTaskDetail: TaskDetail | null | undefined;
  onDeleteTask: () => void;
};

export function RightHeader({
  mode,
  selectedTaskId,
  selectedTaskDetail,
  onDeleteTask,
}: RightHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {mode === "task"
          ? selectedTaskDetail?.title || "Task Details"
          : "Task Details"}
      </h2>
      {mode === "edit" && selectedTaskId && (
        <button
          type="button"
          onClick={onDeleteTask}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Delete Task
        </button>
      )}
    </div>
  );
}
