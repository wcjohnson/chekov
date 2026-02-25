"use client";

import { getTagBadgeClasses } from "../../lib/tagColors";
import type { ChecklistMode, TaskId } from "../../lib/types";
import {
  useTagColorsQuery,
  useTaskCompletionQuery,
  useTaskDetailQuery,
  useTaskHiddenQuery,
  useTaskTagsQuery,
} from "@/app/lib/storage";
import { DragDropListItem, type DragDropItemStateType } from "../DragDrop";
import { useContext, useRef, useState } from "react";
import { MultiSelectContext } from "@/app/lib/context";

type TaskProps = {
  taskId: TaskId;
  index: number;
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;
  isSelected: boolean;
  isEditSelected: boolean;
  dependenciesComplete: boolean;
  onSelectTask: (taskId: TaskId) => void;
  onToggleComplete: (taskId: TaskId) => void;
  onToggleEditSelection: (taskId: TaskId) => void;
};

export function Task({
  taskId,
  index,
  mode,
  selectedTaskId,
  isSelected,
  isEditSelected,
  dependenciesComplete,
  onSelectTask,
  onToggleComplete,
  onToggleEditSelection,
}: TaskProps) {
  const detail = useTaskDetailQuery(taskId).data;
  const tags = Array.from(useTaskTagsQuery(taskId).data ?? []);
  const isComplete = useTaskCompletionQuery(taskId).data ?? false;
  const isHidden = useTaskHiddenQuery(taskId).data ?? false;
  const tagColors = useTagColorsQuery().data ?? new Map();
  const handleRef = useRef(null);
  const [dragState, setDragState] = useState<DragDropItemStateType>({
    isDragging: false,
  });

  const setEditContext = useContext(MultiSelectContext);
  const setEditState = setEditContext.state;

  const isEditingSet = !!setEditState;
  const isInEditedSet = Boolean(setEditState?.selectedTaskSet.has(taskId));

  const taskType = detail?.type === "warning" ? "warning" : "task";
  const isWarning = taskType === "warning";
  const isEffectivelyComplete = isWarning ? dependenciesComplete : isComplete;
  const canDrag = mode === "edit" && !isEditingSet;
  const showTaskModeCheckbox =
    mode === "task" && dependenciesComplete && !isWarning;
  const showEditSelectionCheckbox =
    mode === "edit" && (!isEditingSet || taskId !== selectedTaskId);
  const hasDescription = (detail?.description?.length ?? 0) > 0;

  return (
    <DragDropListItem
      index={index}
      dragHandleRef={handleRef}
      setDragDropState={setDragState}
      className="py-0.5 w-full"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (mode === "edit" && isEditingSet) {
            return;
          }
          onSelectTask(taskId);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }

          event.preventDefault();
          if (mode === "edit" && isEditingSet) {
            return;
          }

          onSelectTask(taskId);
        }}
        className={`flex w-full px-2 py-1.5 items-center gap-2 rounded-md border text-left ${
          isSelected
            ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
            : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
        } ${
          isWarning
            ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
            : ""
        } ${dragState.isDragging ? "opacity-60" : ""}`}
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
            checked={
              isEditingSet
                ? isWarning
                  ? false
                  : isInEditedSet
                : isEditSelected
            }
            disabled={isEditingSet && isWarning}
            onChange={(event) => {
              event.stopPropagation();

              if (isEditingSet) {
                if (isWarning) {
                  return;
                }
                const nextSelectedSet = new Set(setEditState.selectedTaskSet);
                if (isInEditedSet) {
                  nextSelectedSet.delete(taskId);
                } else {
                  nextSelectedSet.add(taskId);
                }
                setEditContext.setState({
                  ...setEditState,
                  selectedTaskSet: nextSelectedSet,
                });
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
              mode === "task" && isEffectivelyComplete ? "line-through" : ""
            }`}
          >
            {detail?.title || "Untitled Task"}
            {mode === "task" && isHidden ? " (Hidden)" : ""}
          </p>
          {isWarning && (
            <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300">
              Warning
            </span>
          )}
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
                className={`max-w-28 truncate rounded border px-1.5 py-0.5 text-xs ${getTagBadgeClasses(tagColors.get(tag))}`}
                title={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </DragDropListItem>
  );
}
