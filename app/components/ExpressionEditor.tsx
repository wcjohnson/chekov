"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  BooleanOp,
  type BooleanExpression,
  type TaskId,
} from "../lib/data/types";
import { normalizeExpressionToDependencies } from "../lib/booleanExpression";
import {
  DragDropSource,
  DragDropTarget,
  type DragDropStateType,
} from "./DragDrop";
import { useTaskDependencyExpressionMutation } from "../lib/data/mutations";
import {
  useDetailsQuery,
  useTaskDependencyExpressionQuery,
} from "../lib/data/queries";

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

function getPaletteSourceClasses(
  dragData: PaletteNodeDragData,
  isDragging: boolean,
) {
  if (dragData.kind === "operator") {
    return isDragging
      ? "border-indigo-500 bg-indigo-100 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-900/40 dark:text-indigo-100"
      : "border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/50";
  }

  return isDragging
    ? "border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-100"
    : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50";
}

function getDropSlotClasses(isDraggedOver: boolean) {
  return isDraggedOver
    ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-400 dark:bg-amber-900/40 dark:text-amber-100"
    : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50";
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

function removeNodeAtPath(node: NodeDraft, path: number[]): NodeDraft {
  if (path.length === 0) {
    return { kind: "empty" };
  }

  if (node.kind !== "operator") {
    return node;
  }

  const [nextIndex, ...restPath] = path;
  if (nextIndex < 0 || nextIndex >= node.children.length) {
    return node;
  }

  const nextChildren = [...node.children];

  if (restPath.length === 0) {
    nextChildren.splice(nextIndex, 1);
    return { ...node, children: nextChildren };
  }

  nextChildren[nextIndex] = removeNodeAtPath(nextChildren[nextIndex], restPath);
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
      className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors ${getDropSlotClasses(
        !!state.isDraggedOver,
      )}`}
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
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${getPaletteSourceClasses(
        dragData,
        !!state.isDragging,
      )}`}
    >
      {children}
    </DragDropSource>
  );
}

function renderNodeBadge(
  label: string,
  key: string,
  className?: string,
  onRemove?: () => void,
) {
  return (
    <span
      key={key}
      className={`inline-flex h-7 items-center gap-1 rounded-full border border-zinc-300 px-2 text-xs font-medium dark:border-zinc-700 ${className ?? ""}`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

function collectNestedNodes(
  node: NodeDraft,
  path: number[],
  dependencyTitleById: Map<TaskId, string>,
  onDropAtSlot: (slotPath: number[], dragData: PaletteNodeDragData) => void,
  onRemoveNode: (path: number[]) => void,
): ReactNode {
  if (node.kind === "empty") {
    return (
      <SlotTarget
        key={`slot-${path.join("-") || "root"}`}
        onDrop={(dragData) => onDropAtSlot(path, dragData)}
      />
    );
  }

  if (node.kind === "primitive") {
    return renderNodeBadge(
      renderTokenLabel(node, dependencyTitleById),
      `primitive-${path.join("-") || "root"}`,
      undefined,
      () => onRemoveNode(path),
    );
  }

  const isGrowable =
    node.op === BooleanOp.And ||
    node.op === BooleanOp.Or ||
    (node.op === BooleanOp.Not && node.children.length === 0);

  return (
    <div
      key={`operator-node-${path.join("-") || "root"}`}
      className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 dark:border-zinc-700"
    >
      {renderNodeBadge(
        renderTokenLabel(node, dependencyTitleById),
        `operator-${path.join("-") || "root"}`,
        undefined,
        () => onRemoveNode(path),
      )}

      {node.children.map((child, childIndex) =>
        collectNestedNodes(
          child,
          [...path, childIndex],
          dependencyTitleById,
          onDropAtSlot,
          onRemoveNode,
        ),
      )}

      {isGrowable && (
        <SlotTarget
          key={`append-${path.join("-") || "root"}`}
          onDrop={(dragData) =>
            onDropAtSlot([...path, node.children.length], dragData)
          }
        />
      )}
    </div>
  );
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

  const nestedExpressionNode = collectNestedNodes(
    draft,
    [],
    dependencyTitleById,
    (slotPath, dragData) => {
      setDraft((previous) =>
        insertNodeAtSlot(previous, slotPath, paletteNodeToDraft(dragData)),
      );
    },
    (nodePath) => {
      setDraft((previous) => removeNodeAtPath(previous, nodePath));
    },
  );

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Dependency Expression</p>
      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        Drag items from the palette into the expression row to build an
        expression.
      </p>
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
            Expression
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {nestedExpressionNode}
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
            disabled={!dirty || !taskId || !draftExpression}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Save Expression
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft({ kind: "empty" });
              taskDependencyExpressionMutation.mutate({
                taskId: taskId ?? "",
                dependencyExpression: null,
              });
            }}
            disabled={!taskId || !draftExpression}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Clear Expression
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

  if (dependencyIdList.length === 0) {
    return null;
  }

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
