"use client";

import { MultiSelectContext } from "@/app/lib/context";
import { useDeleteTasksMutation } from "@/app/lib/data/mutations";
import { useContext } from "react";

type LeftHeaderProps = {
  mode: "task" | "edit";
  visibleTasksCount: number;
};

export function LeftHeader({ mode, visibleTasksCount }: LeftHeaderProps) {
  const multiSelectContext = useContext(MultiSelectContext);
  const isMultiSelecting = multiSelectContext.isActive();
  const deleteTasksMutation = useDeleteTasksMutation();

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
            <button
              type="button"
              onClick={() => {
                multiSelectContext.setState({
                  selectionContext: "generic",
                  selectedTaskSet: new Set(),
                  renderCustomHeader: (multiSelectState) => (
                    <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                      <p className="font-medium text-zinc-700 dark:text-zinc-200">
                        Multi-select tasks
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            multiSelectContext.selectAll();
                          }}
                          className="rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            multiSelectContext.clearSelection();
                          }}
                          className="rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          Clear Selection
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteTasksMutation.mutate(
                              Array.from(multiSelectState.selectedTaskSet),
                            );
                            multiSelectContext.close();
                          }}
                          disabled={multiSelectState.selectedTaskSet.size === 0}
                          className="rounded-md border border-zinc-300 px-2 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          Delete Selected
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            multiSelectContext.close();
                          }}
                          className="rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ),
                });
              }}
              disabled={isMultiSelecting}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Multiselect
            </button>
          )}
        </div>
      </div>

      {isMultiSelecting && multiSelectContext.state
        ? multiSelectContext.state.renderCustomHeader(multiSelectContext.state)
        : null}
    </div>
  );
}
