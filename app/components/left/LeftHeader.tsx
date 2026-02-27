"use client";

import { MultiSelectContext } from "@/app/lib/context";
import { useDeleteTasksMutation } from "@/app/lib/data/mutations";
import { useContext } from "react";
import { Button } from "@/app/components/catalyst/button";

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
            <Button
              type="button"
              small
              onClick={() => {
                multiSelectContext.setState({
                  selectionContext: "generic",
                  selectedTaskSet: new Set(),
                  renderCustomHeader: (multiSelectState) => (
                    <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => {
                            multiSelectContext.selectAll();
                          }}
                          outline
                          className="text-xs"
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            multiSelectContext.clearSelection();
                          }}
                          outline
                          className="text-xs"
                        >
                          Clear Selection
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            deleteTasksMutation.mutate(
                              Array.from(multiSelectState.selectedTaskSet),
                            );
                            multiSelectContext.close();
                          }}
                          disabled={multiSelectState.selectedTaskSet.size === 0}
                          outline
                          className="text-xs"
                        >
                          Delete Selected
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            multiSelectContext.close();
                          }}
                          outline
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ),
                });
              }}
              disabled={isMultiSelecting}
              outline
              className="text-xs"
            >
              Multiselect
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
