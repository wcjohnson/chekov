"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { getTagBadgeClasses } from "../../lib/tagColors";
import type { ChecklistMode, TaskId } from "../../lib/types";
import {
  useTagColors,
  useTaskCompletion,
  useTaskDetail,
  useTaskHidden,
  useTaskTags,
} from "@/app/lib/storage";

type TaskProps = {
  taskId: TaskId;
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
  taskId,
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
  const detail = useTaskDetail(taskId).data;
  const tags = Array.from(useTaskTags(taskId).data ?? []);
  const isComplete = useTaskCompletion(taskId).data ?? false;
  const isHidden = useTaskHidden(taskId).data ?? false;
  const tagColors = useTagColors().data ?? {};

  const canDrag = mode === "edit" && !isSettingDependencies;
  const showTaskModeCheckbox = mode === "task" && dependenciesComplete;
  const showEditSelectionCheckbox =
    mode === "edit" && (!isSettingDependencies || taskId !== selectedTaskId);
  const hasDescription = (detail?.description?.length ?? 0) > 0;

  const { ref, handleRef, isDragSource, isDragging } = useSortable({
    id: taskId,
    index,
    type: "task",
    accept: "task",
    group: category,
    disabled: !canDrag,
  });

  return (
    <div
      data-dragging={isDragging}
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (mode === "edit" && isSettingDependencies) {
          return;
        }
        onSelectTask(taskId);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        if (mode === "edit" && isSettingDependencies) {
          return;
        }

        onSelectTask(taskId);
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
          checked={isComplete}
          onChange={(event) => {
            event.stopPropagation();
            onToggleComplete(taskId);
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
              onTogglePendingDependency(taskId);
              return;
            }

            onToggleEditSelection(taskId);
          }}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {!showTaskModeCheckbox && !showEditSelectionCheckbox && (
        <span className="w-4" />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <p
          className={`min-w-0 flex-1 truncate text-sm font-medium ${
            mode === "task" && isComplete ? "line-through" : ""
          }`}
        >
          {detail?.title || "Untitled Task"}
          {mode === "task" && isHidden ? " (Hidden)" : ""}
        </p>
        {hasDescription && (
          <span
            className="shrink-0 text-zinc-500 dark:text-zinc-400"
            title="Has description"
            aria-label="Has description"
          >
            ✎
          </span>
        )}
      </div>
      {tags.length > 0 && (
        <div className="ml-auto flex max-w-[50%] items-center justify-end gap-1 overflow-hidden">
          {tags.map((tag) => (
            <span
              key={`${taskId}-tag-${tag}`}
              className={`max-w-28 truncate rounded border px-1.5 py-0.5 text-xs ${getTagBadgeClasses(tagColors[tag])}`}
              title={tag}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
