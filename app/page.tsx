"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  const [draggingTaskId, setDraggingTaskId] = useState<TaskId | null>(null);
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

  const reorderTaskWithinCategory = (category: string, sourceTaskId: TaskId, targetTaskId: TaskId) => {
    if (sourceTaskId === targetTaskId) {
      return;
    }

    setDefinition((previous) => {
      const categoryTasks = sortTasks(
        previous.tasks.filter((task) => getTaskCategory(task) === category),
      );

      const fromIndex = categoryTasks.findIndex((task) => task.id === sourceTaskId);
      const toIndex = categoryTasks.findIndex((task) => task.id === targetTaskId);

      if (fromIndex < 0 || toIndex < 0) {
        return previous;
      }

      const reordered = [...categoryTasks];
      const [movedTask] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, movedTask);

      const nextOrderById = new Map<TaskId, number>();
      reordered.forEach((task, index) => {
        nextOrderById.set(task.id, index);
      });

      return {
        tasks: previous.tasks.map((task) => {
          const nextOrder = nextOrderById.get(task.id);

          if (nextOrder === undefined) {
            return task;
          }

          return {
            ...task,
            order: nextOrder,
          };
        }),
      };
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
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex w-full items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Chekov</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode((current) => (current === "task" ? "edit" : "task"))}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              {mode === "task" ? "Switch to Edit Mode" : "Switch to Task Mode"}
            </button>
            {mode === "edit" && (
              <>
                <button
                  type="button"
                  onClick={addTask}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Add Task
                </button>
                {!isSettingDependencies && editSelectedTaskIds.size > 0 && (
                  <button
                    type="button"
                    onClick={deleteSelectedTasks}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Delete All
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={unhideAllTasks}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Unhide All
            </button>
            <button
              type="button"
              onClick={resetAllCompletedTasks}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Reset Completed
            </button>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title/description"
              className="w-52 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
            />
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
                Data
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-52 rounded-md border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <button
                  type="button"
                  onClick={() => downloadJson("chekov-definition.json", definition)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  Export Definition
                </button>
                <button
                  type="button"
                  onClick={() => importDefinitionInputRef.current?.click()}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  Import Definition
                </button>
                <button
                  type="button"
                  onClick={() => downloadJson("chekov-state.json", state)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  Export State
                </button>
                <button
                  type="button"
                  onClick={() => importStateInputRef.current?.click()}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  Import State
                </button>
              </div>
            </details>
            <input
              ref={importDefinitionInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImportDefinition(file);
                }
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={importStateInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImportState(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </header>

      <main ref={mainPaneRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row md:gap-0">
        <section
          className="min-h-0 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:shrink-0"
          style={isDesktop ? { width: `${leftPaneWidth}%` } : undefined}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {mode === "task" ? "Available Tasks" : "All Tasks"}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{visibleTasks.length}</span>
              {mode === "edit" && (
                <>
                  <button
                    type="button"
                    onClick={selectAllFilteredTasks}
                    disabled={isSettingDependencies || visibleTasks.length === 0}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={
                      isSettingDependencies
                        ? pendingDependencyIds.size === 0
                        : editSelectedTaskIds.size === 0
                    }
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Clear Selection
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {tasksByCategory.map(({ category, tasks }) => (
              <details key={category} open className="rounded-md border border-zinc-200 dark:border-zinc-800">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900">
                  {category} ({tasks.length})
                </summary>
                <div className="space-y-1 px-2 pb-2">
                  {tasks.map((task) => {
                    const taskState = state.tasks[task.id] ?? { completed: false, explicitlyHidden: false };
                    const selected = selectedTaskId === task.id;
                    const dependenciesComplete = dependenciesAreComplete(task, state);
                    const showTaskModeCheckbox = mode === "task" && dependenciesComplete;
                    const showEditSelectionCheckbox =
                      mode === "edit" && (!isSettingDependencies || task.id !== selectedTaskId);
                    const canDrag = mode === "edit" && !isSettingDependencies;
                    const isDragging = draggingTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (mode === "edit" && isSettingDependencies) {
                            return;
                          }
                          setSelectedTaskId(task.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }

                          event.preventDefault();
                          if (mode === "edit" && isSettingDependencies) {
                            return;
                          }

                          setSelectedTaskId(task.id);
                        }}
                        onDragOver={(event) => {
                          if (!canDrag || !draggingTaskId || draggingTaskId === task.id) {
                            return;
                          }
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          if (!canDrag || !draggingTaskId || draggingTaskId === task.id) {
                            return;
                          }

                          event.preventDefault();
                          reorderTaskWithinCategory(category, draggingTaskId, task.id);
                          setDraggingTaskId(null);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ${
                          selected
                            ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
                            : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                        }`}
                        draggable={false}
                      >
                        {canDrag && (
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.stopPropagation();
                              setDraggingTaskId(task.id);
                            }}
                            onDragEnd={() => setDraggingTaskId(null)}
                            onClick={(event) => event.stopPropagation()}
                            className={`cursor-grab select-none text-zinc-500 dark:text-zinc-400 ${
                              isDragging ? "opacity-50" : ""
                            }`}
                            aria-label="Drag to reorder"
                          >
                            ⋮⋮
                          </button>
                        )}
                        {showTaskModeCheckbox && (
                          <input
                            type="checkbox"
                            checked={taskState.completed}
                            onChange={(event) => {
                              event.stopPropagation();
                              updateTaskState(task.id, (previous) => ({
                                ...previous,
                                completed: !previous.completed,
                              }));
                            }}
                            onClick={(event) => event.stopPropagation()}
                          />
                        )}
                        {showEditSelectionCheckbox && (
                          <input
                            type="checkbox"
                            checked={
                              isSettingDependencies
                                ? pendingDependencyIds.has(task.id)
                                : editSelectedTaskIds.has(task.id)
                            }
                            onChange={(event) => {
                              event.stopPropagation();

                              if (isSettingDependencies) {
                                setPendingDependencyIds((previous) => {
                                  const next = new Set(previous);
                                  if (next.has(task.id)) {
                                    next.delete(task.id);
                                  } else {
                                    next.add(task.id);
                                  }
                                  return next;
                                });
                                return;
                              }

                              setEditSelectedTaskIds((previous) => {
                                const next = new Set(previous);
                                if (next.has(task.id)) {
                                  next.delete(task.id);
                                } else {
                                  next.add(task.id);
                                }
                                return next;
                              });
                            }}
                            onClick={(event) => event.stopPropagation()}
                          />
                        )}
                        {!showTaskModeCheckbox && !showEditSelectionCheckbox && <span className="w-4" />}
                        <p
                          className={`min-w-0 truncate text-sm font-medium ${
                            mode === "task" && taskState.completed ? "line-through" : ""
                          }`}
                        >
                          {task.title || "Untitled Task"}
                          {mode === "task" && taskState.explicitlyHidden ? " (Hidden)" : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}

            {visibleTasks.length === 0 && (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                {mode === "task"
                  ? isSearchActive
                    ? "No tasks match your search."
                    : "No incomplete, visible tasks currently satisfy dependency requirements."
                  : "No tasks defined. Add one from the toolbar."}
              </p>
            )}
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => {
            if (isDesktop) {
              setIsResizing(true);
            }
          }}
          className="hidden w-2 cursor-col-resize bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 md:block"
        />

        <section className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:ml-4">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            {mode === "task" ? selectedTask?.title || "Task Details" : "Task Details"}
          </h2>

          {!isLoaded && <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading checklist...</p>}

          {isLoaded && !selectedTask && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Select a task to view details.</p>
          )}

          {isLoaded && selectedTask && (
            <div className="space-y-4">
              {mode === "edit" ? (
                <>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={deleteSelectedTask}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Delete Task
                    </button>
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Title</span>
                    <input
                      value={selectedTask.title}
                      onChange={(event) =>
                        updateTask(selectedTask.id, (task) => ({
                          ...task,
                          title: event.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                    />
                  </label>

                  <div className="grid grid-cols-1 gap-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Category</span>
                      <input
                        value={selectedTask.category}
                        onChange={(event) =>
                          updateTask(selectedTask.id, (task) => ({
                            ...task,
                            category: event.target.value.trim() ? event.target.value : DEFAULT_CATEGORY,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                      />
                    </label>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Dependencies</p>
                    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                      {selectedTask.dependencies.length === 0 ? (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
                      ) : (
                        <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                          {selectedTask.dependencies.map((dependencyId) => {
                            const dependencyTask = taskMap.get(dependencyId);
                            return <li key={dependencyId}>{dependencyTask?.title || dependencyId}</li>;
                          })}
                        </ul>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {!isSettingDependencies && (
                        <button
                          type="button"
                          onClick={startSetDependencies}
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          Set Dependencies
                        </button>
                      )}
                      {isSettingDependencies && (
                        <button
                          type="button"
                          onClick={confirmSetDependencies}
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          Confirm Dependencies
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={clearSelectedTaskDependencies}
                        disabled={selectedTask.dependencies.length === 0}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        Clear Dependencies
                      </button>
                      {isSettingDependencies && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Select dependency tasks from the left pane, then confirm.
                        </p>
                      )}
                    </div>
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Description (Markdown)</span>
                    <textarea
                      value={selectedTask.description}
                      onChange={(event) =>
                        updateTask(selectedTask.id, (task) => ({
                          ...task,
                          description: event.target.value,
                        }))
                      }
                      rows={10}
                      className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-zinc-700"
                    />
                  </label>
                </>
              ) : (
                <>
                  <article className="prose prose-zinc max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedTask.description || "No description."}
                    </ReactMarkdown>
                  </article>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Category: {selectedTask.category}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Order: {selectedTask.order}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Completed: {state.tasks[selectedTask.id]?.completed ? "Yes" : "No"}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Explicitly hidden: {state.tasks[selectedTask.id]?.explicitlyHidden ? "Yes" : "No"}
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        updateTaskState(selectedTask.id, (taskState) => ({
                          ...taskState,
                          explicitlyHidden: true,
                        }))
                      }
                      disabled={Boolean(state.tasks[selectedTask.id]?.explicitlyHidden)}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Hide Task
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateTaskState(selectedTask.id, (taskState) => ({
                          ...taskState,
                          explicitlyHidden: false,
                        }))
                      }
                      disabled={!Boolean(state.tasks[selectedTask.id]?.explicitlyHidden)}
                      className="ml-2 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Unhide Task
                    </button>
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium">Dependencies</p>
                    {selectedTask.dependencies.length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">None</p>
                    ) : (
                      <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                        {selectedTask.dependencies.map((dependencyId) => {
                          const dependencyTask = taskMap.get(dependencyId);
                          return (
                            <li key={dependencyId}>
                              {dependencyTask?.title || dependencyId}
                              {state.tasks[dependencyId]?.completed ? " (completed)" : ""}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {errorMessage}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
