"use client";

import { Task } from "./Task";
import type { ChecklistMode, TaskBreakout, TaskId } from "../../lib/types";
import {
  useCategoryCollapsedMutation,
  useCreateTaskMutation,
  useCollapsedCategoriesQuery,
  useMoveTaskMutation,
} from "@/app/lib/storage";
import { DragDropList } from "../DragDrop";

type CategoryProps = {
  category: string;
  taskBreakout: TaskBreakout;
  tasksWithCompleteDependencies: Set<TaskId>;
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;

  editSelectedTaskIds: Set<TaskId>;

  onSelectTask: (taskId: TaskId) => void;
  onToggleComplete: (taskId: TaskId) => void;
  onToggleEditSelection: (taskId: TaskId) => void;

  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export function Category({
  category,
  taskBreakout,
  tasksWithCompleteDependencies,
  mode,
  selectedTaskId,

  editSelectedTaskIds,

  onSelectTask,
  onToggleComplete,
  onToggleEditSelection,

  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: CategoryProps) {
  const visibleTasks = taskBreakout.categoryTasks.get(category);
  const collapsedCategories = useCollapsedCategoriesQuery().data;
  const categoryCollapsedMutation = useCategoryCollapsedMutation();
  const createTaskMutation = useCreateTaskMutation();
  const moveTaskMutation = useMoveTaskMutation();

  if (!visibleTasks || visibleTasks.length === 0) {
    return null;
  }

  const collapsedTaskCategories = collapsedCategories?.task;
  const collapsedEditCategories = collapsedCategories?.edit;
  const isOpen =
    (mode === "task" && !collapsedTaskCategories?.has(category)) ||
    (mode === "edit" && !collapsedEditCategories?.has(category));

  return (
    <DragDropList
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
              selectedTaskId={selectedTaskId}
              isSelected={selectedTaskId === taskId}
              isEditSelected={editSelectedTaskIds.has(taskId)}
              dependenciesComplete={tasksWithCompleteDependencies.has(taskId)}
              onSelectTask={onSelectTask}
              onToggleComplete={onToggleComplete}
              onToggleEditSelection={onToggleEditSelection}
            />
          );
        })}
        {mode === "edit" && (
          <button
            type="button"
            onClick={() => createTaskMutation.mutate(category)}
            className="mt-2 w-full rounded-md border border-dashed border-zinc-300 px-3 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Add Task
          </button>
        )}
      </div>
    </DragDropList>
  );
}
