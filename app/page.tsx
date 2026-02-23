"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { LeftColumn } from "./components/left/LeftColumn";
import { RightColumn } from "./components/right/RightColumn";
import { TopBar } from "./components/TopBar";
import {
  DEFAULT_CATEGORY,
  createEmptyDefinition,
  createEmptyState,
  dependenciesAreComplete,
  ensureStateForDefinition,
  flattenDefinitionTasks,
  normalizeDefinition,
  normalizeState,
  wouldCreateCycle,
} from "./lib/checklist";
import type { TagColorKey } from "./lib/tagColors";
import { loadDefinition, loadState, saveAll } from "./lib/storage";
import type {
  ChecklistDefinition,
  ChecklistMode,
  ChecklistState,
  ChecklistTaskDefinition,
  TaskId,
} from "./lib/types";

const downloadJson = (fileName: string, data: unknown): void => {
  const serialized = JSON.stringify(
    data,
    (_key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }

      return value;
    },
    2,
  );

  const blob = new Blob([serialized], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const readJsonFile = async (file: File): Promise<unknown> => {
  const text = await file.text();
  return JSON.parse(text);
};

const PANE_WIDTH_STORAGE_KEY = "chekov-left-pane-width";

const collectUsedTags = (
  tasksByCategory: ChecklistDefinition["tasksByCategory"],
  categories: string[],
): Set<string> => {
  const usedTags = new Set<string>();

  for (const category of categories) {
    for (const task of tasksByCategory[category] ?? []) {
      for (const tag of task.tags ?? []) {
        usedTags.add(tag);
      }
    }
  }

  return usedTags;
};

const pruneTagColors = (
  tagColors: ChecklistDefinition["tagColors"],
  tasksByCategory: ChecklistDefinition["tasksByCategory"],
  categories: string[],
): ChecklistDefinition["tagColors"] => {
  const usedTags = collectUsedTags(tasksByCategory, categories);
  const nextTagColors: ChecklistDefinition["tagColors"] = {};

  for (const [tag, color] of Object.entries(tagColors)) {
    if (usedTags.has(tag)) {
      nextTagColors[tag] = color;
    }
  }

  return nextTagColors;
};

export default function Home() {
  const [mode, setMode] = useState<ChecklistMode>("task");
  const [searchText, setSearchText] = useState("");
  const [definition, setDefinition] = useState<ChecklistDefinition>(
    createEmptyDefinition,
  );
  const [state, setState] = useState<ChecklistState>(createEmptyState);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null);
  const [editSelectedTaskIds, setEditSelectedTaskIds] = useState<Set<TaskId>>(
    new Set(),
  );
  const [isSettingDependencies, setIsSettingDependencies] = useState(false);
  const [pendingDependencyIds, setPendingDependencyIds] = useState<Set<TaskId>>(
    new Set(),
  );
  const [leftPaneWidth, setLeftPaneWidth] = useState(32);
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const importDefinitionInputRef = useRef<HTMLInputElement>(null);
  const importStateInputRef = useRef<HTMLInputElement>(null);
  const mainPaneRef = useRef<HTMLElement>(null);

  ///////////////////////////////////////// Data slicing

  const taskArray = useMemo(
    () => flattenDefinitionTasks(definition),
    [definition],
  );

  const taskMap = useMemo(() => {
    const map = new Map<TaskId, ChecklistTaskDefinition>();

    for (const task of taskArray) {
      map.set(task.id, task);
    }

    return map;
  }, [taskArray]);

  const taskCategoryMap = useMemo(() => {
    const map = new Map<TaskId, string>();

    for (const category of definition.categories) {
      for (const task of definition.tasksByCategory[category] ?? []) {
        map.set(task.id, category);
      }
    }

    return map;
  }, [definition]);

  const selectedTask = selectedTaskId
    ? (taskMap.get(selectedTaskId) ?? null)
    : null;
  const selectedTaskCategory =
    (selectedTaskId ? taskCategoryMap.get(selectedTaskId) : undefined) ??
    DEFAULT_CATEGORY;

  const normalizedSearch = searchText.trim().toLowerCase();
  const isSearchActive = normalizedSearch.length >= 2;
  const categoryOpenByMode = state.categoryVisibilityByMode[mode] ?? {};

  const taskVisibilityMap = useMemo(() => {
    const map = new Map<TaskId, boolean>();
    for (const task of taskArray) {
      if (isSearchActive) {
        const titleMatches = task.title
          .toLowerCase()
          .includes(normalizedSearch);
        const descriptionMatches = task.description
          .toLowerCase()
          .includes(normalizedSearch);
        const categoryMatches = taskCategoryMap
          .get(task.id)
          ?.toLowerCase()
          .includes(normalizedSearch);
        if (titleMatches || descriptionMatches || categoryMatches) {
          map.set(task.id, true);
        }
      } else if (mode === "edit") {
        map.set(task.id, true);
      } else {
        const taskState = state.tasks[task.id];

        if (
          !taskState?.completed &&
          !taskState?.explicitlyHidden &&
          dependenciesAreComplete(task, state)
        ) {
          map.set(task.id, true);
        }
      }
    }

    return map;
  }, [
    taskArray,
    taskCategoryMap,
    isSearchActive,
    mode,
    normalizedSearch,
    state,
  ]);

  ///////////////////////////////////////// Events

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [storedDefinition, storedState] = await Promise.all([
          loadDefinition(),
          loadState(),
        ]);

        const hydratedState = ensureStateForDefinition(
          storedDefinition,
          storedState,
        );

        setDefinition(storedDefinition);
        setState(hydratedState);
        setSelectedTaskId(null);
      } catch {
        setErrorMessage("Failed to load checklist from IndexedDB.");
      } finally {
        setIsLoaded(true);
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const persist = async () => {
      try {
        await saveAll(definition, state);
      } catch {
        setErrorMessage("Failed to persist checklist to IndexedDB.");
      }
    };

    void persist();
  }, [definition, isLoaded, state]);

  // Clear selection on task invalidation
  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }
    if (!taskMap.has(selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, taskMap]);

  useEffect(() => {
    if (mode !== "task" || !selectedTaskId) {
      return;
    }

    const stillVisible = taskVisibilityMap.get(selectedTaskId);

    if (!stillVisible) {
      setSelectedTaskId(null);
    }
  }, [mode, selectedTaskId, taskVisibilityMap]);

  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    setEditSelectedTaskIds(new Set());
    setIsSettingDependencies(false);
    setPendingDependencyIds(new Set());
  }, [mode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleMediaChange = () => {
      setIsDesktop(mediaQuery.matches);
    };

    handleMediaChange();
    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(PANE_WIDTH_STORAGE_KEY);
    if (!storedWidth) {
      return;
    }

    const parsedWidth = Number.parseFloat(storedWidth);
    if (!Number.isFinite(parsedWidth)) {
      return;
    }

    const clamped = Math.min(75, Math.max(20, parsedWidth));
    setLeftPaneWidth(clamped);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PANE_WIDTH_STORAGE_KEY, String(leftPaneWidth));
  }, [leftPaneWidth]);

  useEffect(() => {
    if (!isResizing || !isDesktop) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const container = mainPaneRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const nextPercent = (relativeX / rect.width) * 100;
      const clamped = Math.min(75, Math.max(20, nextPercent));
      setLeftPaneWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDesktop, isResizing]);

  useEffect(() => {
    const validTaskIds = new Set(taskArray.map((task) => task.id));

    setEditSelectedTaskIds((previous) => {
      const next = new Set(
        Array.from(previous).filter((taskId) => validTaskIds.has(taskId)),
      );
      return next.size === previous.size ? previous : next;
    });

    setPendingDependencyIds((previous) => {
      const next = new Set(
        Array.from(previous).filter(
          (taskId) => validTaskIds.has(taskId) && taskId !== selectedTaskId,
        ),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [taskArray, selectedTaskId]);

  const updateTask = (
    taskId: TaskId,
    updater: (task: ChecklistTaskDefinition) => ChecklistTaskDefinition,
  ) => {
    setDefinition((previous) => {
      const nextTasksByCategory: ChecklistDefinition["tasksByCategory"] = {
        ...previous.tasksByCategory,
      };

      for (const category of previous.categories) {
        nextTasksByCategory[category] = (
          previous.tasksByCategory[category] ?? []
        ).map((task) => (task.id === taskId ? updater(task) : task));
      }

      return {
        ...previous,
        tasksByCategory: nextTasksByCategory,
        tagColors: pruneTagColors(
          previous.tagColors,
          nextTasksByCategory,
          previous.categories,
        ),
      };
    });
  };

  const setTagColor = (tag: string, color: TagColorKey | null) => {
    setDefinition((previous) => {
      const normalizedTag = tag.trim();
      if (!normalizedTag) {
        return previous;
      }

      const nextTagColors = { ...previous.tagColors };

      if (color === null) {
        if (!(normalizedTag in nextTagColors)) {
          return previous;
        }

        delete nextTagColors[normalizedTag];
      } else if (nextTagColors[normalizedTag] === color) {
        return previous;
      } else {
        nextTagColors[normalizedTag] = color;
      }

      return {
        ...previous,
        tagColors: pruneTagColors(
          nextTagColors,
          previous.tasksByCategory,
          previous.categories,
        ),
      };
    });
  };

  const updateTaskState = (
    taskId: TaskId,
    updater: (
      taskState: ChecklistState["tasks"][TaskId],
    ) => ChecklistState["tasks"][TaskId],
  ) => {
    setState((previous) => {
      const existing = previous.tasks[taskId] ?? {
        completed: false,
        explicitlyHidden: false,
      };

      return {
        ...previous,
        tasks: {
          ...previous.tasks,
          [taskId]: updater(existing),
        },
      };
    });
  };

  const setCategoryOpen = (
    targetMode: ChecklistMode,
    category: string,
    isOpen: boolean,
  ) => {
    setState((previous) => ({
      ...previous,
      categoryVisibilityByMode: {
        ...previous.categoryVisibilityByMode,
        [targetMode]: {
          ...previous.categoryVisibilityByMode[targetMode],
          [category]: isOpen,
        },
      },
    }));
  };

  const addTaskToCategory = (category: string) => {
    const nextId = crypto.randomUUID();

    setDefinition((previous) => {
      const hasCategory = previous.categories.includes(category);
      if (!hasCategory) {
        return previous;
      }

      return {
        ...previous,
        tasksByCategory: {
          ...previous.tasksByCategory,
          [category]: [
            ...(previous.tasksByCategory[category] ?? []),
            {
              id: nextId,
              title: "Untitled Task",
              description: "",
              dependencies: [],
            },
          ],
        },
      };
    });

    setState((previous) => ({
      ...previous,
      tasks: {
        ...previous.tasks,
        [nextId]: {
          completed: false,
          explicitlyHidden: false,
        },
      },
    }));

    setSelectedTaskId(nextId);
    setErrorMessage(null);
  };

  const addCategory = (categoryName: string) => {
    const normalizedCategory = categoryName.trim();
    if (!normalizedCategory) {
      setErrorMessage("Category name cannot be empty.");
      return;
    }

    if (definition.categories.includes(normalizedCategory)) {
      setErrorMessage("A category with that name already exists.");
      return;
    }

    const nextId = crypto.randomUUID();

    setDefinition((previous) => ({
      ...previous,
      categories: [...previous.categories, normalizedCategory],
      tasksByCategory: {
        ...previous.tasksByCategory,
        [normalizedCategory]: [
          {
            id: nextId,
            title: "Untitled Task",
            description: "",
            dependencies: [],
          },
        ],
      },
    }));

    setState((previous) => ({
      ...previous,
      tasks: {
        ...previous.tasks,
        [nextId]: {
          completed: false,
          explicitlyHidden: false,
        },
      },
      categoryVisibilityByMode: {
        ...previous.categoryVisibilityByMode,
        task: {
          ...previous.categoryVisibilityByMode.task,
          [normalizedCategory]: true,
        },
        edit: {
          ...previous.categoryVisibilityByMode.edit,
          [normalizedCategory]: true,
        },
      },
    }));

    setSelectedTaskId(nextId);
    setErrorMessage(null);
  };

  const deleteSelectedTask = () => {
    if (!selectedTask) {
      return;
    }

    const remainingCategories = definition.categories.filter((category) => {
      const categoryTasks = definition.tasksByCategory[category] ?? [];
      return categoryTasks.some((task) => task.id !== selectedTask.id);
    });

    setDefinition((previous) => {
      const nextTasksByCategory: ChecklistDefinition["tasksByCategory"] = {
        ...previous.tasksByCategory,
      };

      for (const category of previous.categories) {
        nextTasksByCategory[category] = (
          previous.tasksByCategory[category] ?? []
        )
          .filter((task) => task.id !== selectedTask.id)
          .map((task) => ({
            ...task,
            dependencies: task.dependencies.filter(
              (dependencyId) => dependencyId !== selectedTask.id,
            ),
          }));
      }

      const nextCategories = previous.categories.filter(
        (category) => (nextTasksByCategory[category] ?? []).length > 0,
      );

      const cleanedTasksByCategory: ChecklistDefinition["tasksByCategory"] = {};
      for (const category of nextCategories) {
        cleanedTasksByCategory[category] = nextTasksByCategory[category] ?? [];
      }

      return {
        ...previous,
        categories: nextCategories,
        tasksByCategory: cleanedTasksByCategory,
        tagColors: pruneTagColors(
          previous.tagColors,
          cleanedTasksByCategory,
          nextCategories,
        ),
      };
    });

    setState((previous) => {
      const nextTasks = { ...previous.tasks };
      delete nextTasks[selectedTask.id];

      const nextTaskVisibility: Record<string, boolean> = {};
      const nextEditVisibility: Record<string, boolean> = {};

      for (const category of remainingCategories) {
        nextTaskVisibility[category] =
          previous.categoryVisibilityByMode.task[category] ?? true;
        nextEditVisibility[category] =
          previous.categoryVisibilityByMode.edit[category] ?? true;
      }

      return {
        ...previous,
        tasks: nextTasks,
        categoryVisibilityByMode: {
          task: nextTaskVisibility,
          edit: nextEditVisibility,
        },
      };
    });

    setSelectedTaskId((current) => {
      if (current !== selectedTask.id) {
        return current;
      }

      const remaining = taskArray.filter((task) => task.id !== selectedTask.id);
      return remaining[0]?.id ?? null;
    });
  };

  const selectAllFilteredTasks = () => {
    setEditSelectedTaskIds(new Set(taskVisibilityMap.keys()));
  };

  const deleteSelectedTasks = () => {
    const selectedIds = new Set(editSelectedTaskIds);
    if (selectedIds.size === 0) {
      return;
    }

    const remainingCategories = definition.categories.filter((category) => {
      const categoryTasks = definition.tasksByCategory[category] ?? [];
      return categoryTasks.some((task) => !selectedIds.has(task.id));
    });

    setDefinition((previous) => {
      const nextTasksByCategory: ChecklistDefinition["tasksByCategory"] = {
        ...previous.tasksByCategory,
      };

      for (const category of previous.categories) {
        nextTasksByCategory[category] = (
          previous.tasksByCategory[category] ?? []
        )
          .filter((task) => !selectedIds.has(task.id))
          .map((task) => ({
            ...task,
            dependencies: task.dependencies.filter(
              (dependencyId) => !selectedIds.has(dependencyId),
            ),
          }));
      }

      const nextCategories = previous.categories.filter(
        (category) => (nextTasksByCategory[category] ?? []).length > 0,
      );

      const cleanedTasksByCategory: ChecklistDefinition["tasksByCategory"] = {};
      for (const category of nextCategories) {
        cleanedTasksByCategory[category] = nextTasksByCategory[category] ?? [];
      }

      return {
        ...previous,
        categories: nextCategories,
        tasksByCategory: cleanedTasksByCategory,
        tagColors: pruneTagColors(
          previous.tagColors,
          cleanedTasksByCategory,
          nextCategories,
        ),
      };
    });

    setState((previous) => {
      const nextTasks = { ...previous.tasks };
      for (const taskId of selectedIds) {
        delete nextTasks[taskId];
      }

      const nextTaskVisibility: Record<string, boolean> = {};
      const nextEditVisibility: Record<string, boolean> = {};

      for (const category of remainingCategories) {
        nextTaskVisibility[category] =
          previous.categoryVisibilityByMode.task[category] ?? true;
        nextEditVisibility[category] =
          previous.categoryVisibilityByMode.edit[category] ?? true;
      }

      return {
        ...previous,
        tasks: nextTasks,
        categoryVisibilityByMode: {
          task: nextTaskVisibility,
          edit: nextEditVisibility,
        },
      };
    });

    setSelectedTaskId((current) => {
      if (!current || !selectedIds.has(current)) {
        return current;
      }

      const remaining = taskArray.filter((task) => !selectedIds.has(task.id));
      return remaining[0]?.id ?? null;
    });

    setEditSelectedTaskIds(new Set());
  };

  const clearSelection = () => {
    setEditSelectedTaskIds(new Set());
    setPendingDependencyIds(new Set());
  };

  const toggleTaskCompletion = (taskId: TaskId) => {
    updateTaskState(taskId, (previous) => ({
      ...previous,
      completed: !previous.completed,
    }));
  };

  const toggleEditTaskSelection = (taskId: TaskId) => {
    setEditSelectedTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const togglePendingDependencySelection = (taskId: TaskId) => {
    setPendingDependencyIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const unhideAllTasks = () => {
    setState((previous) => {
      const nextTasks = { ...previous.tasks };

      for (const [taskId, taskState] of Object.entries(nextTasks)) {
        nextTasks[taskId] = {
          ...taskState,
          explicitlyHidden: false,
        };
      }

      return {
        ...previous,
        tasks: nextTasks,
      };
    });
  };

  const resetAllCompletedTasks = () => {
    setState((previous) => {
      const nextTasks = { ...previous.tasks };

      for (const [taskId, taskState] of Object.entries(nextTasks)) {
        nextTasks[taskId] = {
          ...taskState,
          completed: false,
        };
      }

      return {
        ...previous,
        tasks: nextTasks,
      };
    });
  };

  const startSetDependencies = () => {
    if (!selectedTask) {
      return;
    }

    setPendingDependencyIds(new Set(selectedTask.dependencies));
    setIsSettingDependencies(true);
    setErrorMessage(null);
  };

  const confirmSetDependencies = () => {
    if (!selectedTask) {
      return;
    }

    const nextDependencies = Array.from(pendingDependencyIds).filter(
      (taskId) => taskId !== selectedTask.id,
    );

    if (wouldCreateCycle(definition, selectedTask.id, nextDependencies)) {
      setErrorMessage(
        "That dependency set would create a circular dependency.",
      );
      return;
    }

    updateTask(selectedTask.id, (task) => ({
      ...task,
      dependencies: nextDependencies,
    }));
    setIsSettingDependencies(false);
    setErrorMessage(null);
  };

  const clearSelectedTaskDependencies = () => {
    if (!selectedTask) {
      return;
    }

    updateTask(selectedTask.id, (task) => ({
      ...task,
      dependencies: [],
    }));
    setPendingDependencyIds(new Set());
    setIsSettingDependencies(false);
    setErrorMessage(null);
  };

  const handleImportDefinition = async (file: File) => {
    try {
      const parsed = await readJsonFile(file);
      const nextDefinition = normalizeDefinition(parsed);
      const nextState = ensureStateForDefinition(nextDefinition, state);

      setDefinition(nextDefinition);
      setState(nextState);
      setSelectedTaskId(null);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Invalid definition JSON file.");
    }
  };

  const handleImportState = async (file: File) => {
    try {
      const parsed = await readJsonFile(file);
      const nextState = ensureStateForDefinition(
        definition,
        normalizeState(parsed),
      );

      setState(nextState);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Invalid state JSON file.");
    }
  };

  return (
    <AppLayout
      mainPaneRef={mainPaneRef}
      isDesktop={isDesktop}
      leftPaneWidth={leftPaneWidth}
      onResizeStart={() => {
        if (isDesktop) {
          setIsResizing(true);
        }
      }}
      topBar={
        <TopBar
          mode={mode}
          isSettingDependencies={isSettingDependencies}
          editSelectedCount={editSelectedTaskIds.size}
          searchText={searchText}
          importDefinitionInputRef={importDefinitionInputRef}
          importStateInputRef={importStateInputRef}
          onToggleMode={() =>
            setMode((current) => (current === "task" ? "edit" : "task"))
          }
          onDeleteAll={deleteSelectedTasks}
          onUnhideAll={unhideAllTasks}
          onResetCompleted={resetAllCompletedTasks}
          onSearchTextChange={setSearchText}
          onExportDefinition={() =>
            downloadJson("chekov-definition.json", definition)
          }
          onImportDefinitionClick={() =>
            importDefinitionInputRef.current?.click()
          }
          onExportState={() => downloadJson("chekov-state.json", state)}
          onImportStateClick={() => importStateInputRef.current?.click()}
          onImportDefinitionFile={(file) => {
            void handleImportDefinition(file);
          }}
          onImportStateFile={(file) => {
            void handleImportState(file);
          }}
        />
      }
      leftColumn={
        <LeftColumn
          mode={mode}
          tasks={definition}
          setDefinition={setDefinition}
          taskVisibilityMap={taskVisibilityMap}
          state={state}
          selectedTaskId={selectedTaskId}
          isSettingDependencies={isSettingDependencies}
          editSelectedTaskIds={editSelectedTaskIds}
          pendingDependencyIds={pendingDependencyIds}
          isSearchActive={isSearchActive}
          onSelectAll={selectAllFilteredTasks}
          onClearSelection={clearSelection}
          onSelectTask={setSelectedTaskId}
          onToggleComplete={toggleTaskCompletion}
          onToggleEditSelection={toggleEditTaskSelection}
          onTogglePendingDependency={togglePendingDependencySelection}
          tagColors={definition.tagColors}
          categoryOpenByMode={categoryOpenByMode}
          onSetCategoryOpen={(category, isOpen) => {
            setCategoryOpen(mode, category, isOpen);
          }}
          onAddTaskToCategory={addTaskToCategory}
          onAddCategory={addCategory}
        />
      }
      rightColumn={
        <RightColumn
          mode={mode}
          selectedTask={selectedTask}
          selectedTaskCategory={selectedTaskCategory}
          isLoaded={isLoaded}
          errorMessage={errorMessage}
          state={state}
          tagColors={definition.tagColors}
          taskMap={taskMap}
          isSettingDependencies={isSettingDependencies}
          onDeleteSelectedTask={deleteSelectedTask}
          onUpdateTask={updateTask}
          onUpdateTaskState={updateTaskState}
          onStartSetDependencies={startSetDependencies}
          onConfirmSetDependencies={confirmSetDependencies}
          onClearSelectedTaskDependencies={clearSelectedTaskDependencies}
          onSetTagColor={setTagColor}
        />
      }
    />
  );
}
