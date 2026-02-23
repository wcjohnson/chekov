"use client";

import { DragDropProvider, type DragEndEvent, type DragOverEvent } from "@dnd-kit/react";
import { Category } from "./Category";
import { LeftHeader } from "./LeftHeader";
import type { ChecklistMode, ChecklistState, ChecklistTaskDefinition, TaskId } from "../../lib/types";

type LeftColumnProps = {
  mode: ChecklistMode;
  visibleTasks: ChecklistTaskDefinition[];
  tasksByCategory: Array<{ category: string; tasks: ChecklistTaskDefinition[] }>;
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
  onDragEnd: (event: Parameters<DragEndEvent>[0]) => void;
  onDragOver: (event: Parameters<DragOverEvent>[0]) => void;
};

export function LeftColumn({
  mode,
  visibleTasks,
  tasksByCategory,
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
  onDragEnd,
  onDragOver,
}: LeftColumnProps) {
  return (
    <>
      <LeftHeader
        mode={mode}
        visibleTasksCount={visibleTasks.length}
        isSettingDependencies={isSettingDependencies}
        editSelectedCount={editSelectedTaskIds.size}
        pendingDependencyCount={pendingDependencyIds.size}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
      />

      <DragDropProvider
        key={`dnd-${mode}-${isSettingDependencies ? "deps" : "normal"}`}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
      >
        <div className="space-y-2">
          {tasksByCategory.map(({ category, tasks }) => (
            <Category
              key={category}
              category={category}
              tasks={tasks}
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
            />
          ))}

          {visibleTasks.length === 0 && (
            <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              {mode === "task"
                ? isSearchActive
                  ? "No tasks match your search."
                  : "No incomplete, visible tasks currently satisfy dependency requirements."
                : "No tasks defined. Add one from the toolbar."}
            </p>
          )}
        </div>
      </DragDropProvider>
    </>
  );
}
