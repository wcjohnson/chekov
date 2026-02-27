"use client";

import type { TaskDetail, ChecklistMode } from "@/app/lib/data/types";
import { Button } from "@/app/components/catalyst/button";

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
        <Button
          type="button"
          small
          onClick={onDeleteTask}
          outline
          className="text-xs"
        >
          Delete Task
        </Button>
      )}
    </div>
  );
}
