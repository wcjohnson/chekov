"use client";

import { MultiSelectContext } from "@/app/lib/context";
import { useContext, useEffect, useRef, useState } from "react";
import type { ChecklistMode, TaskId } from "../../lib/data/types";
import { Category } from "./Category";
import { LeftHeader } from "./LeftHeader";
import { DragDropReorderableGroup } from "../DragDrop";
import { Button } from "@/app/components/catalyst/button";
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
  const leftPaneScrollRef = useRef<HTMLDivElement | null>(null);
  const previousModeRef = useRef<ChecklistMode>(mode);

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
  const multiSelectContext = useContext(MultiSelectContext);
  const isMultiSelecting = multiSelectContext.isActive();

  const taskBreakout = useTaskBreakout(
    mode,
    showCompletedTasks,
    completionsWithReminders,
    openTasks,
    tasksMatchingSearch,
  );

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;

    if (previousMode === mode) {
      return;
    }

    if (!selectedTaskId || !taskBreakout.visibleTasks.has(selectedTaskId)) {
      return;
    }

    const scrollElement = leftPaneScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const taskRow = Array.from(
        scrollElement.querySelectorAll<HTMLElement>("[data-task-id]"),
      ).find((element) => element.dataset.taskId === selectedTaskId);

      taskRow?.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [mode, selectedTaskId, taskBreakout.visibleTasks]);

  return (
    <div className="relative flex h-full min-h-0 flex-col p-4">
      <LeftHeader
        mode={mode}
        visibleTasksCount={taskBreakout.visibleTasks.size}
      />

      {isMultiSelecting && multiSelectContext.state ? (
        <div className="pointer-events-none absolute inset-x-0 top-1 z-20 px-4">
          <div className="pointer-events-auto">
            {multiSelectContext.state.renderCustomHeader(
              multiSelectContext.state,
            )}
          </div>
        </div>
      ) : null}

      <div
        ref={leftPaneScrollRef}
        data-left-pane-scroll="true"
        className="mt-2 min-h-0 flex-1 overflow-y-auto -mx-4 px-4"
      >
        <DragDropReorderableGroup
          group="categories"
          onMoveItem={(fromGroup, fromIndex, toGroup, toIndex) => {
            if (mode !== "edit") {
              return;
            }

            if (fromGroup !== "categories" || toGroup !== "categories") {
              return;
            }

            const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;

            if (fromIndex === adjustedToIndex) {
              return;
            }

            moveCategory(fromIndex, adjustedToIndex);
          }}
        >
          {taskBreakout.visibleCategories.map((category, index) => (
            <Category
              key={category}
              category={category}
              categoryIndex={index}
              taskBreakout={taskBreakout}
              openTasks={openTasks}
              effectiveCompletions={completionsWithReminders}
              mode={mode}
              selectedTaskId={selectedTaskId}
              onRequestTaskSelectionChange={onRequestTaskSelectionChange}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </DragDropReorderableGroup>

        {mode === "edit" && !isAddingCategory && (
          <Button
            type="button"
            onClick={() => setIsAddingCategory(true)}
            outline
            className="mt-2 w-full justify-start border-dashed text-sm"
          >
            Add Category
          </Button>
        )}

        {mode === "edit" && isAddingCategory && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
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
            <Button
              type="button"
              onClick={submitNewCategory}
              disabled={newCategoryName.trim().length === 0}
              outline
              className="text-sm"
            >
              Confirm
            </Button>
          </div>
        )}

        {taskBreakout.visibleTasks.size === 0 && (
          <p className="mt-2 rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {"No tasks here. Add some or change your filters."}
          </p>
        )}
      </div>
    </div>
  );
}
