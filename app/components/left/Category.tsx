"use client";

import { Task } from "./Task";
import type { ChecklistMode, TaskBreakout, TaskId } from "../../lib/data/types";
import { DragDropReorderableGroup } from "../DragDrop";
import { MultiSelectContext } from "@/app/lib/context";
import { useContext } from "react";
import {
  useCategoryDependencyQuery,
  useCollapsedCategoriesQuery,
} from "@/app/lib/data/queries";
import {
  useCategoryCollapsedMutation,
  useCategoryDependenciesMutation,
  useCreateTaskMutation,
  useMoveTaskMutation,
} from "@/app/lib/data/mutations";

type CategoryProps = {
  category: string;
  taskBreakout: TaskBreakout;
  openTasks: Set<TaskId>;
  effectiveCompletions: Set<TaskId>;
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;

  onRequestTaskSelectionChange: (taskId: TaskId, isNew?: boolean) => void;
  onToggleComplete: (taskId: TaskId) => void;

  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export function Category({
  category,
  taskBreakout,
  openTasks,
  effectiveCompletions,
  mode,
  selectedTaskId,

  onRequestTaskSelectionChange,
  onToggleComplete,

  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: CategoryProps) {
  const visibleTasks = taskBreakout.categoryTasks.get(category);
  const collapsedCategories = useCollapsedCategoriesQuery().data;
  const categoryCollapsedMutation = useCategoryCollapsedMutation();
  const categoryDependencies = useCategoryDependencyQuery(category).data;
  const categoryDependenciesMutation = useCategoryDependenciesMutation();
  const createTaskMutation = useCreateTaskMutation();
  const moveTaskMutation = useMoveTaskMutation();
  const multiSelectContext = useContext(MultiSelectContext);
  const isMultiSelecting = multiSelectContext.isActive();

  const onEditDependencies = () => {
    const headerText = `Editing dependencies for category ${category}`;

    multiSelectContext.setState({
      selectionContext: "categoryDependencies",
      selectedTaskSet: new Set(categoryDependencies ?? new Set()),
      renderCustomHeader: (multiSelectState) => (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-medium text-zinc-700 dark:text-zinc-200">
            {headerText}
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
                categoryDependenciesMutation.mutate({
                  category,
                  dependencies: multiSelectState.selectedTaskSet,
                });
                multiSelectContext.close();
              }}
              className="rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Confirm
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
  };

  if (!visibleTasks || visibleTasks.length === 0) {
    return null;
  }

  const collapsedTaskCategories = collapsedCategories?.task;
  const collapsedEditCategories = collapsedCategories?.edit;
  const isOpen =
    (mode === "task" && !collapsedTaskCategories?.has(category)) ||
    (mode === "edit" && !collapsedEditCategories?.has(category));

  return (
    <DragDropReorderableGroup
      as="details"
      group={category}
      onMoveItem={(fromGroup, fromIndex, toGroup, toIndex) => {
        if (!fromGroup || !toGroup) {
          return;
        }
        moveTaskMutation.mutate({
          fromCategory: fromGroup,
          fromIndex,
          toCategory: toGroup,
          toIndex,
        });
      }}
      open={isOpen}
      onToggle={(event) => {
        categoryCollapsedMutation.mutate({
          mode,
          category,
          isHidden: !event.currentTarget.open,
        });
      }}
      className="rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <summary className="relative cursor-pointer select-none px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900">
        <span className="inline-flex items-center gap-2 pr-24">
          <span className="text-sm font-medium">
            {category} ({visibleTasks.length})
          </span>
        </span>
        {mode === "edit" && (
          <span className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onEditDependencies();
              }}
              disabled={isMultiSelecting}
              className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Deps
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onMoveUp();
              }}
              disabled={!canMoveUp}
              className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Up
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onMoveDown();
              }}
              disabled={!canMoveDown}
              className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Down
            </button>
          </span>
        )}
      </summary>
      <div className="px-2 pb-2">
        {visibleTasks.map((taskId, index) => {
          return (
            <Task
              key={taskId}
              taskId={taskId}
              index={index}
              mode={mode}
              isSelected={selectedTaskId === taskId}
              openersComplete={openTasks.has(taskId)}
              isEffectivelyComplete={effectiveCompletions.has(taskId)}
              onRequestTaskSelectionChange={onRequestTaskSelectionChange}
              onToggleComplete={onToggleComplete}
            />
          );
        })}
        {mode === "edit" && (
          <button
            type="button"
            onClick={() =>
              createTaskMutation.mutate(category, {
                onSuccess: (taskId) => {
                  if (taskId) {
                    onRequestTaskSelectionChange(taskId, true);
                  }
                },
              })
            }
            className="mt-2 w-full rounded-md border border-dashed border-zinc-300 px-3 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Add Task
          </button>
        )}
      </div>
    </DragDropReorderableGroup>
  );
}
