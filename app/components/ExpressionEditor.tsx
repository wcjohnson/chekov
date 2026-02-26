"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BooleanOp, type BooleanExpression, type TaskId } from "../lib/types";
import {
  useDetailsQuery,
  useTaskDependencyExpressionMutation,
  useTaskDependencyExpressionQuery,
} from "../lib/data";
import {
  DragDropSource,
  DragDropTarget,
  type DragDropStateType,
} from "./DragDrop";

type NodeDraft =
  | { kind: "empty" }
  | { kind: "primitive"; taskId: TaskId }
  | {
      kind: "operator";
      op: BooleanOp.And | BooleanOp.Or | BooleanOp.Not;
      children: NodeDraft[];
    };

type PaletteNodeDragData =
  | { kind: "primitive"; taskId: TaskId }
  | { kind: "operator"; op: BooleanOp.And | BooleanOp.Or | BooleanOp.Not };

const EXPRESSION_NODE_DRAG_TYPE = "expression-node";

function buildImplicitNodeDraft(dependencyIds: TaskId[]): NodeDraft {
  if (dependencyIds.length === 0) {
    return { kind: "empty" };
  }

  return {
    kind: "operator",
    op: BooleanOp.And,
    children: dependencyIds.map((taskId) => ({ kind: "primitive", taskId })),
  };
}

function paletteNodeToDraft(dragData: PaletteNodeDragData): NodeDraft {
  if (dragData.kind === "primitive") {
    return { kind: "primitive", taskId: dragData.taskId };
  }

  return { kind: "operator", op: dragData.op, children: [] };
}

function cloneNodeDraft(node: NodeDraft): NodeDraft {
  if (node.kind === "empty") {
    return { kind: "empty" };
  }

  if (node.kind === "primitive") {
    return { kind: "primitive", taskId: node.taskId };
  }

  return {
    kind: "operator",
    op: node.op,
    children: node.children.map((child) => cloneNodeDraft(child)),
  };
}

function normalizeExpressionToDependencies(
  expression: BooleanExpression,
  dependencyIdSet: Set<TaskId>,
): BooleanExpression | null {
  if (typeof expression === "string") {
    return dependencyIdSet.has(expression) ? expression : null;
  }

  const [operator, ...operands] = expression;
  if (operator === BooleanOp.Not) {
    const normalized = normalizeExpressionToDependencies(
      operands[0],
      dependencyIdSet,
    );
    if (!normalized) {
      return null;
    }

    return [BooleanOp.Not, normalized];
  }

  if (operator === BooleanOp.And || operator === BooleanOp.Or) {
    const normalizedOperands = operands
      .map((operand) =>
        normalizeExpressionToDependencies(operand, dependencyIdSet),
      )
      .filter((operand): operand is BooleanExpression => operand !== null);

    return [operator, ...normalizedOperands];
  }

  return null;
}

function expressionToNodeDraft(
  expression: BooleanExpression,
  dependencyIdSet: Set<TaskId>,
): NodeDraft {
  if (typeof expression === "string") {
    if (!dependencyIdSet.has(expression)) {
      return { kind: "empty" };
    }

    return { kind: "primitive", taskId: expression };
  }

  const [operator, ...operands] = expression;
  if (operator === BooleanOp.Not) {
    return {
      kind: "operator",
      op: BooleanOp.Not,
      children: [expressionToNodeDraft(operands[0], dependencyIdSet)],
    };
  }

  if (operator === BooleanOp.And || operator === BooleanOp.Or) {
    return {
      kind: "operator",
      op: operator,
      children: operands.map((operand) =>
        expressionToNodeDraft(operand, dependencyIdSet),
      ),
    };
  }

  return { kind: "empty" };
}

function nodeDraftToExpression(node: NodeDraft): BooleanExpression | null {
  if (node.kind === "empty") {
    return null;
  }

  if (node.kind === "primitive") {
    return node.taskId;
  }

  if (node.op === BooleanOp.Not) {
    const childExpression = node.children[0]
      ? nodeDraftToExpression(node.children[0])
      : null;
    if (!childExpression) {
      return null;
    }

    return [BooleanOp.Not, childExpression];
  }

  return [
    node.op,
    ...node.children
      .map((child) => nodeDraftToExpression(child))
      .filter((child): child is BooleanExpression => child !== null),
  ];
}

function insertNodeAtSlot(
  node: NodeDraft,
  slotPath: number[],
  incomingNode: NodeDraft,
): NodeDraft {
  if (slotPath.length === 0) {
    return cloneNodeDraft(incomingNode);
  }

  if (node.kind !== "operator") {
    return node;
  }

  const [nextIndex, ...restPath] = slotPath;
  const nextChildren = [...node.children];

  if (restPath.length === 0) {
    if (nextIndex === nextChildren.length) {
      if (node.op === BooleanOp.Not && nextChildren.length >= 1) {
        return node;
      }

      nextChildren.push(cloneNodeDraft(incomingNode));
      return { ...node, children: nextChildren };
    }

    const existingChild = nextChildren[nextIndex];
    if (!existingChild || existingChild.kind !== "empty") {
      return node;
    }

    nextChildren[nextIndex] = cloneNodeDraft(incomingNode);
    return { ...node, children: nextChildren };
  }

  const existingChild = nextChildren[nextIndex];
  if (!existingChild) {
    return node;
  }

  nextChildren[nextIndex] = insertNodeAtSlot(
    existingChild,
    restPath,
    incomingNode,
  );
  return { ...node, children: nextChildren };
}

function renderTokenLabel(
  node: NodeDraft,
  dependencyTitleById: Map<TaskId, string>,
) {
  if (node.kind === "empty") {
    return "+";
  }

  if (node.kind === "primitive") {
    return dependencyTitleById.get(node.taskId) ?? node.taskId;
  }

  return node.op === BooleanOp.And
    ? "AND"
    : node.op === BooleanOp.Or
      ? "OR"
      : "NOT";
}

function SlotTarget({
  onDrop,
}: {
  onDrop: (dragData: PaletteNodeDragData) => void;
}) {
  const [state, setState] = useState<DragDropStateType>({});

  return (
    <DragDropTarget<PaletteNodeDragData, "button">
      dragType={EXPRESSION_NODE_DRAG_TYPE}
      onDropDragData={onDrop}
      setDragDropState={setState}
      as="button"
      type="button"
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        state.isDraggedOver
          ? "border-zinc-500 bg-zinc-100 dark:border-zinc-400 dark:bg-zinc-800"
          : "border-zinc-300 bg-transparent dark:border-zinc-700"
      }`}
    >
      +
    </DragDropTarget>
  );
}

function PaletteSource({
  dragData,
  children,
}: {
  dragData: PaletteNodeDragData;
  children: ReactNode;
}) {
  const [state, setState] = useState<DragDropStateType>({});

  return (
    <DragDropSource<PaletteNodeDragData, "button">
      dragData={dragData}
      dragType={EXPRESSION_NODE_DRAG_TYPE}
      setDragDropState={setState}
      as="button"
      type="button"
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        state.isDragging
          ? "border-zinc-500 bg-zinc-100 dark:border-zinc-400 dark:bg-zinc-800"
          : "border-zinc-300 bg-transparent dark:border-zinc-700"
      }`}
    >
      {children}
    </DragDropSource>
  );
}

function collectPrefixTokens(
  node: NodeDraft,
  path: number[],
  dependencyTitleById: Map<TaskId, string>,
  onDropAtSlot: (slotPath: number[], dragData: PaletteNodeDragData) => void,
): ReactNode[] {
  if (node.kind === "empty") {
    return [
      <SlotTarget
        key={`slot-${path.join("-") || "root"}`}
        onDrop={(dragData) => onDropAtSlot(path, dragData)}
      />,
    ];
  }

  if (node.kind === "primitive") {
    return [
      <span
        key={`primitive-${path.join("-") || "root"}`}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium dark:border-zinc-700"
      >
        {renderTokenLabel(node, dependencyTitleById)}
      </span>,
    ];
  }

  const tokens: ReactNode[] = [
    <span
      key={`operator-${path.join("-") || "root"}`}
      className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium dark:border-zinc-700"
    >
      {renderTokenLabel(node, dependencyTitleById)}
    </span>,
  ];

  node.children.forEach((child, childIndex) => {
    tokens.push(
      ...collectPrefixTokens(
        child,
        [...path, childIndex],
        dependencyTitleById,
        onDropAtSlot,
      ),
    );
  });

  const isGrowable =
    node.op === BooleanOp.And ||
    node.op === BooleanOp.Or ||
    (node.op === BooleanOp.Not && node.children.length === 0);

  if (isGrowable) {
    tokens.push(
      <SlotTarget
        key={`append-${path.join("-") || "root"}`}
        onDrop={(dragData) =>
          onDropAtSlot([...path, node.children.length], dragData)
        }
      />,
    );
  }

  return tokens;
}

function ExpressionEditorDraft({
  taskId,
  dependencyIds,
  persistedDraft,
  dependencyTitleById,
}: {
  taskId: TaskId | null;
  dependencyIds: TaskId[];
  persistedDraft: NodeDraft;
  dependencyTitleById: Map<TaskId, string>;
}) {
  const taskDependencyExpressionMutation =
    useTaskDependencyExpressionMutation();
  const [draft, setDraft] = useState<NodeDraft>(cloneNodeDraft(persistedDraft));

  const persistedExpression = nodeDraftToExpression(persistedDraft);
  const draftExpression = nodeDraftToExpression(draft);
  const dirty =
    JSON.stringify(draftExpression) !== JSON.stringify(persistedExpression);

  const prefixTokens = collectPrefixTokens(
    draft,
    [],
    dependencyTitleById,
    (slotPath, dragData) => {
      setDraft((previous) =>
        insertNodeAtSlot(previous, slotPath, paletteNodeToDraft(dragData)),
      );
    },
  );

  const implicitDraft = buildImplicitNodeDraft(dependencyIds);

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Dependency Expression</p>
      <div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Palette
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <PaletteSource dragData={{ kind: "operator", op: BooleanOp.And }}>
              AND
            </PaletteSource>
            <PaletteSource dragData={{ kind: "operator", op: BooleanOp.Or }}>
              OR
            </PaletteSource>
            <PaletteSource dragData={{ kind: "operator", op: BooleanOp.Not }}>
              NOT
            </PaletteSource>
            {dependencyIds.map((dependencyId) => (
              <PaletteSource
                key={`palette-dep-${dependencyId}`}
                dragData={{ kind: "primitive", taskId: dependencyId }}
              >
                {dependencyTitleById.get(dependencyId) ?? dependencyId}
              </PaletteSource>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Expression (Prefix)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {prefixTokens}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              taskDependencyExpressionMutation.mutate({
                taskId: taskId ?? "",
                dependencyExpression: draftExpression,
              });
            }}
            disabled={!dirty || !taskId}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Save Expression
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(cloneNodeDraft(persistedDraft));
            }}
            disabled={!dirty}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Reset Draft
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(implicitDraft);
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

export function ExpressionEditor({
  taskId,
  dependencyIds,
}: {
  taskId: TaskId | null;
  dependencyIds: Set<TaskId>;
}) {
  const dependencyIdList = useMemo(
    () => Array.from(dependencyIds),
    [dependencyIds],
  );
  const dependencyIdSet = useMemo(
    () => new Set(dependencyIdList),
    [dependencyIdList],
  );

  const details = useDetailsQuery().data;
  const dependencyTitleById = useMemo(() => {
    const map = new Map<TaskId, string>();
    for (const dependencyId of dependencyIdList) {
      const dependencyDetail = details?.get(dependencyId);
      map.set(dependencyId, dependencyDetail?.title ?? dependencyId);
    }
    return map;
  }, [dependencyIdList, details]);

  const selectedTaskDependencyExpression = useTaskDependencyExpressionQuery(
    taskId ?? "",
  ).data;

  const persistedDraft = useMemo(() => {
    const normalizedExpression = selectedTaskDependencyExpression
      ? normalizeExpressionToDependencies(
          selectedTaskDependencyExpression,
          dependencyIdSet,
        )
      : null;

    if (!normalizedExpression) {
      return { kind: "empty" } as NodeDraft;
    }

    return expressionToNodeDraft(normalizedExpression, dependencyIdSet);
  }, [selectedTaskDependencyExpression, dependencyIdSet]);

  const draftKey = `${taskId ?? ""}:${JSON.stringify(persistedDraft)}`;

  return (
    <ExpressionEditorDraft
      key={draftKey}
      taskId={taskId}
      dependencyIds={dependencyIdList}
      persistedDraft={persistedDraft}
      dependencyTitleById={dependencyTitleById}
    />
  );
}
