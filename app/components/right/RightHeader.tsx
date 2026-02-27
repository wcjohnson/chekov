"use client";

import type { TaskDetail, ChecklistMode } from "@/app/lib/data/types";

type RightHeaderProps = {
  mode: ChecklistMode;
  selectedTaskId: string | null;
  selectedTaskDetail: TaskDetail | null | undefined;
};

export function RightHeader({
  mode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selectedTaskId,
  selectedTaskDetail,
}: RightHeaderProps) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">
      {mode === "task"
        ? selectedTaskDetail?.title || "Task Details"
        : "Task Details"}
    </h2>
  );
}
