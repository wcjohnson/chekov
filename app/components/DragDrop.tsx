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

type PolymorphicProps<
  ElementT extends React.ElementType,
  CustomProps,
> = React.PropsWithChildren<
  // Includes the 'children' prop
  React.ComponentPropsWithoutRef<ElementT> & {
    // Extracts all native props of the tag T
    /** The HTML element or React component you want to render */
    as?: ElementT;
  } & CustomProps
>;

type DragDropMoveItemHandlerType = (
  fromGroup: string | undefined,
  from: number,
  toGroup: string | undefined,
  to: number,
) => void;

type DragDropGroupContextType = {
  group?: string;
  onMoveItem?: DragDropMoveItemHandlerType;
};

export type DragDropItemStateType = {
  isDragging: boolean;
};

export const DragDropGroupContext = createContext<DragDropGroupContextType>({});

export type DragDropReorderableProps<ElementT extends React.ElementType> =
  PolymorphicProps<
    ElementT,
    {
      index: number;
      dragHandleRef?: RefObject<HTMLElement | null>;
      dragDisabled?: boolean;
      dragType?: string;
      setDragDropState?: Dispatch<SetStateAction<DragDropItemStateType>>;
    }
  >;

export type DragDropItemData = {
  index: number;
  group: string;
  type?: string;
};

export function DragDropSource<ElementT extends React.ElementType = "div">({
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
  const { group } = useContext(DragDropGroupContext);
  const Tag = as || "div";

  useEffect(() => {
    const dragHandle = dragHandleRef?.current ?? divRef.current;
    if (!dragHandle) return;

    return draggable({
      element: divRef.current!,
      dragHandle,
      canDrag: () => !Boolean(dragDisabled),
      getInitialData: () => ({ index, group, type: dragType }),
      onDragStart: () => setDragDropState?.({ isDragging: true }),
      onDrop: () => setDragDropState?.({ isDragging: false }),
    });
  }, [index, group, dragHandleRef, dragDisabled, setDragDropState, dragType]);

  return (
    <Tag {...restProps} ref={divRef}>
      {children}
    </Tag>
  );
}

export function DragDropTarget<ElementT extends React.ElementType = "div">({
  children,
  index,
  dragType,
  as,
  ...restProps
}: DragDropReorderableProps<ElementT>) {
  const divRef = useRef(null);
  const { group, onMoveItem } = useContext(DragDropGroupContext);
  const Tag = as || "div";
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const dropTarget = divRef.current;
    if (!dropTarget) return;

    return dropTargetForElements({
      element: dropTarget,
      getData: ({ input }) =>
        attachClosestEdge(
          { index, group, type: dragType },
          { element: dropTarget, input, allowedEdges: ["top", "bottom"] },
        ),
      onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
      onDragLeave: () => setClosestEdge(null),
      onDrop({ source, self }) {
        setClosestEdge(null);
        if (!group) return;
        const sourceData = source.data as DragDropItemData;
        const targetData = self.data as DragDropItemData;

        // Adjust index based on whether the top or bottom edge is being dragged into
        const edge = extractClosestEdge(self.data);
        if (!edge) return;
        const moveToIndex =
          edge === "top" ? targetData.index : targetData.index + 1;

        if (sourceData.index !== moveToIndex || sourceData.group !== group) {
          onMoveItem?.(sourceData.group, sourceData.index, group, moveToIndex);
        }
      },
    });
  }, [index, group, onMoveItem, dragType]);

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
  const { group, onMoveItem } = useContext(DragDropGroupContext);
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
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop({ source, self }) {
          setClosestEdge(null);
          if (!group) return;
          const sourceData = source.data as DragDropItemData;
          const targetData = self.data as DragDropItemData;

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

export type DragDropGroupProps<ElementT extends React.ElementType> =
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

export function DragDropGroup<ElementT extends React.ElementType = "div">({
  children,
  group,
  onMoveItem,
  as,
  ...restProps
}: DragDropGroupProps<ElementT>) {
  const contextValue: DragDropGroupContextType = {
    group,
    onMoveItem,
  };
  const Tag = as || "div";

  return (
    <DragDropGroupContext value={contextValue}>
      <Tag {...restProps}>{children}</Tag>
    </DragDropGroupContext>
  );
}
