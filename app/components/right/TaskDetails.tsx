"use client";

import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getTagBadgeClasses,
  getTagSwatchClasses,
  TAG_COLOR_OPTIONS,
} from "../../lib/tagColors";
import {
  BooleanOp,
  type BooleanExpression,
  type ChecklistMode,
  type TaskId,
} from "../../lib/types";
import {
  buildImplicitAndExpression,
  getExpressionPrecedence,
  normalizeExpressionToDependencies,
} from "../../lib/booleanExpression";
import {
  useAllKnownTagsQuery,
  useDetailsQuery,
  useDeleteTasksMutation,
  useTagColorMutation,
  useTagColorsQuery,
  useTaskAddTagMutation,
  useTaskDependencyExpressionQuery,
  useTaskDependenciesQuery,
  useTaskDetailMutation,
  useTaskHiddenQuery,
  useTaskHiddenMutation,
  useTaskRemoveTagMutation,
  useTaskTagsQuery,
  type StoredTask,
  useTaskDependenciesMutation,
  useTaskReminderMutation,
  useTaskReminderQuery,
} from "@/app/lib/data";
import { MultiSelectContext } from "@/app/lib/context";
import { ExpressionEditor } from "../ExpressionEditor";

const EMPTY_TASK_ID_SET = new Set<TaskId>();

function ExpressionOperator({ operator }: { operator: BooleanOp }) {
  const label =
    operator === BooleanOp.And
      ? "AND"
      : operator === BooleanOp.Or
        ? "OR"
        : "NOT";

  return (
    <span className="font-mono text-[11px] font-semibold tracking-wide text-zinc-600 dark:text-zinc-300">
      {label}
    </span>
  );
}

function DependencyExpressionView({
  mode,
  expression,
  dependencyTitleById,
  completionsWithReminders,
}: {
  mode: ChecklistMode;
  expression: BooleanExpression;
  dependencyTitleById: Map<TaskId, string>;
  completionsWithReminders: Set<TaskId>;
}) {
  const renderExpression = (
    current: BooleanExpression,
    parentPrecedence: number,
    keyPrefix: string,
  ): ReactNode => {
    if (typeof current === "string") {
      const isCompleted = completionsWithReminders.has(current);
      return (
        <span
          key={`${keyPrefix}-task`}
          className={mode === "task" && isCompleted ? "line-through" : ""}
        >
          {dependencyTitleById.get(current) ?? current}
        </span>
      );
    }

    const currentPrecedence = getExpressionPrecedence(current);
    const [operator, ...operands] = current;

    let content: ReactNode;
    if (operator === BooleanOp.Not) {
      const operand = operands[0];
      content = (
        <>
          <ExpressionOperator operator={BooleanOp.Not} />{" "}
          {renderExpression(operand, currentPrecedence, `${keyPrefix}-not`)}
        </>
      );
    } else {
      content = (
        <>
          {operands.map((operand, index) => (
            <span key={`${keyPrefix}-${index}`}>
              {index > 0 && (
                <>
                  {" "}
                  <ExpressionOperator operator={operator} />{" "}
                </>
              )}
              {renderExpression(
                operand,
                currentPrecedence,
                `${keyPrefix}-${index}`,
              )}
            </span>
          ))}
        </>
      );
    }

    if (currentPrecedence < parentPrecedence) {
      return (
        <span key={`${keyPrefix}-group`}>
          (<span>{content}</span>)
        </span>
      );
    }

    return <span key={`${keyPrefix}-expr`}>{content}</span>;
  };

  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-300">
      {renderExpression(expression, 0, "dep")}
    </p>
  );
}

type TaskDetailsProps = {
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;
  selectedTaskDetail: StoredTask | null | undefined;
  completionsWithReminders: Set<TaskId>;
  tasksWithCompleteDependencies: Set<TaskId>;
};

function DependenciesSection({
  mode,
  selectedTaskId,
  selectedTaskDeps,
  dependencyExpression,
  dependencyTitleById,
  completionsWithReminders,
  isSettingDependencies,
  onEditDependencies,
  onClearDependencies,
}: {
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;
  selectedTaskDeps: Set<TaskId>;
  dependencyExpression: BooleanExpression | null;
  dependencyTitleById: Map<TaskId, string>;
  completionsWithReminders: Set<TaskId>;
  isSettingDependencies: boolean;
  onEditDependencies: () => void;
  onClearDependencies: () => void;
}) {
  const [isExpressionEditorOpen, setIsExpressionEditorOpen] = useState(false);
  const hasDependencies = selectedTaskDeps.size > 0;
  const dependencyIdList = useMemo(
    () => Array.from(selectedTaskDeps),
    [selectedTaskDeps],
  );
  const implicitExpression = useMemo(
    () => buildImplicitAndExpression(dependencyIdList),
    [dependencyIdList],
  );
  const effectiveDependencyExpression =
    dependencyExpression ?? implicitExpression;

  return (
    <>
      <div>
        <p className="mb-2 text-sm font-medium">Dependencies</p>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          {!effectiveDependencyExpression ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
          ) : (
            <DependencyExpressionView
              mode={mode}
              expression={effectiveDependencyExpression}
              dependencyTitleById={dependencyTitleById}
              completionsWithReminders={completionsWithReminders}
            />
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!isSettingDependencies && (
            <button
              type="button"
              onClick={onEditDependencies}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Set Dependencies
            </button>
          )}
          <button
            type="button"
            onClick={onClearDependencies}
            disabled={!hasDependencies}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Clear Dependencies
          </button>
          <button
            type="button"
            onClick={() => setIsExpressionEditorOpen(true)}
            disabled={!hasDependencies || isExpressionEditorOpen}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Edit Expression
          </button>
          {isSettingDependencies && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Select dependency tasks from the left pane, then confirm or cancel
              in the left header.
            </p>
          )}
        </div>
      </div>

      {hasDependencies && isExpressionEditorOpen && (
        <ExpressionEditor
          taskId={selectedTaskId}
          dependencyIds={selectedTaskDeps}
        />
      )}
    </>
  );
}

export function TaskDetails({
  mode,
  selectedTaskId,
  selectedTaskDetail,
  completionsWithReminders,
  tasksWithCompleteDependencies,
}: TaskDetailsProps) {
  const [tagInput, setTagInput] = useState("");
  const [activeTagColorPickerTag, setActiveTagColorPickerTag] = useState<
    string | null
  >(null);
  const tagWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setEditContext = useContext(MultiSelectContext);
  const isSettingDependencies =
    setEditContext.state?.selectionContext === "dependencies";

  const selectedTaskTags =
    useTaskTagsQuery(selectedTaskId ?? "").data ?? new Set();
  // For dependencies display
  const selectedTaskDepsData = useTaskDependenciesQuery(
    selectedTaskId ?? "",
  ).data;
  const selectedTaskDeps = useMemo(
    () => selectedTaskDepsData ?? EMPTY_TASK_ID_SET,
    [selectedTaskDepsData],
  );
  const selectedTaskDependencyExpression = useTaskDependencyExpressionQuery(
    selectedTaskId ?? "",
  ).data;
  const isReminderTask =
    useTaskReminderQuery(selectedTaskId ?? "").data ?? false;
  const isTaskHidden = useTaskHiddenQuery(selectedTaskId ?? "").data ?? false;
  const isEffectivelyCompleted = isReminderTask
    ? tasksWithCompleteDependencies.has(selectedTaskId ?? "")
    : completionsWithReminders.has(selectedTaskId ?? "");

  const knownTagSet = useAllKnownTagsQuery().data;
  const details = useDetailsQuery().data;
  const dependencyTitleById = useMemo(() => {
    const map = new Map<TaskId, string>();
    for (const dependencyId of selectedTaskDeps) {
      const dependencyDetail = details?.get(dependencyId);
      map.set(dependencyId, dependencyDetail?.title ?? dependencyId);
    }
    return map;
  }, [details, selectedTaskDeps]);
  const normalizedDependencyExpression = useMemo(() => {
    if (!selectedTaskDependencyExpression) {
      return null;
    }

    return normalizeExpressionToDependencies(
      selectedTaskDependencyExpression,
      selectedTaskDeps,
    );
  }, [selectedTaskDependencyExpression, selectedTaskDeps]);
  const taskModeDependencyExpression = useMemo(() => {
    return (
      normalizedDependencyExpression ??
      buildImplicitAndExpression(Array.from(selectedTaskDeps))
    );
  }, [normalizedDependencyExpression, selectedTaskDeps]);
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

  const deleteTasksMutation = useDeleteTasksMutation();
  const taskDetailMutation = useTaskDetailMutation();
  const taskReminderMutation = useTaskReminderMutation();
  const taskHiddenMutation = useTaskHiddenMutation();
  const taskDependenciesMutation = useTaskDependenciesMutation();

  const tagColors = useTagColorsQuery().data ?? new Map();
  const tagColorMutation = useTagColorMutation();

  const datalistId = `known-tags-${selectedTaskId}`;

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
    const handleSetTasks = (taskIds: Set<TaskId>) => {
      taskDependenciesMutation.mutate({
        taskId: selectedTaskId ?? "",
        dependencies: taskIds,
      });
    };

    const handleClearDependencies = () => {
      taskDependenciesMutation.mutate({
        taskId: selectedTaskId ?? "",
        dependencies: new Set(),
      });
    };

    const onEditDependencies = () => {
      setEditContext.setState({
        selectionContext: "dependencies",
        headerText: `Editing dependencies for ${selectedTaskDetail?.title ?? "unknown task"}`,
        selectedTaskSet: new Set(selectedTaskDeps),
        onSetTasks: handleSetTasks,
      });
    };

    return (
      <>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              if (selectedTaskId) {
                deleteTasksMutation.mutate([selectedTaskId]);
              }
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Delete Task
          </button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Title</span>
          <input
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

        <DependenciesSection
          key={selectedTaskId ?? "none"}
          mode={mode}
          selectedTaskId={selectedTaskId}
          selectedTaskDeps={selectedTaskDeps}
          dependencyExpression={normalizedDependencyExpression}
          dependencyTitleById={dependencyTitleById}
          completionsWithReminders={completionsWithReminders}
          isSettingDependencies={isSettingDependencies}
          onEditDependencies={onEditDependencies}
          onClearDependencies={handleClearDependencies}
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
                      className={`cursor-pointer list-none rounded border px-2 py-1 text-xs ${getTagBadgeClasses(tagColors.get(tag))}`}
                    >
                      {tag}
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
                          className={`mb-2 w-full rounded border px-2 py-1 text-left text-xs ${getTagBadgeClasses(undefined)}`}
                        >
                          Default
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
              <span
                key={`${selectedTaskId}-tag-view-${tag}`}
                className={`rounded border px-2 py-1 text-xs ${getTagBadgeClasses(tagColors.get(tag))}`}
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
            taskHiddenMutation.mutate({
              taskId: selectedTaskId ?? "",
              isHidden: true,
            })
          }
          disabled={isTaskHidden}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Hide Task
        </button>
        <button
          type="button"
          onClick={() =>
            taskHiddenMutation.mutate({
              taskId: selectedTaskId ?? "",
              isHidden: false,
            })
          }
          disabled={!isTaskHidden}
          className="ml-2 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Unhide Task
        </button>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Dependencies</p>
        {!taskModeDependencyExpression ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
        ) : (
          <DependencyExpressionView
            mode={mode}
            expression={taskModeDependencyExpression}
            dependencyTitleById={dependencyTitleById}
            completionsWithReminders={completionsWithReminders}
          />
        )}
      </div>
    </>
  );
}
