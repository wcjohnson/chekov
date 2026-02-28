"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getEffectiveTagColorKey,
  getTagSwatchClasses,
  TAG_COLOR_OPTIONS,
} from "../../lib/tagColors";
import {
  type ChecklistMode,
  type DependencyExpression,
  type TaskDependencies,
  type TaskId,
  type TaskDetail,
  type TaskValues,
} from "@/app/lib/data/types";
import { toast } from "react-hot-toast";
import { buildImplicitAndExpression } from "@/app/lib/booleanExpression";
import { MultiSelectContext } from "@/app/lib/context";
import {
  DependencyExpressionEditor,
  DependencyExpressionView,
} from "./DependencyExpressionEditor";
import { Button } from "@/app/components/catalyst/button";
import { Badge, BadgeButton } from "@/app/components/catalyst/badge";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/app/components/catalyst/dropdown";
import {
  useAllKnownTagsQuery,
  useDetailsQuery,
  useTagColorsQuery,
  useTaskDependenciesQuery,
  useTaskHiddenQuery,
  useTaskReminderQuery,
  useTaskTagsQuery,
  useTaskValuesQuery,
} from "@/app/lib/data/queries";
import {
  useTagColorMutation,
  useTaskAddTagMutation,
  useTaskDependenciesMutation,
  useTaskDetailMutation,
  useTaskHiddenMutation,
  useTaskReminderMutation,
  useTaskRemoveTagMutation,
  useTaskValuesMutation,
} from "@/app/lib/data/mutations";
import { DependencyCycleError } from "@/app/lib/utils";

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
  const [valueKeyInput, setValueKeyInput] = useState("");
  const [valueNumberInput, setValueNumberInput] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const multiSelectContext = useContext(MultiSelectContext);

  const selectedTaskTags =
    useTaskTagsQuery(selectedTaskId ?? "").data ?? new Set();
  const selectedTaskValues =
    useTaskValuesQuery(selectedTaskId ?? "").data ?? {};
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
    taskRemoveTagMutation.mutate({
      taskId: selectedTaskId ?? "",
      tag: tagToRemove,
    });
  };

  const taskValuesMutation = useTaskValuesMutation();
  const addTaskValue = () => {
    const normalizedKey = valueKeyInput.trim();
    const normalizedNumber = Number(valueNumberInput);
    if (!selectedTaskId || normalizedKey.length === 0) {
      return;
    }

    if (!Number.isFinite(normalizedNumber)) {
      return;
    }

    taskValuesMutation.mutate({
      taskId: selectedTaskId,
      taskValues: {
        ...selectedTaskValues,
        [normalizedKey]: normalizedNumber,
      },
    });
    setValueKeyInput("");
    setValueNumberInput("");
  };

  const removeTaskValue = (valueKey: string) => {
    if (!selectedTaskId) {
      return;
    }

    const nextTaskValues: TaskValues = { ...selectedTaskValues };
    delete nextTaskValues[valueKey];

    taskValuesMutation.mutate({
      taskId: selectedTaskId,
      taskValues: nextTaskValues,
    });
  };

  const taskDetailMutation = useTaskDetailMutation();
  const taskReminderMutation = useTaskReminderMutation();
  const taskHiddenMutation = useTaskHiddenMutation();
  const taskDependenciesMutation = useTaskDependenciesMutation();

  const formatCycleTaskChain = (cycle: TaskId[]) => {
    return cycle
      .map((taskId) => details?.get(taskId)?.title ?? taskId)
      .join(" → ");
  };

  const formatDependencyKindLabel = (
    dependencyKind?: "openers" | "closers",
  ) => {
    if (dependencyKind === "closers") {
      return "Closer";
    }

    return "Opener";
  };

  const mutateTaskDependencies = (taskDependencies: TaskDependencies) => {
    taskDependenciesMutation.mutate(
      {
        taskId: selectedTaskId ?? "",
        taskDependencies,
      },
      {
        onError: (error) => {
          if (error instanceof DependencyCycleError) {
            const cycleChain = formatCycleTaskChain(error.cycle);
            const dependencyKindLabel = formatDependencyKindLabel(
              error.dependencyKind,
            );

            toast.error(
              `${dependencyKindLabel} dependency cycle is not allowed: ${cycleChain}`,
            );
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
                >
                  <Dropdown>
                    <DropdownButton
                      as={BadgeButton}
                      type="button"
                      color={getEffectiveTagColorKey(tagColors.get(tag))}
                    >
                      {tag}
                    </DropdownButton>
                    <DropdownMenu anchor="top start" className="w-52">
                      {TAG_COLOR_OPTIONS.map((colorOption) => {
                        const isSelected =
                          getEffectiveTagColorKey(tagColors.get(tag)) ===
                          colorOption.key;

                        return (
                          <DropdownItem
                            key={`${selectedTaskId}-tag-color-${tag}-${colorOption.key}`}
                            onClick={() => {
                              tagColorMutation.mutate({
                                tag,
                                colorKey: colorOption.key,
                              });
                            }}
                          >
                            <span
                              data-slot="icon"
                              aria-hidden="true"
                              className={`rounded border border-zinc-300 dark:border-zinc-700 ${getTagSwatchClasses(colorOption.key)} ${
                                isSelected
                                  ? "ring-2 ring-zinc-500 ring-offset-1 dark:ring-zinc-300 dark:ring-offset-zinc-950"
                                  : ""
                              }`}
                            />
                            <DropdownLabel>{colorOption.label}</DropdownLabel>
                          </DropdownItem>
                        );
                      })}
                    </DropdownMenu>
                  </Dropdown>
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

        <div>
          <p className="mb-2 text-sm font-medium">Values</p>
          {/* AGENT: Add edit-mode values UI for key/number pairs persisted via task values mutation. */}
          {Object.keys(selectedTaskValues).length === 0 ? (
            <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
              No values
            </p>
          ) : (
            <div className="mb-2 space-y-2">
              {Object.entries(selectedTaskValues)
                .sort(([leftKey], [rightKey]) =>
                  leftKey.localeCompare(rightKey),
                )
                .map(([valueKey, valueNumber]) => (
                  <div
                    key={`${selectedTaskId}-value-${valueKey}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <span className="font-medium">{valueKey}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {valueNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTaskValue(valueKey)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        title="Remove value"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={valueKeyInput}
              onChange={(event) => setValueKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTaskValue();
                }
              }}
              placeholder="Value name"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <input
              type="number"
              value={valueNumberInput}
              onChange={(event) => setValueNumberInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTaskValue();
                }
              }}
              placeholder="0"
              className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <button
              type="button"
              onClick={addTaskValue}
              disabled={
                valueKeyInput.trim().length === 0 ||
                !Number.isFinite(Number(valueNumberInput))
              }
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Add Value
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Add or update a value by key; setting a value to zero removes it.
          </p>
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
                color={getEffectiveTagColorKey(tagColors.get(tag))}
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
      <div>
        <p className="mb-1 text-sm font-medium">Values</p>
        {/* AGENT: Render read-only task values in task mode so details pane includes persisted value pairs. */}
        {Object.keys(selectedTaskValues).length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(selectedTaskValues)
              .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
              .map(([valueKey, valueNumber]) => (
                <span
                  key={`${selectedTaskId}-value-view-${valueKey}`}
                  className="rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {valueKey}: {valueNumber}
                </span>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
