"use client";

import type { ChecklistMode, ChecklistTaskDefinition } from "../../lib/types";

type RightHeaderProps = {
  mode: ChecklistMode;
  selectedTask: ChecklistTaskDefinition | null;
};

export function RightHeader({ mode, selectedTask }: RightHeaderProps) {
  return (
    <h2 className="mb-3 text-lg font-semibold tracking-tight">
      {mode === "task" ? selectedTask?.title || "Task Details" : "Task Details"}
    </h2>
  );
}
