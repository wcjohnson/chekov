// React global shared state, contexts, and utility hooks

import type { TaskId, StoredTask } from "@/app/lib/data/types";
import type { ReactNode } from "react";
import { createContext } from "react";

export type MultiSelectContextId =
  | "generic"
  | "dependencies"
  | "categoryDependencies";

export type MultiSelectState = {
  selectionContext: MultiSelectContextId;
  taskFilter?: (
    taskId: TaskId,
    taskDetail: StoredTask | null | undefined,
    multiSelectState: MultiSelectState,
  ) => boolean | undefined;
  renderCustomHeader: (multiSelectState: MultiSelectState) => ReactNode;
  selectedTaskSet: Set<TaskId>;
};

type MultiSelectContextType = {
  setState: React.Dispatch<React.SetStateAction<MultiSelectState | null>>;
  state: MultiSelectState | null;
  isActive: (selectionContext?: MultiSelectContextId) => boolean;
  getSelection: () => Set<TaskId>;
  close: () => void;
  clearSelection: () => void;
  selectAll: () => void;
  setTaskSelected: (taskId: TaskId, isSelected: boolean) => void;
};

export const MultiSelectContext = createContext<MultiSelectContextType>({
  setState: () => {},
  state: null,
  isActive: () => false,
  getSelection: () => new Set(),
  close: () => {},
  clearSelection: () => {},
  selectAll: () => {},
  setTaskSelected: () => {},
});
