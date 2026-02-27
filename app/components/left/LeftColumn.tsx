"use client";

import { useState } from "react";
import type { ChecklistMode, TaskId } from "../../lib/data/types";
import { Category } from "./Category";
import { LeftHeader } from "./LeftHeader";
import { useTaskBreakout } from "@/app/lib/data/derivedData";
import {
  useCreateTaskMutation,
  useMoveCategoryMutation,
} from "@/app/lib/data/mutations";

type LeftColumnProps = {
  mode: ChecklistMode;
  showCompletedTasks: boolean;
  completionsWithReminders: Set<TaskId>;
  openTasks: Set<TaskId>;
  tasksMatchingSearch: Set<TaskId>;
  selectedTaskId: TaskId | null;
  onRequestTaskSelectionChange: (taskId: TaskId, isNew?: boolean) => void;
  onToggleComplete: (taskId: TaskId) => void;
};

export function LeftColumn({
  mode,
  showCompletedTasks,
  completionsWithReminders,
  openTasks,
  tasksMatchingSearch,
  selectedTaskId,
  onRequestTaskSelectionChange,
  onToggleComplete,
}: LeftColumnProps) {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const createTaskMutation = useCreateTaskMutation();
  const submitNewCategory = () => {
    const normalizedCategory = newCategoryName.trim();
    if (!normalizedCategory) {
      return;
    }
    createTaskMutation.mutate(normalizedCategory, {
      onSuccess: (taskId) => {
        if (taskId) {
          onRequestTaskSelectionChange(taskId, true);
        }
      },
    });

    setNewCategoryName("");
    setIsAddingCategory(false);
  };

  const moveCategoryMutation = useMoveCategoryMutation();
  const moveCategory = (fromIndex: number, toIndex: number) => {
    moveCategoryMutation.mutate({ fromIndex, toIndex });
  };

  const taskBreakout = useTaskBreakout(
    mode,
    showCompletedTasks,
    completionsWithReminders,
    openTasks,
    tasksMatchingSearch,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LeftHeader
        mode={mode}
        visibleTasksCount={taskBreakout.visibleTasks.size}
      />

      <div
        data-left-pane-scroll="true"
        className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto"
      >
        {taskBreakout.visibleCategories.map((category, index) => (
          <Category
            key={category}
            category={category}
            taskBreakout={taskBreakout}
            openTasks={openTasks}
            effectiveCompletions={completionsWithReminders}
            mode={mode}
            selectedTaskId={selectedTaskId}
            onRequestTaskSelectionChange={onRequestTaskSelectionChange}
            onToggleComplete={onToggleComplete}
            canMoveUp={index > 0}
            canMoveDown={index < taskBreakout.visibleCategories.length - 1}
            onMoveUp={() => moveCategory(index, index - 1)}
            onMoveDown={() => moveCategory(index, index + 1)}
          />
        ))}

        {mode === "edit" && !isAddingCategory && (
          <button
            type="button"
            onClick={() => setIsAddingCategory(true)}
            className="w-full rounded-md border border-dashed border-zinc-300 px-3 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Add Category
          </button>
        )}

        {mode === "edit" && isAddingCategory && (
          <div className="flex items-center gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
            <input
              type="text"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitNewCategory();
                }
              }}
              placeholder="Category name"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
              autoFocus
            />
            <button
              type="button"
              onClick={submitNewCategory}
              disabled={newCategoryName.trim().length === 0}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Confirm
            </button>
          </div>
        )}

        {taskBreakout.visibleTasks.size === 0 && (
          <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {"No tasks here. Add some or change your filters."}
          </p>
        )}
      </div>
    </div>
  );
}
