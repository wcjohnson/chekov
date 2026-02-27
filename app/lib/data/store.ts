// Data store, schema, and migrations.

import { openDB, type DBSchema } from "idb";
import type {
  TaskId,
  StoredTask,
  CategoryName,
  DependencyExpression,
} from "./types";
import type { TagColorKey } from "../tagColors";
import { QueryClient } from "@tanstack/react-query";

export interface ChekovDB extends DBSchema {
  [TASKS_STORE]: {
    key: TaskId;
    value: StoredTask;
  };
  [TASK_TAGS_STORE]: {
    key: TaskId;
    value: Set<string>;
  };
  [TASK_DEPENDENCIES_STORE]: {
    key: TaskId;
    value: DependencyExpression;
  };
  [TASK_COMPLETION_STORE]: {
    key: TaskId;
    value: true;
  };
  [TASK_REMINDERS_STORE]: {
    key: TaskId;
    value: true;
  };
  [TASK_HIDDEN_STORE]: {
    key: TaskId;
    value: true;
  };
  [CATEGORIES_STORE]: {
    key: "categories";
    value: CategoryName[];
  };
  [CATEGORY_TASKS_STORE]: {
    key: CategoryName;
    value: TaskId[];
  };
  [CATEGORY_DEPENDENCIES_STORE]: {
    key: CategoryName;
    value: Set<TaskId>;
  };
  [TAG_COLORS_STORE]: {
    key: string;
    value: TagColorKey;
  };
  [CATEGORY_COLLAPSED_STORE]: {
    key: "task" | "edit";
    value: Set<CategoryName>;
  };
}

const DB_NAME = "chekov-db";
const DB_VERSION = 7;
export const TASKS_STORE = "tasks";
export const TASK_TAGS_STORE = "taskTags";
export const TASK_DEPENDENCIES_STORE = "taskDependencies";
export const TASK_COMPLETION_STORE = "taskCompletion";
export const TASK_REMINDERS_STORE = "taskWarnings";
export const TASK_HIDDEN_STORE = "taskHidden";
export const CATEGORIES_STORE = "categories";
export const CATEGORY_TASKS_STORE = "categoryTasks";
export const CATEGORY_DEPENDENCIES_STORE = "categoryDependencies";
export const TAG_COLORS_STORE = "tagColors";
export const CATEGORY_COLLAPSED_STORE = "categoryCollapsed";

let dbPromise: ReturnType<typeof openDB<ChekovDB>> | null = null;

export const getDb = async () => {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is not available");
  }

  if (!dbPromise) {
    dbPromise = openDB<ChekovDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const storeName of Array.from(db.objectStoreNames)) {
          db.deleteObjectStore(storeName);
        }

        db.createObjectStore(TASKS_STORE);
        db.createObjectStore(TASK_TAGS_STORE);
        db.createObjectStore(TASK_DEPENDENCIES_STORE);
        db.createObjectStore(TASK_COMPLETION_STORE);
        db.createObjectStore(TASK_REMINDERS_STORE);
        db.createObjectStore(TASK_HIDDEN_STORE);
        db.createObjectStore(CATEGORIES_STORE);
        db.createObjectStore(CATEGORY_TASKS_STORE);
        db.createObjectStore(CATEGORY_DEPENDENCIES_STORE);
        db.createObjectStore(TAG_COLORS_STORE);
        db.createObjectStore(CATEGORY_COLLAPSED_STORE);
      },
    });
  }

  return dbPromise;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
});
