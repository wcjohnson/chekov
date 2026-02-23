import { openDB } from "idb";
import {
  createEmptyDefinition,
  createEmptyState,
  ensureStateForDefinition,
  normalizeDefinition,
  normalizeState,
} from "./checklist";
import type { ChecklistDefinition, ChecklistState } from "./types";

const DB_NAME = "chekov-db";
const DB_VERSION = 1;
const DEFINITION_STORE = "definition";
const STATE_STORE = "state";
const PRIMARY_KEY = "current";

type StoredValue<T> = {
  value: T;
};

let dbPromise: ReturnType<typeof openDB> | null = null;

const getDb = async () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DEFINITION_STORE)) {
          db.createObjectStore(DEFINITION_STORE);
        }

        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE);
        }
      },
    });
  }

  return dbPromise;
};

export const loadDefinition = async (): Promise<ChecklistDefinition> => {
  const db = await getDb();
  if (!db) {
    return createEmptyDefinition();
  }
  const raw = await db.get(DEFINITION_STORE, PRIMARY_KEY);

  if (!raw) {
    return createEmptyDefinition();
  }

  return normalizeDefinition((raw as StoredValue<ChecklistDefinition>).value);
};

export const loadState = async (): Promise<ChecklistState> => {
  const db = await getDb();
  if (!db) {
    return createEmptyState();
  }
  const raw = await db.get(STATE_STORE, PRIMARY_KEY);

  if (!raw) {
    return createEmptyState();
  }

  return normalizeState((raw as StoredValue<ChecklistState>).value);
};

export const saveDefinition = async (definition: ChecklistDefinition): Promise<void> => {
  const db = await getDb();
  if (!db) {
    return;
  }
  const normalized = normalizeDefinition(definition);

  await db.put(DEFINITION_STORE, { value: normalized }, PRIMARY_KEY);
};

export const saveState = async (state: ChecklistState): Promise<void> => {
  const db = await getDb();
  if (!db) {
    return;
  }
  const normalized = normalizeState(state);

  await db.put(STATE_STORE, { value: normalized }, PRIMARY_KEY);
};

export const saveAll = async (
  definition: ChecklistDefinition,
  state: ChecklistState,
): Promise<{ definition: ChecklistDefinition; state: ChecklistState }> => {
  const normalizedDefinition = normalizeDefinition(definition);
  const normalizedState = ensureStateForDefinition(
    normalizedDefinition,
    normalizeState(state),
  );

  await Promise.all([saveDefinition(normalizedDefinition), saveState(normalizedState)]);

  return {
    definition: normalizedDefinition,
    state: normalizedState,
  };
};
