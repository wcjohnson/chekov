import { useCallback, useLayoutEffect, useRef } from "react";
import type { TaskId, TaskValues } from "@/app/lib/data/types";

export class DependencyCycleError extends Error {
  readonly cycle: TaskId[];
  readonly dependencyKind?: "openers" | "closers";

  constructor(cycle: TaskId[], dependencyKind?: "openers" | "closers") {
    super("Dependency cycle detected");
    this.name = "DependencyCycleError";
    this.cycle = cycle;
    this.dependencyKind = dependencyKind;
  }
}

export function fromKvPairsToRecord<K extends string, V>(
  keys: K[],
  values: V[],
): Record<K, V> {
  const record: Record<K, V> = {} as Record<K, V>;
  keys.forEach((key, index) => {
    const value = values[index];
    if (value !== undefined) record[key] = values[index];
  });
  return record;
}

export function fromKvPairsToMap<K, V>(keys: K[], values: V[]): Map<K, V> {
  const map = new Map<K, V>();
  keys.forEach((key, index) => {
    const value = values[index];
    if (value !== undefined) map.set(key, value);
  });
  return map;
}

export function mapToRecord<K extends string, V>(map: Map<K, V>): Record<K, V> {
  return Object.fromEntries(map.entries()) as Record<K, V>;
}

export function recordToMap<K extends string, V>(
  record: Record<K, V> | Partial<Record<K, V>> | undefined,
): Map<K, V> {
  return new Map(Object.entries(record ?? {}) as [K, V][]);
}

export const detectCycle = (
  graph: Map<TaskId, Set<TaskId>>,
  changedNode?: TaskId,
  changedNodeEdges?: Set<TaskId>,
): TaskId[] | null => {
  const active = new Set<TaskId>();
  const complete = new Set<TaskId>();
  const stack: TaskId[] = [];

  const getEdges = (node: TaskId): Set<TaskId> | undefined => {
    if (node === changedNode) {
      return changedNodeEdges;
    }

    return graph.get(node);
  };

  const visit = (node: TaskId): TaskId[] | null => {
    if (active.has(node)) {
      const cycleStartIndex = stack.lastIndexOf(node);
      if (cycleStartIndex === -1) {
        return [node, node];
      }

      return [...stack.slice(cycleStartIndex), node];
    }

    if (complete.has(node)) {
      return null;
    }

    active.add(node);
    stack.push(node);

    for (const neighbor of getEdges(node) ?? []) {
      const cycle = visit(neighbor);
      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    active.delete(node);
    complete.add(node);

    return null;
  };

  if (changedNode !== undefined) {
    const cycle = visit(changedNode);
    if (cycle) {
      return cycle;
    }
  }

  for (const taskId of graph.keys()) {
    const cycle = visit(taskId);
    if (cycle) {
      return cycle;
    }
  }

  return null;
};

export function useStableCallback<Args extends unknown[], ReturnValue>(
  callback: (...args: Args) => ReturnValue,
): (...args: Args) => ReturnValue {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: Args) => callbackRef.current(...args), []);
}

/** Type of a React element with a polymorphic tag. Use the `as` field to specify the tag to use. */
export type PolymorphicProps<
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
export function normalizeTaskValues(
  taskValues: TaskValues | null | undefined,
): TaskValues | undefined {
  // AGENT: Centralize task values normalization so imports/exports and mutations enforce identical persistence rules.
  const normalizedEntries = Object.entries(taskValues ?? {}).filter(
    ([key, value]) =>
      key.length > 0 &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value !== 0,
  );

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}
