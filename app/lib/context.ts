// React global shared state, contexts, and utility hooks

import type { TaskId } from "@/app/lib/types";
import { createContext } from "react";

export type MultiSelectState = {
  selectionContext: string;
  headerText: string;
  bannedTaskSet?: Set<TaskId>;
  onSetTasks: (taskIds: Set<TaskId>) => void;
  selectedTaskSet: Set<TaskId>;
};

type MultiSelectContextType = {
  setState: React.Dispatch<React.SetStateAction<MultiSelectState | null>>;
  state: MultiSelectState | null;
};

export const MultiSelectContext = createContext<MultiSelectContextType>({
  setState: () => {},
  state: null,
});
