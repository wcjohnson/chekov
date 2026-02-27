"use client";

import { useMemo, useState } from "react";
import type { ChecklistMode, TaskId, TaskBreakout } from "../../lib/data/types";
import { Category } from "./Category";
import { LeftHeader } from "./LeftHeader";
import {
  useCreateTaskMutation,
  useMoveCategoryMutation,
} from "@/app/lib/data/mutations";
import {
  useCategoriesQuery,
  useCategoriesTasksQuery,
  useCategoryDependenciesQuery,
  useRemindersQuery,
} from "@/app/lib/data/queries";

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
  openTasks: tasksWithCompleteDependencies,
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

  const categories = useCategoriesQuery().data;
  const categoriesTasks = useCategoriesTasksQuery().data;
  const categoryDependencies = useCategoryDependenciesQuery().data;
  const allReminders = useRemindersQuery().data;

  const taskBreakout: TaskBreakout = useMemo(() => {
    const visibleCategories: string[] = [];
    const categoryTasks = new Map<string, TaskId[]>();
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
      // In task mode, only show categories whose deps are met.
      if (mode === "task") {
        const dependencies = categoryDependencies?.get(category);
        let dependenciesMet = true;
        if (dependencies) {
          for (const dependencyId of dependencies) {
            if (!completionsWithReminders.has(dependencyId)) {
              dependenciesMet = false;
              break;
            }
          }
        }

        if (!dependenciesMet) {
          continue;
        }
      }

      const tasks = categoriesTasks.get(category) ?? [];
      const filtered = tasks.filter((taskId) => {
        const matchesSearch = tasksMatchingSearch.has(taskId);
        const isReminder = allReminders?.has(taskId);
        if (mode === "task") {
          const hasCompleteDependencies =
            tasksWithCompleteDependencies.has(taskId);
          if (isReminder) {
            const shouldShow = !hasCompleteDependencies || showCompletedTasks;
            return shouldShow && matchesSearch;
          }

          const isCompleted = completionsWithReminders.has(taskId);
          const shouldShow =
            hasCompleteDependencies && (showCompletedTasks || !isCompleted);
          return shouldShow && matchesSearch;
        } else {
          return matchesSearch;
        }
      });
      // TODO: possible visibility bug here, when editing
      // show all the categories.
      if (filtered.length > 0) {
        visibleCategories.push(category);
        categoryTasks.set(category, filtered);
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
    categoryDependencies,
    allReminders,
    completionsWithReminders,
    showCompletedTasks,
  ]);

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
            tasksWithCompleteDependencies={tasksWithCompleteDependencies}
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
