"use client";

import { useMemo, useState } from "react";
import { BooleanOp, type BooleanExpression, type TaskId } from "../lib/types";
import {
  useTaskDependencyExpressionMutation,
  useTaskDependencyExpressionQuery,
} from "../lib/data";

function buildImplicitAndExpression(
  dependencyIds: Set<TaskId>,
): Extract<BooleanExpression, [BooleanOp.And, ...BooleanExpression[]]> {
  return [BooleanOp.And, ...Array.from(dependencyIds)];
}

function deepCloneExpression(expression: BooleanExpression): BooleanExpression {
  if (typeof expression === "string") {
    return expression;
  }

  const [operator, ...operands] = expression;
  const clonedOperands = operands.map((operand) =>
    deepCloneExpression(operand),
  );
  if (operator === BooleanOp.Not) {
    return [BooleanOp.Not, clonedOperands[0]];
  }

  if (operator === BooleanOp.And) {
    return [BooleanOp.And, ...clonedOperands];
  }

  return [BooleanOp.Or, ...clonedOperands];
}

function ensureEditableRoot(
  expression: BooleanExpression | null,
  dependencyIds: Set<TaskId>,
): Extract<
  BooleanExpression,
  [BooleanOp.And | BooleanOp.Or, ...BooleanExpression[]]
> {
  if (!expression) {
    return buildImplicitAndExpression(dependencyIds);
  }

  if (typeof expression === "string") {
    return [BooleanOp.And, expression];
  }

  const [operator] = expression;
  if (operator === BooleanOp.And || operator === BooleanOp.Or) {
    return expression;
  }

  return [BooleanOp.And, expression];
}

function normalizeToDependencies(
  expression: BooleanExpression,
  dependencyIds: Set<TaskId>,
): BooleanExpression | null {
  if (typeof expression === "string") {
    return dependencyIds.has(expression) ? expression : null;
  }

  const [operator, ...operands] = expression;
  if (operator === BooleanOp.Not) {
    const normalizedOperand = normalizeToDependencies(
      operands[0],
      dependencyIds,
    );
    if (!normalizedOperand) {
      return null;
    }

    return [BooleanOp.Not, normalizedOperand];
  }

  if (operator === BooleanOp.And || operator === BooleanOp.Or) {
    const normalizedOperands = operands
      .map((operand) => normalizeToDependencies(operand, dependencyIds))
      .filter((operand): operand is BooleanExpression => operand !== null);

    return [operator, ...normalizedOperands];
  }

  return null;
}

function unwrapNot(operand: BooleanExpression): {
  expression: BooleanExpression;
  negated: boolean;
} {
  if (typeof operand !== "string" && operand[0] === BooleanOp.Not) {
    return { expression: operand[1], negated: true };
  }

  return { expression: operand, negated: false };
}

function wrapNotIfNeeded(
  expression: BooleanExpression,
  negated: boolean,
): BooleanExpression {
  return negated ? [BooleanOp.Not, expression] : expression;
}

function setNodeAtPath(
  expression: BooleanExpression,
  path: number[],
  updater: (node: BooleanExpression) => BooleanExpression,
): BooleanExpression {
  if (path.length === 0) {
    return updater(expression);
  }

  if (typeof expression === "string") {
    return expression;
  }

  const [operator, ...operands] = expression;
  if (operator !== BooleanOp.And && operator !== BooleanOp.Or) {
    return expression;
  }

  const [nextIndex, ...restPath] = path;
  const nextOperands = [...operands];
  nextOperands[nextIndex] = setNodeAtPath(
    nextOperands[nextIndex],
    restPath,
    updater,
  );
  return [operator, ...nextOperands];
}

function removeOperandAtPath(
  expression: BooleanExpression,
  operandPath: number[],
): BooleanExpression {
  if (operandPath.length === 0) {
    return expression;
  }

  const parentPath = operandPath.slice(0, -1);
  const removeIndex = operandPath[operandPath.length - 1];

  return setNodeAtPath(expression, parentPath, (node) => {
    if (typeof node === "string") {
      return node;
    }

    const [operator, ...operands] = node;
    if (operator !== BooleanOp.And && operator !== BooleanOp.Or) {
      return node;
    }

    const nextOperands = operands.filter((_, index) => index !== removeIndex);
    return [operator, ...nextOperands];
  });
}

function appendOperandAtGroupPath(
  expression: BooleanExpression,
  groupPath: number[],
  operand: BooleanExpression,
): BooleanExpression {
  return setNodeAtPath(expression, groupPath, (node) => {
    if (typeof node === "string") {
      return node;
    }

    const [operator, ...operands] = node;
    if (operator !== BooleanOp.And && operator !== BooleanOp.Or) {
      return node;
    }

    return [operator, ...operands, operand];
  });
}

function ExpressionTreeEditor({
  expression,
  dependencyIds,
  onChange,
}: {
  expression: BooleanExpression;
  dependencyIds: TaskId[];
  onChange: (expression: BooleanExpression) => void;
}) {
  const firstDependencyId = dependencyIds[0] ?? "";

  const renderGroup = (
    groupExpression: Extract<
      BooleanExpression,
      [BooleanOp.And | BooleanOp.Or, ...BooleanExpression[]]
    >,
    groupPath: number[],
  ) => {
    const [operator, ...operands] = groupExpression;

    return (
      <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Group
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(
                setNodeAtPath(expression, groupPath, (node) => {
                  if (typeof node === "string") {
                    return node;
                  }

                  const [, ...nodeOperands] = node;
                  return [BooleanOp.And, ...nodeOperands];
                }),
              );
            }}
            className={`rounded border px-2 py-1 text-xs ${
              operator === BooleanOp.And
                ? "border-zinc-500 bg-zinc-100 dark:border-zinc-400 dark:bg-zinc-800"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            AND
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(
                setNodeAtPath(expression, groupPath, (node) => {
                  if (typeof node === "string") {
                    return node;
                  }

                  const [, ...nodeOperands] = node;
                  return [BooleanOp.Or, ...nodeOperands];
                }),
              );
            }}
            className={`rounded border px-2 py-1 text-xs ${
              operator === BooleanOp.Or
                ? "border-zinc-500 bg-zinc-100 dark:border-zinc-400 dark:bg-zinc-800"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            OR
          </button>
        </div>

        <div className="space-y-2">
          {operands.map((operand, operandIndex) => {
            const operandPath = [...groupPath, operandIndex];
            const { expression: baseExpression, negated } = unwrapNot(operand);

            return (
              <div
                key={operandPath.join("-")}
                className="space-y-2 rounded border border-zinc-200 p-2 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={negated}
                      onChange={(event) => {
                        onChange(
                          setNodeAtPath(expression, operandPath, (node) => {
                            const { expression: rawExpression } =
                              unwrapNot(node);
                            return wrapNotIfNeeded(
                              rawExpression,
                              event.target.checked,
                            );
                          }),
                        );
                      }}
                    />
                    NOT
                  </label>

                  {typeof baseExpression === "string" ? (
                    <select
                      value={baseExpression}
                      onChange={(event) => {
                        onChange(
                          setNodeAtPath(expression, operandPath, (node) => {
                            const { negated: currentNegated } = unwrapNot(node);
                            return wrapNotIfNeeded(
                              event.target.value,
                              currentNegated,
                            );
                          }),
                        );
                      }}
                      className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
                    >
                      {dependencyIds.map((dependencyId) => (
                        <option key={dependencyId} value={dependencyId}>
                          {dependencyId}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Nested group
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onChange(removeOperandAtPath(expression, operandPath));
                    }}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Remove
                  </button>
                </div>

                {typeof baseExpression !== "string" &&
                  (baseExpression[0] === BooleanOp.And ||
                    baseExpression[0] === BooleanOp.Or) &&
                  renderGroup(baseExpression, operandPath)}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!firstDependencyId) {
                return;
              }

              onChange(
                appendOperandAtGroupPath(
                  expression,
                  groupPath,
                  firstDependencyId,
                ),
              );
            }}
            disabled={!firstDependencyId}
            className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Add dependency
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(
                appendOperandAtGroupPath(expression, groupPath, [
                  BooleanOp.And,
                ]),
              );
            }}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Add group
          </button>
        </div>
      </div>
    );
  };

  if (typeof expression === "string") {
    return null;
  }

  const [operator] = expression;
  if (operator !== BooleanOp.And && operator !== BooleanOp.Or) {
    return null;
  }

  return renderGroup(expression, []);
}

export function ExpressionEditor({
  taskId,
  dependencyIds,
}: {
  taskId: TaskId | null;
  dependencyIds: Set<TaskId>;
}) {
  const selectedTaskDependencyExpression = useTaskDependencyExpressionQuery(
    taskId ?? "",
  ).data;

  const editablePersistedExpression = useMemo(() => {
    const normalized = normalizeToDependencies(
      selectedTaskDependencyExpression ??
        buildImplicitAndExpression(dependencyIds),
      dependencyIds,
    );

    return ensureEditableRoot(normalized, dependencyIds);
  }, [selectedTaskDependencyExpression, dependencyIds]);

  const draftKey = `${taskId ?? ""}:${JSON.stringify(editablePersistedExpression)}`;

  return (
    <ExpressionEditorDraft
      key={draftKey}
      taskId={taskId}
      dependencyIds={dependencyIds}
      editablePersistedExpression={editablePersistedExpression}
    />
  );
}

function ExpressionEditorDraft({
  taskId,
  dependencyIds,
  editablePersistedExpression,
}: {
  taskId: TaskId | null;
  dependencyIds: Set<TaskId>;
  editablePersistedExpression: Extract<
    BooleanExpression,
    [BooleanOp.And | BooleanOp.Or, ...BooleanExpression[]]
  >;
}) {
  const taskDependencyExpressionMutation =
    useTaskDependencyExpressionMutation();

  const [dependencyExpressionDraft, setDependencyExpressionDraft] =
    useState<BooleanExpression>(editablePersistedExpression);

  const dependencyExpressionDirty =
    JSON.stringify(dependencyExpressionDraft) !==
    JSON.stringify(editablePersistedExpression);

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Dependency Expression</p>
      <div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Build a boolean expression using the current dependency set. No custom
          text syntax is used.
        </p>

        {dependencyIds.size === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Add dependencies first. With no dependencies, this task uses the
            default implicit AND behavior.
          </p>
        ) : (
          <ExpressionTreeEditor
            expression={dependencyExpressionDraft}
            dependencyIds={Array.from(dependencyIds)}
            onChange={setDependencyExpressionDraft}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              taskDependencyExpressionMutation.mutate({
                taskId: taskId ?? "",
                dependencyExpression: dependencyExpressionDraft,
              });
            }}
            disabled={!dependencyExpressionDirty || !taskId}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Save Expression
          </button>
          <button
            type="button"
            onClick={() => {
              setDependencyExpressionDraft(
                deepCloneExpression(editablePersistedExpression),
              );
            }}
            disabled={!dependencyExpressionDirty}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Reset Draft
          </button>
          <button
            type="button"
            onClick={() => {
              const implicit = buildImplicitAndExpression(dependencyIds);
              setDependencyExpressionDraft(implicit);
              taskDependencyExpressionMutation.mutate({
                taskId: taskId ?? "",
                dependencyExpression: null,
              });
            }}
            disabled={!taskId}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Use Implicit AND
          </button>
        </div>
      </div>
    </div>
  );
}
