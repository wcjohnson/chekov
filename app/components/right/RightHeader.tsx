"use client";

import type { ChecklistMode, ChecklistTaskDefinition } from "../../lib/types";

type RightHeaderProps = {
  mode: ChecklistMode;
  selectedTask: ChecklistTaskDefinition | null;
};

export function RightHeader({ mode, selectedTask }: RightHeaderProps) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">
      {mode === "task" ? selectedTask?.title || "Task Details" : "Task Details"}
    </h2>
  );
}
