"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { useMemo, useRef, useState } from "react";
import type { ChecklistMode, TaskId, TaskBreakout } from "../../lib/types";
import { Category } from "./Category";
import { LeftHeader } from "./LeftHeader";
import {
  useCategories,
  useCategoriesTasks,
  useCreateTaskMutation,
  useMoveCategoryMutation,
  useMoveTaskMutation,
} from "@/app/lib/storage";
import { isSortable } from "@dnd-kit/react/sortable";

type LeftColumnProps = {
  mode: ChecklistMode;
  tasksWithCompleteDependencies: Set<TaskId>;
  tasksMatchingSearch: Set<TaskId>;
  selectedTaskId: TaskId | null;
  isSettingDependencies: boolean;
  editSelectedTaskIds: Set<TaskId>;
  pendingDependencyIds: Set<TaskId>;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSelectTask: (taskId: TaskId) => void;
  onToggleComplete: (taskId: TaskId) => void;
  onToggleEditSelection: (taskId: TaskId) => void;
  onTogglePendingDependency: (taskId: TaskId) => void;
};

export function LeftColumn({
  mode,
  tasksWithCompleteDependencies,
  tasksMatchingSearch,
  selectedTaskId,
  isSettingDependencies,
  editSelectedTaskIds,
  pendingDependencyIds,
  onSelectAll,
  onClearSelection,
  onSelectTask,
  onToggleComplete,
  onToggleEditSelection,
  onTogglePendingDependency,
}: LeftColumnProps) {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const createTaskMutation = useCreateTaskMutation();
  const submitNewCategory = () => {
    const normalizedCategory = newCategoryName.trim();
    if (!normalizedCategory) {
      return;
    }
    createTaskMutation.mutate(normalizedCategory);

    setNewCategoryName("");
    setIsAddingCategory(false);
  };

  const moveCategoryMutation = useMoveCategoryMutation();
  const moveCategory = (fromIndex: number, toIndex: number) => {
    moveCategoryMutation.mutate({ fromIndex, toIndex });
  };

  const categories = useCategories().data;
  const categoriesTasks = useCategoriesTasks().data;

  const taskBreakout: TaskBreakout = useMemo(() => {
    const visibleCategories: string[] = [];
    const categoryTasks = {} as Record<string, TaskId[]>;
    const orderedCategoryTasks: TaskId[][] = [];
    const visibleTasks = new Set<TaskId>();

    if (!categories || !categoriesTasks) {
      return {
        visibleCategories,
        categoryTasks,
        orderedCategoryTasks,
        visibleTasks,
      };
    }

    for (const category of categories) {
      const tasks = categoriesTasks[category] ?? [];
      const filtered = tasks.filter((taskId) => {
        const matchesSearch = tasksMatchingSearch.has(taskId);
        if (mode === "task") {
          const hasCompleteDependencies =
            tasksWithCompleteDependencies.has(taskId);
          return hasCompleteDependencies && matchesSearch;
        } else {
          return matchesSearch;
        }
      });
      // TODO: possible visibility bug here, when editing
      // show all the categories.
      if (filtered.length > 0) {
        visibleCategories.push(category);
        categoryTasks[category] = filtered;
        orderedCategoryTasks.push(filtered);
        filtered.forEach((taskId) => visibleTasks.add(taskId));
      }
    }
    return {
      visibleCategories,
      categoryTasks,
      orderedCategoryTasks,
      visibleTasks,
    };
  }, [
    tasksWithCompleteDependencies,
    tasksMatchingSearch,
    categories,
    mode,
    categoriesTasks,
  ]);

  const moveTaskMutation = useMoveTaskMutation();

  return (
    <>
      <LeftHeader
        mode={mode}
        visibleTasksCount={taskBreakout.visibleTasks.size}
        isSettingDependencies={isSettingDependencies}
        editSelectedCount={editSelectedTaskIds.size}
        pendingDependencyCount={pendingDependencyIds.size}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
      />

      <DragDropProvider
        onDragEnd={(event) => {
          const { source } = event.operation;
          if (event.canceled) {
            return;
          }
          if (!isSortable(source)) return;
          const { initialIndex, index, initialGroup, group } = source;
          if (initialIndex === index && initialGroup === group) {
            return;
          }
          if (!initialGroup || !group) {
            return;
          }

          moveTaskMutation.mutate({
            fromIndex: initialIndex,
            fromCategory: initialGroup as string,
            toCategory: group as string,
            toIndex: index,
          });
        }}
      >
        <div className="space-y-2">
          {taskBreakout.visibleCategories.map((category, index) => (
            <Category
              key={category}
              category={category}
              taskBreakout={taskBreakout}
              tasksWithCompleteDependencies={tasksWithCompleteDependencies}
              mode={mode}
              selectedTaskId={selectedTaskId}
              isSettingDependencies={isSettingDependencies}
              editSelectedTaskIds={editSelectedTaskIds}
              pendingDependencyIds={pendingDependencyIds}
              onSelectTask={onSelectTask}
              onToggleComplete={onToggleComplete}
              onToggleEditSelection={onToggleEditSelection}
              onTogglePendingDependency={onTogglePendingDependency}
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
      </DragDropProvider>
    </>
  );
}
