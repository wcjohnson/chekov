"use client";

import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
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
  setDefinition,
}: LeftColumnProps) {
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
          {tasks.categories.map((category) => (
            <Category
              key={category}
              category={category}
              tasks={tasks.tasksByCategory[category]}
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

          {taskVisibilityMap.size === 0 && (
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
