"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTagSwatchClasses, TAG_COLOR_OPTIONS } from "../../lib/tagColors";
import {
  type ChecklistMode,
  type DependencyExpression,
  type TaskDependencies,
  type TaskId,
  type TaskDetail,
} from "@/app/lib/data/types";
import { toast } from "react-hot-toast";
import { buildImplicitAndExpression } from "@/app/lib/booleanExpression";
import { MultiSelectContext } from "@/app/lib/context";
import {
  DependencyExpressionEditor,
  DependencyExpressionView,
} from "./DependencyExpressionEditor";
import { Button } from "@/app/components/catalyst/button";
import { Badge } from "@/app/components/catalyst/badge";
import {
  useAllKnownTagsQuery,
  useDetailsQuery,
  useTagColorsQuery,
  useTaskDependenciesQuery,
  useTaskHiddenQuery,
  useTaskReminderQuery,
  useTaskTagsQuery,
} from "@/app/lib/data/queries";
import {
  useTagColorMutation,
  useTaskAddTagMutation,
  useTaskDependenciesMutation,
  useTaskDetailMutation,
  useTaskHiddenMutation,
  useTaskReminderMutation,
  useTaskRemoveTagMutation,
} from "@/app/lib/data/mutations";

const EMPTY_TASK_ID_SET = new Set<TaskId>();

type TaskDetailsProps = {
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;
  selectedTaskDetail: TaskDetail | null | undefined;
  completionsWithReminders: Set<TaskId>;
  openTasks: Set<TaskId>;
  shouldFocusTitle: boolean;
  onTitleFocused: () => void;
};

export function TaskDetails({
  mode,
  selectedTaskId,
  selectedTaskDetail,
  completionsWithReminders,
  openTasks,
  shouldFocusTitle,
  onTitleFocused,
}: TaskDetailsProps) {
  const [tagInput, setTagInput] = useState("");
  const [activeTagColorPickerTag, setActiveTagColorPickerTag] = useState<
    string | null
  >(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tagWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const multiSelectContext = useContext(MultiSelectContext);

  const selectedTaskTags =
    useTaskTagsQuery(selectedTaskId ?? "").data ?? new Set();
  // For openers/closers display
  const selectedTaskDependencies = useTaskDependenciesQuery(
    selectedTaskId ?? "",
  ).data;
  const selectedTaskOpeners = selectedTaskDependencies?.openers;
  const selectedTaskClosers = selectedTaskDependencies?.closers;
  const selectedTaskOpenersTaskSet = useMemo(
    () => selectedTaskOpeners?.taskSet ?? EMPTY_TASK_ID_SET,
    [selectedTaskOpeners],
  );
  const selectedTaskClosersTaskSet = useMemo(
    () => selectedTaskClosers?.taskSet ?? EMPTY_TASK_ID_SET,
    [selectedTaskClosers],
  );
  const selectedTaskOpenersExpression = selectedTaskOpeners?.expression ?? null;
  const selectedTaskClosersExpression = selectedTaskClosers?.expression ?? null;
  const isReminderTask =
    useTaskReminderQuery(selectedTaskId ?? "").data ?? false;
  const isTaskHidden = useTaskHiddenQuery(selectedTaskId ?? "").data ?? false;
  const isEffectivelyCompleted = isReminderTask
    ? openTasks.has(selectedTaskId ?? "")
    : completionsWithReminders.has(selectedTaskId ?? "");

  const knownTagSet = useAllKnownTagsQuery().data;
  const details = useDetailsQuery().data;
  const openerTitleById = useMemo(() => {
    const map = new Map<TaskId, string>();
    for (const dependencyId of selectedTaskOpenersTaskSet) {
      const dependencyDetail = details?.get(dependencyId);
      map.set(dependencyId, dependencyDetail?.title ?? dependencyId);
    }
    return map;
  }, [details, selectedTaskOpenersTaskSet]);
  const closerTitleById = useMemo(() => {
    const map = new Map<TaskId, string>();
    for (const dependencyId of selectedTaskClosersTaskSet) {
      const dependencyDetail = details?.get(dependencyId);
      map.set(dependencyId, dependencyDetail?.title ?? dependencyId);
    }
    return map;
  }, [details, selectedTaskClosersTaskSet]);
  const taskModeOpenersExpression = useMemo(() => {
    return (
      selectedTaskOpenersExpression ??
      buildImplicitAndExpression(Array.from(selectedTaskOpenersTaskSet))
    );
  }, [selectedTaskOpenersExpression, selectedTaskOpenersTaskSet]);
  const taskModeCloserExpression = useMemo(() => {
    return (
      selectedTaskClosersExpression ??
      buildImplicitAndExpression(Array.from(selectedTaskClosersTaskSet))
    );
  }, [selectedTaskClosersExpression, selectedTaskClosersTaskSet]);
  const openerEditorDependencyExpression = useMemo(() => {
    if (selectedTaskOpenersTaskSet.size === 0) {
      return null;
    }

    return {
      taskSet: new Set(selectedTaskOpenersTaskSet),
      ...(selectedTaskOpenersExpression
        ? { expression: selectedTaskOpenersExpression }
        : {}),
    } satisfies DependencyExpression;
  }, [selectedTaskOpenersTaskSet, selectedTaskOpenersExpression]);
  const closerEditorDependencyExpression = useMemo(() => {
    if (selectedTaskClosersTaskSet.size === 0) {
      return null;
    }

    return {
      taskSet: new Set(selectedTaskClosersTaskSet),
      ...(selectedTaskClosersExpression
        ? { expression: selectedTaskClosersExpression }
        : {}),
    } satisfies DependencyExpression;
  }, [selectedTaskClosersTaskSet, selectedTaskClosersExpression]);
  const allKnownTags = useMemo(() => {
    return Array.from(knownTagSet ?? []).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [knownTagSet]);

  const taskAddTagMutation = useTaskAddTagMutation();
  const addTag = (rawTag: string = tagInput) => {
    taskAddTagMutation.mutate({
      taskId: selectedTaskId ?? "",
      tag: rawTag,
    });
    setTagInput("");
  };

  const taskRemoveTagMutation = useTaskRemoveTagMutation();
  const removeTag = (tagToRemove: string) => {
    if (activeTagColorPickerTag === tagToRemove) {
      setActiveTagColorPickerTag(null);
    }
    taskRemoveTagMutation.mutate({
      taskId: selectedTaskId ?? "",
      tag: tagToRemove,
    });
  };

  const taskDetailMutation = useTaskDetailMutation();
  const taskReminderMutation = useTaskReminderMutation();
  const taskHiddenMutation = useTaskHiddenMutation();
  const taskDependenciesMutation = useTaskDependenciesMutation();

  const mutateTaskDependencies = (taskDependencies: TaskDependencies) => {
    taskDependenciesMutation.mutate(
      {
        taskId: selectedTaskId ?? "",
        taskDependencies,
      },
      {
        onError: (error) => {
          if (error instanceof Error && /cycle/i.test(error.message)) {
            toast.error("Circular dependency is not allowed.");
            return;
          }

          toast.error("Failed to update dependencies.");
        },
      },
    );
  };

  const tagColors = useTagColorsQuery().data ?? new Map();
  const tagColorMutation = useTagColorMutation();

  const datalistId = `known-tags-${selectedTaskId}`;

  useEffect(() => {
    if (mode !== "edit" || !shouldFocusTitle) {
      return;
    }

    titleInputRef.current?.focus();
    titleInputRef.current?.select();
    onTitleFocused();
  }, [mode, onTitleFocused, shouldFocusTitle]);

  useEffect(() => {
    if (!activeTagColorPickerTag) {
      return;
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const activeWrapper = tagWrapperRefs.current[activeTagColorPickerTag];

      if (!activeWrapper) {
        setActiveTagColorPickerTag(null);
        return;
      }

      if (activeWrapper.contains(event.target as Node)) {
        return;
      }

      setActiveTagColorPickerTag(null);
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTagColorPickerTag(null);
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [activeTagColorPickerTag]);

  if (mode === "edit") {
    const handleSetOpeners = (taskIds: Set<TaskId>) => {
      mutateTaskDependencies({
        openers: {
          taskSet: taskIds,
          expression: selectedTaskOpenersExpression ?? undefined,
        },
        closers: selectedTaskClosers,
      });
    };

    const handleClearOpeners = () => {
      mutateTaskDependencies({
        openers: {
          taskSet: new Set(),
          expression: undefined,
        },
        closers: selectedTaskClosers,
      });
    };

    const handleApplyOpeners = () => {
      if (!multiSelectContext.isActive("generic")) {
        return;
      }

      mutateTaskDependencies({
        openers: {
          taskSet: new Set(multiSelectContext.getSelection()),
          expression: selectedTaskOpenersExpression ?? undefined,
        },
        closers: selectedTaskClosers,
      });
    };

    const handleSetOpenersExpression = (
      nextDependencyExpression: DependencyExpression,
    ) => {
      mutateTaskDependencies({
        openers: nextDependencyExpression,
        closers: selectedTaskClosers,
      });
    };

    const handleSetClosers = (taskIds: Set<TaskId>) => {
      mutateTaskDependencies({
        openers: selectedTaskOpeners,
        closers: {
          taskSet: taskIds,
          expression: selectedTaskClosersExpression ?? undefined,
        },
      });
    };

    const handleClearClosers = () => {
      mutateTaskDependencies({
        openers: selectedTaskOpeners,
        closers: {
          taskSet: new Set(),
          expression: undefined,
        },
      });
    };

    const handleApplyClosers = () => {
      if (!multiSelectContext.isActive("generic")) {
        return;
      }

      mutateTaskDependencies({
        openers: selectedTaskOpeners,
        closers: {
          taskSet: new Set(multiSelectContext.getSelection()),
          expression: selectedTaskClosersExpression ?? undefined,
        },
      });
    };

    const handleSetClosersExpression = (
      nextDependencyExpression: DependencyExpression,
    ) => {
      mutateTaskDependencies({
        openers: selectedTaskOpeners,
        closers: nextDependencyExpression,
      });
    };

    return (
      <>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Title</span>
          <input
            ref={titleInputRef}
            key={selectedTaskId ?? ""}
            defaultValue={selectedTaskDetail?.title ?? ""}
            onBlur={(event) => {
              if (!selectedTaskId) {
                return;
              }

              const nextTitle = event.currentTarget.value;
              const persistedTitle = selectedTaskDetail?.title ?? "";
              if (nextTitle === persistedTitle) {
                return;
              }

              taskDetailMutation.mutate({
                taskId: selectedTaskId,
                title: nextTitle,
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>

        <div className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={isReminderTask}
              onChange={(event) =>
                taskReminderMutation.mutate({
                  taskId: selectedTaskId ?? "",
                  isReminder: event.target.checked,
                })
              }
            />
            <span className="font-medium">Reminder task</span>
          </label>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Reminders cannot be completed directly and are treated as completed
            when all dependencies are completed.
          </p>
        </div>

        <DependencyExpressionEditor
          key={`${selectedTaskId ?? "none"}-openers`}
          label="Openers"
          mode={mode}
          selectedTaskId={selectedTaskId}
          selectedTaskTitle={selectedTaskDetail?.title}
          selectionContext="openers"
          selectedTaskSet={selectedTaskOpenersTaskSet}
          dependencyIds={selectedTaskOpenersTaskSet}
          dependencyExpression={selectedTaskOpenersExpression}
          editorDependencyExpression={openerEditorDependencyExpression}
          dependencyTitleById={openerTitleById}
          completionsWithReminders={completionsWithReminders}
          onConfirmSelection={handleSetOpeners}
          onClearSelection={handleClearOpeners}
          onApplySelection={handleApplyOpeners}
          onSetDependencyExpression={handleSetOpenersExpression}
        />

        <DependencyExpressionEditor
          key={`${selectedTaskId ?? "none"}-closers`}
          label="Closers"
          mode={mode}
          selectedTaskId={selectedTaskId}
          selectedTaskTitle={selectedTaskDetail?.title}
          selectionContext="closers"
          selectedTaskSet={selectedTaskClosersTaskSet}
          dependencyIds={selectedTaskClosersTaskSet}
          dependencyExpression={selectedTaskClosersExpression}
          editorDependencyExpression={closerEditorDependencyExpression}
          dependencyTitleById={closerTitleById}
          completionsWithReminders={completionsWithReminders}
          onConfirmSelection={handleSetClosers}
          onClearSelection={handleClearClosers}
          onApplySelection={handleApplyClosers}
          onSetDependencyExpression={handleSetClosersExpression}
        />

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Description (Markdown)</span>
          <textarea
            key={`description-${selectedTaskId ?? ""}`}
            defaultValue={selectedTaskDetail?.description ?? ""}
            onBlur={(event) => {
              if (!selectedTaskId) {
                return;
              }

              const nextDescription = event.currentTarget.value;
              const persistedDescription =
                selectedTaskDetail?.description ?? "";
              if (nextDescription === persistedDescription) {
                return;
              }

              taskDetailMutation.mutate({
                taskId: selectedTaskId,
                description: nextDescription,
              });
            }}
            rows={10}
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-zinc-700"
          />
        </label>

        <div>
          <p className="mb-2 text-sm font-medium">Tags</p>
          {selectedTaskTags.size > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {Array.from(selectedTaskTags).map((tag) => (
                <div
                  key={`${selectedTaskId}-tag-remove-${tag}`}
                  className="flex items-center gap-1"
                  ref={(element) => {
                    tagWrapperRefs.current[tag] = element;
                  }}
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTagColorPickerTag((previous) =>
                          previous === tag ? null : tag,
                        );
                      }}
                      className="cursor-pointer list-none"
                    >
                      <Badge color={tagColors.get(tag) ?? "zinc"}>{tag}</Badge>
                    </button>
                    {activeTagColorPickerTag === tag && (
                      <div className="absolute left-0 z-20 mt-1 w-52 rounded-md border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                          Set tag color
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            tagColorMutation.mutate({ tag, colorKey: null });
                            setActiveTagColorPickerTag(null);
                          }}
                          className="mb-2 w-full text-left"
                        >
                          <Badge color="zinc">Default</Badge>
                        </button>
                        <div className="grid grid-cols-8 gap-1">
                          {TAG_COLOR_OPTIONS.map((colorOption) => {
                            const isSelected =
                              tagColors.get(tag) === colorOption.key;

                            return (
                              <button
                                key={`${selectedTaskId}-tag-color-${tag}-${colorOption.key}`}
                                type="button"
                                onClick={() => {
                                  tagColorMutation.mutate({
                                    tag,
                                    colorKey: colorOption.key,
                                  });
                                  setActiveTagColorPickerTag(null);
                                }}
                                title={colorOption.label}
                                className={`h-5 w-5 rounded border border-zinc-300 dark:border-zinc-700 ${getTagSwatchClasses(colorOption.key)} ${
                                  isSelected
                                    ? "ring-2 ring-zinc-500 ring-offset-1 dark:ring-zinc-300 dark:ring-offset-zinc-950"
                                    : ""
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    title="Remove tag"
                  >
                    ×
                  </button>
                </div>
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
                if (normalized.length > 0 && knownTagSet?.has(normalized)) {
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
                  key={`${selectedTaskId}-tag-option-${tag}`}
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
      {(selectedTaskDetail?.description?.length ?? 0) > 0 && (
        <article className="prose prose-zinc max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {selectedTaskDetail?.description ?? ""}
          </ReactMarkdown>
        </article>
      )}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Category: {selectedTaskDetail?.category ?? "Uncategorized"}
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Completed: {isEffectivelyCompleted ? "Yes" : "No"}
      </p>
      <div>
        <p className="mb-1 text-sm font-medium">Tags</p>
        {selectedTaskTags.size === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedTaskTags).map((tag) => (
              <Badge
                key={`${selectedTaskId}-tag-view-${tag}`}
                color={tagColors.get(tag) ?? "zinc"}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div>
        <Button
          type="button"
          onClick={() =>
            taskHiddenMutation.mutate({
              taskId: selectedTaskId ?? "",
              isHidden: true,
            })
          }
          disabled={isTaskHidden}
          outline
          className="text-sm"
        >
          Hide Task
        </Button>
        <Button
          type="button"
          onClick={() =>
            taskHiddenMutation.mutate({
              taskId: selectedTaskId ?? "",
              isHidden: false,
            })
          }
          disabled={!isTaskHidden}
          outline
          className="ml-2 text-sm"
        >
          Unhide Task
        </Button>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Openers</p>
        {!taskModeOpenersExpression ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
        ) : (
          <DependencyExpressionView
            mode={mode}
            expression={taskModeOpenersExpression}
            dependencyTitleById={openerTitleById}
            completionsWithReminders={completionsWithReminders}
          />
        )}
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Closers</p>
        {!taskModeCloserExpression ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
        ) : (
          <DependencyExpressionView
            mode={mode}
            expression={taskModeCloserExpression}
            dependencyTitleById={closerTitleById}
            completionsWithReminders={completionsWithReminders}
          />
        )}
      </div>
    </>
  );
}
