import type { TaskId } from "./types";
import { createContext } from "react";

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

// Set editing

export type SetEditContextState = {
  editContext: string;
  headerText: string;
  bannedTaskSet?: Set<TaskId>;
  onSetTasks: (taskIds: Set<TaskId>) => void;
  selectedTaskSet: Set<TaskId>;
};

type SetEditContextType = {
  setEditState: React.Dispatch<
    React.SetStateAction<SetEditContextState | null>
  >;
  editState: SetEditContextState | null;
};

export const SetEditContext = createContext<SetEditContextType>({
  setEditState: () => {},
  editState: null,
});
