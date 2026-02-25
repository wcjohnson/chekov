import type { TaskId } from "./types";

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

export const detectCycle = (
  graph: Record<TaskId, Set<TaskId>>,
  changedNode?: TaskId,
  changedNodeEdges?: Set<TaskId>,
): boolean => {
  const temp = new Set<TaskId>();
  const perm = new Set<TaskId>();

  const getEdges = (node: TaskId): Set<TaskId> | undefined => {
    if (node === changedNode) {
      return changedNodeEdges;
    }

    return graph[node];
  };

  const visit = (node: TaskId): boolean => {
    if (perm.has(node)) {
      return false;
    }

    if (temp.has(node)) {
      return true;
    }

    temp.add(node);

    for (const neighbor of getEdges(node) ?? []) {
      if (visit(neighbor)) {
        return true;
      }
    }

    temp.delete(node);
    perm.add(node);

    return false;
  };

  for (const taskId of Object.keys(graph)) {
    if (visit(taskId)) {
      return true;
    }
  }

  return false;
};
