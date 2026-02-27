"use client";

import { Task } from "./Task";
import type { ChecklistMode, TaskBreakout, TaskId } from "../../lib/data/types";
import {
  DragDropReorderable,
  DragDropReorderableGroup,
  type DragDropStateType,
} from "../DragDrop";
import { MultiSelectContext } from "@/app/lib/context";
import { useContext, useRef, useState } from "react";
import {
  useDetailsQuery,
  useCategoryDependencyQuery,
  useCollapsedCategoriesQuery,
} from "@/app/lib/data/queries";
import { buildImplicitAndExpression } from "@/app/lib/booleanExpression";
import {
  useCategoryCollapsedMutation,
  useCategoryDependenciesMutation,
  useCreateTaskMutation,
  useMoveTaskMutation,
} from "@/app/lib/data/mutations";
import { Button } from "@/app/components/catalyst/button";
import { DependencyExpressionView } from "@/app/components/right/DependencyExpressionEditor";

const EMPTY_TASK_ID_SET = new Set<TaskId>();

type CategoryProps = {
  category: string;
  categoryIndex: number;
  taskBreakout: TaskBreakout;
  openTasks: Set<TaskId>;
  effectiveCompletions: Set<TaskId>;
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;
  onRequestTaskSelectionChange: (taskId: TaskId, isNew?: boolean) => void;
  onToggleComplete: (taskId: TaskId) => void;
};

export function Category({
  category,
  categoryIndex,
  taskBreakout,
  openTasks,
  effectiveCompletions,
  mode,
  selectedTaskId,
  onRequestTaskSelectionChange,
  onToggleComplete,
}: CategoryProps) {
  const visibleTasks = taskBreakout.categoryTasks.get(category);
  const categoryHandleRef = useRef<HTMLButtonElement>(null);
  const [dragState, setDragState] = useState<DragDropStateType>({
    isDragging: false,
  });
  const collapsedCategories = useCollapsedCategoriesQuery().data;
  const categoryCollapsedMutation = useCategoryCollapsedMutation();
  const categoryDependencies = useCategoryDependencyQuery(category).data;
  const categoryDependenciesMutation = useCategoryDependenciesMutation();
  const createTaskMutation = useCreateTaskMutation();
  const moveTaskMutation = useMoveTaskMutation();
  const details = useDetailsQuery().data;
  const multiSelectContext = useContext(MultiSelectContext);
  const isMultiSelecting = multiSelectContext.isActive();
  const canDragCategory = mode === "edit" && !isMultiSelecting;
  const dependencyTitleById = details
    ? new Map(
        Array.from(details.entries()).map(([taskId, taskDetail]) => [
          taskId,
          taskDetail.title,
        ]),
      )
    : new Map<TaskId, string>();

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
          <div className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/60">
            <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Current dependencies
            </p>
            {(() => {
              const expression = buildImplicitAndExpression(
                Array.from(multiSelectState.selectedTaskSet),
              );

              if (!expression) {
                return (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    None
                  </p>
                );
              }

              return (
                <DependencyExpressionView
                  mode="edit"
                  expression={expression}
                  dependencyTitleById={dependencyTitleById}
                  completionsWithReminders={EMPTY_TASK_ID_SET}
                />
              );
            })()}
          </div>
          <div className="mt-2 flex items-center gap-2">
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
                categoryDependenciesMutation.mutate({
                  category,
                  dependencies: multiSelectState.selectedTaskSet,
                });
                multiSelectContext.close();
              }}
              outline
              className="text-xs"
            >
              Confirm
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
    <DragDropReorderable
      index={categoryIndex}
      dragType="category"
      dragDisabled={!canDragCategory}
      dragHandleRef={categoryHandleRef}
      setDragDropState={setDragState}
      className={`py-1 ${dragState.isDragging ? "opacity-60" : ""}`}
    >
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
            <span className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-3">
              <Button
                type="button"
                small
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onEditDependencies();
                }}
                disabled={isMultiSelecting}
                outline
                className="text-xs"
              >
                Deps
              </Button>
              <button
                ref={categoryHandleRef}
                type="button"
                onClick={(event) => event.stopPropagation()}
                disabled={!canDragCategory}
                className="cursor-grab select-none text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400"
                aria-label="Drag category to reorder"
                title="Drag to reorder category"
              >
                ⋮⋮
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
            <Button
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
              outline
              className="mt-2 w-full justify-start border-dashed text-sm"
            >
              Add Task
            </Button>
          )}
        </div>
      </DragDropReorderableGroup>
    </DragDropReorderable>
  );
}
