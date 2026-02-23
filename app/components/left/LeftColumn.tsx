"use client";

import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useState } from "react";
import type {
  ChecklistDefinition,
  ChecklistMode,
  ChecklistState,
  TaskId,
} from "../../lib/types";
import { Category } from "./Category";
import { LeftHeader } from "./LeftHeader";

type LeftColumnProps = {
  mode: ChecklistMode;
  tasks: ChecklistDefinition;
  taskVisibilityMap: Map<TaskId, boolean>;
  state: ChecklistState;
  selectedTaskId: TaskId | null;
  isSettingDependencies: boolean;
  editSelectedTaskIds: Set<TaskId>;
  pendingDependencyIds: Set<TaskId>;
  isSearchActive: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSelectTask: (taskId: TaskId) => void;
  onToggleComplete: (taskId: TaskId) => void;
  onToggleEditSelection: (taskId: TaskId) => void;
  onTogglePendingDependency: (taskId: TaskId) => void;
  onAddTaskToCategory: (category: string) => void;
  onAddCategory: (categoryName: string) => void;
  setDefinition: (
    updater: (prev: ChecklistDefinition) => ChecklistDefinition,
  ) => void;
};

export function LeftColumn({
  mode,
  tasks,
  taskVisibilityMap,
  state,
  selectedTaskId,
  isSettingDependencies,
  editSelectedTaskIds,
  pendingDependencyIds,
  isSearchActive,
  onSelectAll,
  onClearSelection,
  onSelectTask,
  onToggleComplete,
  onToggleEditSelection,
  onTogglePendingDependency,
  onAddTaskToCategory,
  onAddCategory,
  setDefinition,
}: LeftColumnProps) {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const submitNewCategory = () => {
    const normalizedCategory = newCategoryName.trim();
    if (!normalizedCategory) {
      return;
    }

    onAddCategory(normalizedCategory);
    setNewCategoryName("");
    setIsAddingCategory(false);
  };

  const moveCategory = (fromIndex: number, toIndex: number) => {
    setDefinition((previous) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= previous.categories.length ||
        toIndex >= previous.categories.length ||
        fromIndex === toIndex
      ) {
        return previous;
      }

      const categories = [...previous.categories];
      const [movedCategory] = categories.splice(fromIndex, 1);

      if (!movedCategory) {
        return previous;
      }

      categories.splice(toIndex, 0, movedCategory);

      return {
        ...previous,
        categories,
      };
    });
  };

  return (
    <>
      <LeftHeader
        mode={mode}
        visibleTasksCount={taskVisibilityMap.size}
        isSettingDependencies={isSettingDependencies}
        editSelectedCount={editSelectedTaskIds.size}
        pendingDependencyCount={pendingDependencyIds.size}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
      />

      <DragDropProvider
        onDragOver={(event) => {
          setDefinition((prev) => {
            return {
              ...prev,
              tasksByCategory: move(prev.tasksByCategory, event),
            };
          });
        }}
      >
        <div className="space-y-2">
          {tasks.categories.map((category, index) => (
            <Category
              key={category}
              category={category}
              tasks={tasks.tasksByCategory[category]}
              taskVisibilityMap={taskVisibilityMap}
              mode={mode}
              state={state}
              selectedTaskId={selectedTaskId}
              isSettingDependencies={isSettingDependencies}
              editSelectedTaskIds={editSelectedTaskIds}
              pendingDependencyIds={pendingDependencyIds}
              onSelectTask={onSelectTask}
              onToggleComplete={onToggleComplete}
              onToggleEditSelection={onToggleEditSelection}
              onTogglePendingDependency={onTogglePendingDependency}
              onAddTaskToCategory={onAddTaskToCategory}
              canMoveUp={index > 0}
              canMoveDown={index < tasks.categories.length - 1}
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

          {taskVisibilityMap.size === 0 && (
            <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              {mode === "task"
                ? isSearchActive
                  ? "No tasks match your search."
                  : "No incomplete, visible tasks currently satisfy dependency requirements."
                : "No tasks defined. Add one from the top bar."}
            </p>
          )}
        </div>
      </DragDropProvider>
    </>
  );
}
