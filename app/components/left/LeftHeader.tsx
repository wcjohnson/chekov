"use client";

import { MultiSelectContext } from "@/app/lib/utils";
import { useContext } from "react";

type LeftHeaderProps = {
  mode: "task" | "edit";
  visibleTasksCount: number;
  editSelectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
};

export function LeftHeader({
  mode,
  visibleTasksCount,

  editSelectedCount,
  onSelectAll,
  onClearSelection,
}: LeftHeaderProps) {
  const setEditContext = useContext(MultiSelectContext);
  const isEditingSet = !!setEditContext.editState;
  const setItemCount = setEditContext.editState?.selectedTaskSet.size ?? 0;

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
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={onSelectAll}
                disabled={isEditingSet || visibleTasksCount === 0}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={onClearSelection}
                disabled={
                  isEditingSet ? setItemCount === 0 : editSelectedCount === 0
                }
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Clear Selection
              </button>
            </>
          )}
        </div>
      </div>

      {isEditingSet && (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-medium text-zinc-700 dark:text-zinc-200">
            {setEditContext.editState?.headerText ?? "Editing Set"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditContext.editState?.onSetTasks(
                  setEditContext.editState.selectedTaskSet,
                );
                setEditContext.setEditState(null);
              }}
              className="rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setEditContext.setEditState(null);
              }}
              className="rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
