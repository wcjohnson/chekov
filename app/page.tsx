"use client";

import type { DragEndEvent, DragOverEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  normalizeDefinition,
  normalizeState,
  sortTasks,
  wouldCreateCycle,
} from "./lib/checklist";
import { loadDefinition, loadState, saveAll } from "./lib/storage";
import type {
  ChecklistDefinition,
  ChecklistMode,
  ChecklistState,
  ChecklistTaskDefinition,
  TaskId,
} from "./lib/types";

const downloadJson = (fileName: string, data: unknown): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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

const getTaskCategory = (task: ChecklistTaskDefinition): string =>
  task.category?.trim() ? task.category : DEFAULT_CATEGORY;

export default function Home() {
  const [mode, setMode] = useState<ChecklistMode>("task");
  const [searchText, setSearchText] = useState("");
  const [definition, setDefinition] = useState<ChecklistDefinition>(createEmptyDefinition);
  const [state, setState] = useState<ChecklistState>(createEmptyState);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null);
  const [editSelectedTaskIds, setEditSelectedTaskIds] = useState<Set<TaskId>>(new Set());
  const [isSettingDependencies, setIsSettingDependencies] = useState(false);
  const [pendingDependencyIds, setPendingDependencyIds] = useState<Set<TaskId>>(new Set());
  const [leftPaneWidth, setLeftPaneWidth] = useState(32);
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const importDefinitionInputRef = useRef<HTMLInputElement>(null);
  const importStateInputRef = useRef<HTMLInputElement>(null);
  const mainPaneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [storedDefinition, storedState] = await Promise.all([
          loadDefinition(),
          loadState(),
        ]);

        const hydratedState = ensureStateForDefinition(storedDefinition, storedState);

        setDefinition(storedDefinition);
        setState(hydratedState);
        setSelectedTaskId(storedDefinition.tasks[0]?.id ?? null);
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

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    if (!definition.tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(definition.tasks[0]?.id ?? null);
    }
  }, [definition.tasks, selectedTaskId]);

  const sortedTasks = useMemo(() => sortTasks(definition.tasks), [definition.tasks]);

  const taskMap = useMemo(() => {
    const map = new Map<TaskId, ChecklistTaskDefinition>();

    for (const task of definition.tasks) {
      map.set(task.id, task);
    }

    return map;
  }, [definition.tasks]);

  const selectedTask = selectedTaskId ? taskMap.get(selectedTaskId) ?? null : null;

  const normalizedSearch = searchText.trim().toLowerCase();
  const isSearchActive = normalizedSearch.length >= 2;

  const visibleTasks = useMemo(() => {
    if (isSearchActive) {
      return sortedTasks.filter((task) => {
        const titleMatches = task.title.toLowerCase().includes(normalizedSearch);
        const descriptionMatches = task.description.toLowerCase().includes(normalizedSearch);
        return titleMatches || descriptionMatches;
      });
    }

    if (mode === "edit") {
      return sortedTasks;
    }

    return sortedTasks.filter((task) => {
      const taskState = state.tasks[task.id];

      if (taskState?.completed) {
        return false;
      }

      if (taskState?.explicitlyHidden) {
        return false;
      }

      return dependenciesAreComplete(task, state);
    });
  }, [isSearchActive, mode, normalizedSearch, sortedTasks, state]);

  const tasksByCategory = useMemo(() => {
    const grouped = new Map<string, ChecklistTaskDefinition[]>();

    for (const task of visibleTasks) {
      const categoryName = getTaskCategory(task);
      const existing = grouped.get(categoryName);
      if (existing) {
        existing.push(task);
      } else {
        grouped.set(categoryName, [task]);
      }
    }

    return Array.from(grouped.entries()).map(([category, tasks]) => ({
      category,
      tasks,
    }));
  }, [visibleTasks]);

  useEffect(() => {
    if (mode !== "task" || !selectedTaskId) {
      return;
    }

    const stillVisible = visibleTasks.some((task) => task.id === selectedTaskId);
    if (!stillVisible) {
      setSelectedTaskId(null);
    }
  }, [mode, selectedTaskId, visibleTasks]);

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
    const validTaskIds = new Set(definition.tasks.map((task) => task.id));

    setEditSelectedTaskIds((previous) => {
      const next = new Set(Array.from(previous).filter((taskId) => validTaskIds.has(taskId)));
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
  }, [definition.tasks, selectedTaskId]);

  const updateTask = (taskId: TaskId, updater: (task: ChecklistTaskDefinition) => ChecklistTaskDefinition) => {
    setDefinition((previous) => ({
      tasks: previous.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    }));
  };

  const updateTaskState = (
    taskId: TaskId,
    updater: (taskState: ChecklistState["tasks"][TaskId]) => ChecklistState["tasks"][TaskId],
  ) => {
    setState((previous) => {
      const existing = previous.tasks[taskId] ?? { completed: false, explicitlyHidden: false };

      return {
        tasks: {
          ...previous.tasks,
          [taskId]: updater(existing),
        },
      };
    });
  };

  const addTask = () => {
    const nextId = crypto.randomUUID();
    const nextOrder = sortedTasks.length;

    setDefinition((previous) => ({
      tasks: [
        ...previous.tasks,
        {
          id: nextId,
          order: nextOrder,
          category: DEFAULT_CATEGORY,
          title: "Untitled Task",
          description: "",
          dependencies: [],
        },
      ],
    }));

    setState((previous) => ({
      tasks: {
        ...previous.tasks,
        [nextId]: {
          completed: false,
          explicitlyHidden: false,
        },
      },
    }));

    setSelectedTaskId(nextId);
  };

  const deleteSelectedTask = () => {
    if (!selectedTask) {
      return;
    }

    setDefinition((previous) => ({
      tasks: previous.tasks
        .filter((task) => task.id !== selectedTask.id)
        .map((task) => ({
          ...task,
          dependencies: task.dependencies.filter((dependencyId) => dependencyId !== selectedTask.id),
        })),
    }));

    setState((previous) => {
      const nextTasks = { ...previous.tasks };
      delete nextTasks[selectedTask.id];
      return { tasks: nextTasks };
    });

    setSelectedTaskId((current) => {
      if (current !== selectedTask.id) {
        return current;
      }

      const remaining = sortedTasks.filter((task) => task.id !== selectedTask.id);
      return remaining[0]?.id ?? null;
    });
  };

  const selectAllFilteredTasks = () => {
    setEditSelectedTaskIds(new Set(visibleTasks.map((task) => task.id)));
  };

  const deleteSelectedTasks = () => {
    const selectedIds = new Set(editSelectedTaskIds);
    if (selectedIds.size === 0) {
      return;
    }

    setDefinition((previous) => ({
      tasks: previous.tasks
        .filter((task) => !selectedIds.has(task.id))
        .map((task) => ({
          ...task,
          dependencies: task.dependencies.filter((dependencyId) => !selectedIds.has(dependencyId)),
        })),
    }));

    setState((previous) => {
      const nextTasks = { ...previous.tasks };
      for (const taskId of selectedIds) {
        delete nextTasks[taskId];
      }
      return { tasks: nextTasks };
    });

    setSelectedTaskId((current) => {
      if (!current || !selectedIds.has(current)) {
        return current;
      }

      const remaining = sortedTasks.filter((task) => !selectedIds.has(task.id));
      return remaining[0]?.id ?? null;
    });

    setEditSelectedTaskIds(new Set());
  };

  const clearSelection = () => {
    setEditSelectedTaskIds(new Set());
    setPendingDependencyIds(new Set());
  };

  const moveTask = useCallback( (taskId: TaskId, nextCategory: string, nextIndex: number) => {
    setDefinition((previous) => {
      const taskToMove = sortedTasks.find((task) => task.id === taskId);
      if (!taskToMove) {
        return previous;
      }
      
      const allTasks = previous.tasks
      taskToMove.category = nextCategory;

      const nextCategoryTasks = allTasks
        .filter((task) => getTaskCategory(task) === nextCategory && task.id !== taskId)
      nextCategoryTasks.splice(nextIndex, 0, taskToMove);
      // Reassign order based on new position in category
      const updatedTaskMap = new Map();
      nextCategoryTasks.forEach((task, index) => {
        task.order = index;
        updatedTaskMap.set(task.id, task);
      });

      // Generate a new total Tasks array with all updated tasks replaced
      const updatedTasks = allTasks.map((task) => {
        const updatedTask = updatedTaskMap.get(task.id);
        if (updatedTask) {
          return updatedTask;
        } else {
          return task;
        }
      });

      return { tasks: updatedTasks };
    });
  }, [sortedTasks]);

  const handleSortableDragEnd = (event: Parameters<DragEndEvent>[0]) => {
    if (event.canceled) {
      return;
    }

    console.log("handleSortableDragEnd event:", event); 

    const { operation } = event;
    if (!operation.source || !operation.target) {
      return;
    }
    if(!isSortable(operation.source)) { return; }

    const { index, group, initialGroup } = operation.source;
    const sourceTaskId = String(operation.source.id);
    const sourceCategory = String(initialGroup);
    const targetCategory = String(group);

    console.log("moveTask details:", { sourceTaskId, sourceCategory, targetCategory, index });
    moveTask(sourceTaskId, targetCategory, index);
  };

  const handleDragOver = (event: Parameters<DragOverEvent>[0]) => {
      const { target, source } = event.operation;

    //? when we move the item to a new list, this callback is called again when source as the target 
    if (target?.id === source?.id) {
      return;
    }
  }

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

      return { tasks: nextTasks };
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

      return { tasks: nextTasks };
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
      setErrorMessage("That dependency set would create a circular dependency.");
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
      setSelectedTaskId(nextDefinition.tasks[0]?.id ?? null);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Invalid definition JSON file.");
    }
  };

  const handleImportState = async (file: File) => {
    try {
      const parsed = await readJsonFile(file);
      const nextState = ensureStateForDefinition(definition, normalizeState(parsed));

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
          onToggleMode={() => setMode((current) => (current === "task" ? "edit" : "task"))}
          onAddTask={addTask}
          onDeleteAll={deleteSelectedTasks}
          onUnhideAll={unhideAllTasks}
          onResetCompleted={resetAllCompletedTasks}
          onSearchTextChange={setSearchText}
          onExportDefinition={() => downloadJson("chekov-definition.json", definition)}
          onImportDefinitionClick={() => importDefinitionInputRef.current?.click()}
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
          visibleTasks={visibleTasks}
          tasksByCategory={tasksByCategory}
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
          onDragEnd={handleSortableDragEnd}
          onDragOver={handleDragOver}
        />
      }
      rightColumn={
        <RightColumn
          mode={mode}
          selectedTask={selectedTask}
          isLoaded={isLoaded}
          errorMessage={errorMessage}
          state={state}
          taskMap={taskMap}
          isSettingDependencies={isSettingDependencies}
          onDeleteSelectedTask={deleteSelectedTask}
          onUpdateTask={updateTask}
          onUpdateTaskState={updateTaskState}
          onStartSetDependencies={startSetDependencies}
          onConfirmSetDependencies={confirmSetDependencies}
          onClearSelectedTaskDependencies={clearSelectedTaskDependencies}
        />
      }
    />
  );
}
