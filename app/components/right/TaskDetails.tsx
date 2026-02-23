"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChecklistMode,
  ChecklistState,
  ChecklistTaskDefinition,
  TaskId,
} from "../../lib/types";

type TaskDetailsProps = {
  mode: ChecklistMode;
  selectedTask: ChecklistTaskDefinition;
  selectedTaskCategory: string;
  state: ChecklistState;
  taskMap: Map<TaskId, ChecklistTaskDefinition>;
  isSettingDependencies: boolean;
  onDeleteSelectedTask: () => void;
  onUpdateTask: (
    taskId: TaskId,
    updater: (task: ChecklistTaskDefinition) => ChecklistTaskDefinition,
  ) => void;
  onUpdateTaskState: (
    taskId: TaskId,
    updater: (
      taskState: ChecklistState["tasks"][TaskId],
    ) => ChecklistState["tasks"][TaskId],
  ) => void;
  onStartSetDependencies: () => void;
  onConfirmSetDependencies: () => void;
  onClearSelectedTaskDependencies: () => void;
};

export function TaskDetails({
  mode,
  selectedTask,
  selectedTaskCategory,
  state,
  taskMap,
  isSettingDependencies,
  onDeleteSelectedTask,
  onUpdateTask,
  onUpdateTaskState,
  onStartSetDependencies,
  onConfirmSetDependencies,
  onClearSelectedTaskDependencies,
}: TaskDetailsProps) {
  const [tagInput, setTagInput] = useState("");

  const selectedTaskTags = useMemo(
    () => Array.from(selectedTask.tags ?? []),
    [selectedTask.tags],
  );

  const allKnownTags = useMemo(() => {
    const tags = new Set<string>();

    for (const task of taskMap.values()) {
      for (const tag of task.tags ?? []) {
        const normalized = tag.trim();
        if (normalized.length > 0) {
          tags.add(normalized);
        }
      }
    }

    return Array.from(tags).sort((left, right) => left.localeCompare(right));
  }, [taskMap]);

  const knownTagSet = useMemo(() => new Set(allKnownTags), [allKnownTags]);

  const addTag = (rawTag: string = tagInput) => {
    const normalizedTag = rawTag.trim();
    if (!normalizedTag) {
      return;
    }

    onUpdateTask(selectedTask.id, (task) => {
      const nextTags = new Set(task.tags ?? []);

      if (nextTags.has(normalizedTag)) {
        return task;
      }

      nextTags.add(normalizedTag);

      return {
        ...task,
        tags: nextTags,
      };
    });

    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    onUpdateTask(selectedTask.id, (task) => {
      const nextTags = new Set(task.tags ?? []);
      nextTags.delete(tagToRemove);

      if (nextTags.size === 0) {
        return {
          ...task,
          tags: undefined,
        };
      }

      return {
        ...task,
        tags: nextTags,
      };
    });
  };

  const datalistId = `known-tags-${selectedTask.id}`;

  if (mode === "edit") {
    return (
      <>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onDeleteSelectedTask}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Delete Task
          </button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Title</span>
          <input
            value={selectedTask.title}
            onChange={(event) =>
              onUpdateTask(selectedTask.id, (task) => ({
                ...task,
                title: event.target.value,
              }))
            }
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>
        <div>
          <p className="mb-2 text-sm font-medium">Dependencies</p>
          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            {selectedTask.dependencies.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
            ) : (
              <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                {selectedTask.dependencies.map((dependencyId) => {
                  const dependencyTask = taskMap.get(dependencyId);
                  return (
                    <li key={dependencyId}>
                      {dependencyTask?.title || dependencyId}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!isSettingDependencies && (
              <button
                type="button"
                onClick={onStartSetDependencies}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Set Dependencies
              </button>
            )}
            {isSettingDependencies && (
              <button
                type="button"
                onClick={onConfirmSetDependencies}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Confirm Dependencies
              </button>
            )}
            <button
              type="button"
              onClick={onClearSelectedTaskDependencies}
              disabled={selectedTask.dependencies.length === 0}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Clear Dependencies
            </button>
            {isSettingDependencies && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Select dependency tasks from the left pane, then confirm.
              </p>
            )}
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Description (Markdown)</span>
          <textarea
            value={selectedTask.description}
            onChange={(event) =>
              onUpdateTask(selectedTask.id, (task) => ({
                ...task,
                description: event.target.value,
              }))
            }
            rows={10}
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-zinc-700"
          />
        </label>

        <div>
          <p className="mb-2 text-sm font-medium">Tags</p>
          {selectedTaskTags.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {selectedTaskTags.map((tag) => (
                <button
                  key={`${selectedTask.id}-tag-remove-${tag}`}
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  title="Remove tag"
                >
                  {tag} ×
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
              No tags
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(event) => {
                const nextValue = event.target.value;
                setTagInput(nextValue);

                const normalized = nextValue.trim();
                if (normalized.length > 0 && knownTagSet.has(normalized)) {
                  addTag(normalized);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add tag"
              list={datalistId}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <datalist id={datalistId}>
              {allKnownTags.map((tag) => (
                <option
                  key={`${selectedTask.id}-tag-option-${tag}`}
                  value={tag}
                />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => addTag()}
              disabled={tagInput.trim().length === 0}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Add Tag
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <article className="prose prose-zinc max-w-none dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {selectedTask.description || "No description."}
        </ReactMarkdown>
      </article>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Category: {selectedTaskCategory}
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Completed: {state.tasks[selectedTask.id]?.completed ? "Yes" : "No"}
      </p>
      <div>
        <p className="mb-1 text-sm font-medium">Tags</p>
        {selectedTaskTags.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedTaskTags.map((tag) => (
              <span
                key={`${selectedTask.id}-tag-view-${tag}`}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() =>
            onUpdateTaskState(selectedTask.id, (taskState) => ({
              ...taskState,
              explicitlyHidden: true,
            }))
          }
          disabled={Boolean(state.tasks[selectedTask.id]?.explicitlyHidden)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Hide Task
        </button>
        <button
          type="button"
          onClick={() =>
            onUpdateTaskState(selectedTask.id, (taskState) => ({
              ...taskState,
              explicitlyHidden: false,
            }))
          }
          disabled={!Boolean(state.tasks[selectedTask.id]?.explicitlyHidden)}
          className="ml-2 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Unhide Task
        </button>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Dependencies</p>
        {selectedTask.dependencies.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
        ) : (
          <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            {selectedTask.dependencies.map((dependencyId) => {
              const dependencyTask = taskMap.get(dependencyId);
              const dependencyCompleted =
                state.tasks[dependencyId]?.completed ?? false;
              return (
                <li key={dependencyId}>
                  <span className={dependencyCompleted ? "line-through" : ""}>
                    {dependencyTask?.title || dependencyId}
                  </span>
                  {dependencyCompleted ? " (completed)" : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
