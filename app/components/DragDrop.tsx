// Drag drop implementation powered by pragmatic-drag-and-drop

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box";
import type { PolymorphicProps } from "../lib/utils";

export type DragDropStateType = {
  /** For a drag source, if the source is being dragged. */
  isDragging?: boolean;
  /** For a drag target, if the target is being dragged over by a drag source matching its filters. */
  isDraggedOver?: boolean;
};

export type DragDropSourceProps<
  DragDataT,
  ElementT extends React.ElementType = "div",
> = PolymorphicProps<
  ElementT,
  {
    dragData: DragDataT;
    dragHandleRef?: RefObject<HTMLElement | null>;
    dragDisabled?: boolean;
    dragType?: string;
    setDragDropState?: Dispatch<SetStateAction<DragDropStateType>>;
  }
>;

export function DragDropSource<
  DragDataT,
  ElementT extends React.ElementType = "div",
>({
  children,
  dragData,
  dragHandleRef,
  dragDisabled,
  dragType,
  setDragDropState,
  as,
  ...restProps
}: DragDropSourceProps<DragDataT, ElementT>) {
  const divRef = useRef(null);
  const Tag = as || "div";

  useEffect(() => {
    const dragHandle = dragHandleRef?.current ?? divRef.current;
    if (!dragHandle) return;

    return draggable({
      element: divRef.current!,
      dragHandle,
      canDrag: () => !Boolean(dragDisabled),
      getInitialData: () => ({ data: dragData, type: dragType }),
      onDragStart: () => setDragDropState?.({ isDragging: true }),
      onDrop: () => setDragDropState?.({ isDragging: false }),
    });
  }, [dragData, dragHandleRef, dragDisabled, setDragDropState, dragType]);

  return (
    <Tag {...restProps} ref={divRef}>
      {children}
    </Tag>
  );
}

export type DragDropTargetProps<
  DragDataT,
  ElementT extends React.ElementType = "div",
> = PolymorphicProps<
  ElementT,
  {
    dragType?: string;
    setDragDropState?: Dispatch<SetStateAction<DragDropStateType>>;
    onDropDragData?: (dragData: DragDataT) => void;
  }
>;

export function DragDropTarget<
  DragDataT,
  ElementT extends React.ElementType = "div",
>({
  children,
  index,
  dragType,
  setDragDropState,
  onDropDragData,
  as,
  ...restProps
}: DragDropTargetProps<DragDataT, ElementT>) {
  const divRef = useRef(null);
  const Tag = as || "div";

  useEffect(() => {
    const dropTarget = divRef.current;
    if (!dropTarget) return;

    return dropTargetForElements({
      element: dropTarget,
      onDragEnter: ({ source }) => {
        const sourceData = source.data as { data: DragDataT; type: string };
        if (dragType && sourceData.type !== dragType) {
          setDragDropState?.({ isDraggedOver: false });
          return;
        }
        setDragDropState?.({ isDraggedOver: true });
      },
      onDragLeave: () => setDragDropState?.({ isDraggedOver: false }),
      onDrop({ source }) {
        setDragDropState?.({ isDraggedOver: false });
        const sourceData = source.data as { data: DragDataT; type: string };
        if (dragType && sourceData.type !== dragType) {
          return;
        }
        const dragData = sourceData.data;

        onDropDragData?.(dragData);
      },
    });
  }, [index, onDropDragData, setDragDropState, dragType]);

  return (
    <Tag {...restProps} ref={divRef}>
      {children}
    </Tag>
  );
}

////////////////////// REORDERABLE

type DragDropReorderHandlerType = (
  fromGroup: string | undefined,
  from: number,
  toGroup: string | undefined,
  to: number,
) => void;

type DragDropReorderableGroupContextType = {
  group?: string;
  onMoveItem?: DragDropReorderHandlerType;
};

export const DragDropReorderableGroupContext =
  createContext<DragDropReorderableGroupContextType>({});

export type DragDropReorderableProps<ElementT extends React.ElementType> =
  PolymorphicProps<
    ElementT,
    {
      index: number;
      dragHandleRef?: RefObject<HTMLElement | null>;
      dragDisabled?: boolean;
      dragType?: string;
      setDragDropState?: Dispatch<SetStateAction<DragDropStateType>>;
    }
  >;

export type DragDropReorderableItemData = {
  index: number;
  group: string;
  type?: string;
};

/** A single reorderable element. */
export function DragDropReorderable<
  ElementT extends React.ElementType = "div",
>({
  children,
  index,
  dragHandleRef,
  dragDisabled,
  dragType,
  setDragDropState,
  as,
  ...restProps
}: DragDropReorderableProps<ElementT>) {
  const divRef = useRef(null);
  const { group, onMoveItem } = useContext(DragDropReorderableGroupContext);
  const Tag = as || "div";
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const dragHandle = dragHandleRef?.current ?? divRef.current;
    if (!dragHandle) return;
    const dropTarget = divRef.current;
    if (!dropTarget) return;

    return combine(
      // 1. Make the element draggable
      draggable({
        element: dropTarget,
        dragHandle: dragHandle,
        canDrag: () => !Boolean(dragDisabled),
        getInitialData: () => ({ index, group, type: dragType }),
        onDragStart: () => setDragDropState?.({ isDragging: true }),
        onDrop: () => setDragDropState?.({ isDragging: false }),
      }),
      // 2. Make the element a drop target for other items
      dropTargetForElements({
        element: dropTarget,
        getData: ({ input }) =>
          attachClosestEdge(
            { index, group, type: dragType },
            { element: dropTarget, input, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self, source }) => {
          const sourceData = source.data as DragDropReorderableItemData;
          if (sourceData.type !== dragType) {
            setClosestEdge(null);
            return;
          }

          setClosestEdge(extractClosestEdge(self.data));
        },
        onDragLeave: () => setClosestEdge(null),
        onDrop({ source, self }) {
          setClosestEdge(null);
          if (!group) return;
          const sourceData = source.data as DragDropReorderableItemData;
          if (sourceData.type !== dragType) {
            return;
          }
          const targetData = self.data as DragDropReorderableItemData;

          // Adjust index based on whether the top or bottom edge is being dragged into
          const edge = extractClosestEdge(self.data);
          if (!edge) return;
          const moveToIndex =
            edge === "top" ? targetData.index : targetData.index + 1;

          if (sourceData.index !== moveToIndex || sourceData.group !== group) {
            onMoveItem?.(
              sourceData.group,
              sourceData.index,
              group,
              moveToIndex,
            );
          }
        },
      }),
    );
  }, [
    index,
    group,
    onMoveItem,
    dragHandleRef,
    dragDisabled,
    setDragDropState,
    dragType,
  ]);

  const nextStyle: CSSProperties = restProps.style
    ? Object.assign({}, restProps.style)
    : {};
  nextStyle.position = "relative";

  return (
    <Tag {...restProps} ref={divRef} style={nextStyle}>
      {children}
      {closestEdge && <DropIndicator edge={closestEdge} />}
    </Tag>
  );
}

export type DragDropReorderableGroupProps<ElementT extends React.ElementType> =
  PolymorphicProps<
    ElementT,
    {
      group: string;
      onMoveItem?: (
        fromGroup: string | undefined,
        from: number,
        toGroup: string | undefined,
        to: number,
      ) => void;
    }
  >;

/** Group reorderable elements into categories while unifying their drop handling code. */
export function DragDropReorderableGroup<
  ElementT extends React.ElementType = "div",
>({
  children,
  group,
  onMoveItem,
  as,
  ...restProps
}: DragDropReorderableGroupProps<ElementT>) {
  const contextValue: DragDropReorderableGroupContextType = {
    group,
    onMoveItem,
  };
  const Tag = as || "div";

  return (
    <DragDropReorderableGroupContext value={contextValue}>
      <Tag {...restProps}>{children}</Tag>
    </DragDropReorderableGroupContext>
  );
}
