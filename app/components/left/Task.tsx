"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import type { ChecklistMode, ChecklistState, ChecklistTaskDefinition, TaskId } from "../../lib/types";

type TaskProps = {
  task: ChecklistTaskDefinition;
  taskState: ChecklistState["tasks"][TaskId];
  category: string;
  index: number;
  mode: ChecklistMode;
  isSettingDependencies: boolean;
  selectedTaskId: TaskId | null;
  isSelected: boolean;
  isEditSelected: boolean;
  isPendingDependency: boolean;
  dependenciesComplete: boolean;
  onSelectTask: (taskId: TaskId) => void;
  onToggleComplete: (taskId: TaskId) => void;
  onToggleEditSelection: (taskId: TaskId) => void;
  onTogglePendingDependency: (taskId: TaskId) => void;
};

export function Task({
  task,
  taskState,
  category,
  index,
  mode,
  isSettingDependencies,
  selectedTaskId,
  isSelected,
  isEditSelected,
  isPendingDependency,
  dependenciesComplete,
  onSelectTask,
  onToggleComplete,
  onToggleEditSelection,
  onTogglePendingDependency,
}: TaskProps) {
  const canDrag = mode === "edit" && !isSettingDependencies;
  const showTaskModeCheckbox = mode === "task" && dependenciesComplete;
  const showEditSelectionCheckbox =
    mode === "edit" && (!isSettingDependencies || task.id !== selectedTaskId);

  const { ref, handleRef, isDragSource } = useSortable({
    id: task.id,
    index,
    group: category,
    disabled: !canDrag,
  });

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (mode === "edit" && isSettingDependencies) {
          return;
        }
        onSelectTask(task.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        if (mode === "edit" && isSettingDependencies) {
          return;
        }

        onSelectTask(task.id);
      }}
      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ${
        isSelected
          ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
          : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
      } ${isDragSource ? "opacity-60" : ""}`}
    >
      {canDrag && (
        <button
          type="button"
          ref={handleRef}
          onClick={(event) => event.stopPropagation()}
          className="cursor-grab select-none text-zinc-500 dark:text-zinc-400"
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </button>
      )}
      {showTaskModeCheckbox && (
        <input
          type="checkbox"
          checked={taskState.completed}
          onChange={(event) => {
            event.stopPropagation();
            onToggleComplete(task.id);
          }}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {showEditSelectionCheckbox && (
        <input
          type="checkbox"
          checked={isSettingDependencies ? isPendingDependency : isEditSelected}
          onChange={(event) => {
            event.stopPropagation();

            if (isSettingDependencies) {
              onTogglePendingDependency(task.id);
              return;
            }

            onToggleEditSelection(task.id);
          }}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {!showTaskModeCheckbox && !showEditSelectionCheckbox && <span className="w-4" />}
      <p
        className={`min-w-0 truncate text-sm font-medium ${
          mode === "task" && taskState.completed ? "line-through" : ""
        }`}
      >
        {task.title || "Untitled Task"}
        {mode === "task" && taskState.explicitlyHidden ? " (Hidden)" : ""}
      </p>
    </div>
  );
}
