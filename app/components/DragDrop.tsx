// Drag drop implementation powered by pragmatic-drag-and-drop

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import clsx from "clsx";
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

export type DragDropListItemProps<ElementT extends React.ElementType> =
  PolymorphicProps<
    ElementT,
    {
      index: number;
      dragHandleRef?: RefObject<HTMLElement | null>;
      dragDisabled?: boolean;
      setDragDropState?: Dispatch<SetStateAction<DragDropItemStateType>>;
    }
  >;

export type DragDropListItemPositionData = {
  index: number;
  group: string;
};

export function DragDropListItem<ElementT extends React.ElementType = "div">({
  children,
  index,
  dragHandleRef,
  dragDisabled,
  setDragDropState,
  as,
  ...restProps
}: DragDropListItemProps<ElementT>) {
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
        getInitialData: () => ({ index, group }),
        onDragStart: () => setDragDropState?.({ isDragging: true }),
        onDrop: () => setDragDropState?.({ isDragging: false }),
      }),
      // 2. Make the element a drop target for other items
      dropTargetForElements({
        element: dropTarget,
        getData: ({ input }) =>
          attachClosestEdge(
            { index, group },
            { element: dropTarget, input, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop({ source, self }) {
          setClosestEdge(null);
          if (!group) return;
          const sourceData = source.data as DragDropListItemPositionData;
          const targetData = self.data as DragDropListItemPositionData;

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
  }, [index, group, onMoveItem, dragHandleRef, dragDisabled, setDragDropState]);

  return (
    <Tag {...restProps} ref={divRef} style={{ position: "relative" }}>
      {children}
      {closestEdge && <DropIndicator edge={closestEdge} />}
    </Tag>
  );
}

export type DragDropListProps<ElementT extends React.ElementType> =
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

export function DragDropList<ElementT extends React.ElementType = "div">({
  children,
  group,
  onMoveItem,
  as,
  ...restProps
}: DragDropListProps<ElementT>) {
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
