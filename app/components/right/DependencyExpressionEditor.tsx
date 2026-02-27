"use client";

import { useContext, useMemo, useState, type ReactNode } from "react";
import {
  BooleanOp,
  type BooleanExpression,
  type ChecklistMode,
  type DependencyExpression,
  type TaskId,
} from "@/app/lib/data/types";
import {
  MultiSelectContext,
  type MultiSelectContextId,
} from "@/app/lib/context";
import {
  buildImplicitAndExpression,
  getInfixExpressionPrecedence,
} from "@/app/lib/booleanExpression";
import { ExpressionEditor } from "@/app/components/ExpressionEditor";
import { Button } from "@/app/components/catalyst/button";
import { Badge } from "@/app/components/catalyst/badge";

function ExpressionOperator({ operator }: { operator: BooleanOp }) {
  const label =
    operator === BooleanOp.And
      ? "AND"
      : operator === BooleanOp.Or
        ? "OR"
        : "NOT";
  const color =
    operator === BooleanOp.And
      ? "emerald"
      : operator === BooleanOp.Or
        ? "sky"
        : "amber";

  return (
    <Badge color={color} className="font-mono tracking-wide">
      {label}
    </Badge>
  );
}

export function DependencyExpressionView({
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

    const currentPrecedence = getInfixExpressionPrecedence(current);
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

export function DependencyExpressionEditor({
  label,
  mode,
  selectedTaskId,
  selectedTaskTitle,
  selectionContext,
  selectedTaskSet,
  dependencyIds,
  dependencyExpression,
  editorDependencyExpression,
  dependencyTitleById,
  completionsWithReminders,
  onConfirmSelection,
  onClearSelection,
  onApplySelection,
  onSetDependencyExpression,
}: {
  label: "Openers" | "Closers";
  mode: ChecklistMode;
  selectedTaskId: TaskId | null;
  selectedTaskTitle: string | undefined;
  selectionContext: MultiSelectContextId;
  selectedTaskSet: Set<TaskId>;
  dependencyIds: Set<TaskId>;
  dependencyExpression: BooleanExpression | null;
  editorDependencyExpression: DependencyExpression | null;
  dependencyTitleById: Map<TaskId, string>;
  completionsWithReminders: Set<TaskId>;
  onConfirmSelection: (taskIds: Set<TaskId>) => void;
  onClearSelection: () => void;
  onApplySelection: () => void;
  onSetDependencyExpression: (
    dependencyExpression: DependencyExpression,
  ) => void;
}) {
  const multiSelectContext = useContext(MultiSelectContext);
  const isMultiSelectActive = multiSelectContext.isActive();
  const isGenericMultiSelectActive = multiSelectContext.isActive("generic");
  const isSettingSelection = multiSelectContext.isActive(selectionContext);
  const [isExpressionEditorOpen, setIsExpressionEditorOpen] = useState(false);
  const hasDependencies = dependencyIds.size > 0;
  const dependencyIdList = useMemo(
    () => Array.from(dependencyIds),
    [dependencyIds],
  );
  const implicitExpression = useMemo(
    () => buildImplicitAndExpression(dependencyIdList),
    [dependencyIdList],
  );
  const effectiveDependencyExpression =
    dependencyExpression ?? implicitExpression;

  const openTaskSelectionEditor = () => {
    const headerText = `Editing ${label.toLowerCase()} for ${selectedTaskTitle ?? "unknown task"}`;

    multiSelectContext.setState({
      selectionContext,
      disablePrimarySelection: true,
      selectedTaskSet: new Set(selectedTaskSet),
      renderCustomHeader: (multiSelectState) => (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-medium text-zinc-700 dark:text-zinc-200">
            {headerText}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              onClick={() => {
                multiSelectContext.selectAll();
              }}
              outline
              className="text-xs"
            >
              Select All
            </Button>
            <Button
              type="button"
              onClick={() => {
                multiSelectContext.clearSelection();
              }}
              outline
              className="text-xs"
            >
              Clear Selection
            </Button>
            <Button
              type="button"
              onClick={() => {
                onConfirmSelection(multiSelectState.selectedTaskSet);
                multiSelectContext.close();
              }}
              outline
              className="text-xs"
            >
              Confirm
            </Button>
            <Button
              type="button"
              onClick={() => {
                multiSelectContext.close();
              }}
              outline
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      ),
      taskFilter: (taskId) => {
        if (!selectedTaskId) {
          return true;
        }

        return taskId !== selectedTaskId;
      },
    });
  };

  return (
    <>
      <div>
        <p className="mb-2 text-sm font-medium">{label}</p>
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
          <Button
            type="button"
            onClick={openTaskSelectionEditor}
            disabled={isMultiSelectActive}
            outline
            className="text-sm"
          >
            Set {label}
          </Button>
          <Button
            type="button"
            onClick={onClearSelection}
            disabled={!hasDependencies}
            outline
            className="text-sm"
          >
            Clear {label}
          </Button>
          <Button
            type="button"
            onClick={() => setIsExpressionEditorOpen(true)}
            disabled={!hasDependencies || isExpressionEditorOpen}
            outline
            className="text-sm"
          >
            Edit Expression
          </Button>
          {isGenericMultiSelectActive && (
            <Button
              type="button"
              onClick={onApplySelection}
              outline
              className="text-sm"
            >
              Apply {label}
            </Button>
          )}
          {isSettingSelection && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Select tasks from the left pane, then confirm or cancel in the
              left header.
            </p>
          )}
        </div>
      </div>

      {hasDependencies &&
        isExpressionEditorOpen &&
        editorDependencyExpression && (
          <ExpressionEditor
            dependencyExpression={editorDependencyExpression}
            dependencyTitleById={dependencyTitleById}
            onSetDependencyExpression={onSetDependencyExpression}
          />
        )}
    </>
  );
}
