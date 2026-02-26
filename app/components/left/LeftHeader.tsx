"use client";

import { MultiSelectContext } from "@/app/lib/context";
import { useContext } from "react";

type LeftHeaderProps = {
  mode: "task" | "edit";
  visibleTasksCount: number;
};

export function LeftHeader({ mode, visibleTasksCount }: LeftHeaderProps) {
  const setEditContext = useContext(MultiSelectContext);
  const isEditingSet = !!setEditContext.state;

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {mode === "task" ? "Available Tasks" : "All Tasks"}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {visibleTasksCount}
          </span>
        </div>
      </div>

      {isEditingSet && setEditContext.state
        ? setEditContext.state.renderCustomHeader(setEditContext.state)
        : null}
    </div>
  );
}
