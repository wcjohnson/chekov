"use client";

import type { ChecklistMode, TaskId } from "../../lib/data/types";
import { DragDropReorderable, type DragDropStateType } from "../DragDrop";
import { useContext, useRef, useState } from "react";
import { MultiSelectContext } from "@/app/lib/context";
import { Badge } from "@/app/components/catalyst/badge";
import { getEffectiveTagColorKey } from "@/app/lib/tagColors";
import {
  useTagColorsQuery,
  useTaskCompletionQuery,
  useTaskDetailQuery,
  useTaskHiddenQuery,
  useTaskReminderQuery,
  useTaskTagsQuery,
} from "@/app/lib/data/queries";

type TaskProps = {
  taskId: TaskId;
  index: number;
  mode: ChecklistMode;
  isSelected: boolean;
  openersComplete: boolean;
  isEffectivelyComplete: boolean;
  onRequestTaskSelectionChange: (taskId: TaskId) => void;
  onToggleComplete: (taskId: TaskId) => void;
};

export function Task({
  taskId,
  index,
  mode,
  isSelected,
  openersComplete,
  isEffectivelyComplete,
  onRequestTaskSelectionChange,
  onToggleComplete,
}: TaskProps) {
  const detail = useTaskDetailQuery(taskId).data;
  const tags = Array.from(useTaskTagsQuery(taskId).data ?? []);
  const isComplete = useTaskCompletionQuery(taskId).data ?? false;
  const isReminder = useTaskReminderQuery(taskId).data ?? false;
  const isHidden = useTaskHiddenQuery(taskId).data ?? false;
  const tagColors = useTagColorsQuery().data ?? new Map();
  const handleRef = useRef(null);
  const [dragState, setDragState] = useState<DragDropStateType>({
    isDragging: false,
  });

  const multiSelectContext = useContext(MultiSelectContext);
  const multiSelectState = multiSelectContext.state;

  const isMultiSelecting = multiSelectContext.isActive();
  const activeMultiSelectState = isMultiSelecting ? multiSelectState : null;
  const isVisibleInMultiSelect =
    !activeMultiSelectState ||
    !activeMultiSelectState.taskFilter ||
    !!activeMultiSelectState.taskFilter(taskId, detail, activeMultiSelectState);
  const isInMultiSelection = multiSelectContext.getSelection().has(taskId);

  const canDrag = mode === "edit" && !isMultiSelecting;
  const showTaskModeCheckbox =
    mode === "task" && openersComplete && !isReminder;
  const isImplicitlyComplete = isEffectivelyComplete && !isComplete;
  const showEditSelectionCheckbox =
    mode === "edit" && isMultiSelecting && isVisibleInMultiSelect;
  const hasDescription = (detail?.description?.length ?? 0) > 0;
  const rowInteractionClasses = isReminder
    ? isSelected
      ? "border-amber-400 bg-amber-100 hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-900/40 dark:hover:bg-amber-900/40"
      : "border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/25 dark:hover:bg-amber-900/35"
    : isSelected
      ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
      : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900";

  return (
    <DragDropReorderable
      index={index}
      dragHandleRef={handleRef}
      setDragDropState={setDragState}
      className="py-0.5 w-full"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          onRequestTaskSelectionChange(taskId);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }

          event.preventDefault();
          onRequestTaskSelectionChange(taskId);
        }}
        className={`flex h-[34px] w-full px-2 py-1.5 items-center gap-2 rounded-md border text-left ${rowInteractionClasses} ${dragState.isDragging ? "opacity-60" : ""}`}
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
            checked={isEffectivelyComplete}
            disabled={isImplicitlyComplete}
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
            checked={isInMultiSelection}
            className="m-0 h-4"
            onChange={(event) => {
              event.stopPropagation();
              multiSelectContext.setTaskSelected(taskId, !isInMultiSelection);
            }}
            onClick={(event) => event.stopPropagation()}
          />
        )}
        {mode === "task" &&
          !showTaskModeCheckbox &&
          !showEditSelectionCheckbox && <span className="w-4" />}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <p
            className={`min-w-0 flex-1 truncate text-sm font-medium ${
              mode === "task" && isEffectivelyComplete ? "line-through" : ""
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
              🗒️
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="ml-auto flex max-w-[50%] items-center justify-end gap-1 overflow-hidden">
            {tags.map((tag) => (
              <Badge
                key={`${taskId}-tag-${tag}`}
                color={getEffectiveTagColorKey(tagColors.get(tag))}
                className="max-w-28 truncate"
                title={tag}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </DragDropReorderable>
  );
}
