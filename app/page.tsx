"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster, resolveValue } from "react-hot-toast";

import { AppLayout } from "./components/layout/AppLayout";
import { LeftColumn } from "./components/left/LeftColumn";
import { RightColumn } from "./components/right/RightColumn";
import { TopBar } from "./components/TopBar";
import type { ChecklistMode, TaskId } from "./lib/data/types";
import {
  MultiSelectContext,
  type MultiSelectContextId,
  type MultiSelectState,
} from "@/app/lib/context";
import { useStableCallback } from "@/app/lib/utils";
import {
  downloadJson,
  exportChecklistDefinition,
  exportChecklistState,
  importChecklistDefinition,
  importChecklistState,
  uploadJson,
} from "./lib/data/export";
import {
  type ExportedChecklistState,
  type ExportedChecklistDefinition,
} from "@/app/lib/data/jsonSchema";
import {
  useEffectiveCompletions,
  useTaskCategoryById,
  useTasksMatchingSearch,
  useTaskStructure,
  useOpenTasks,
} from "./lib/data/derivedData";
import {
  useCollapsedCategoriesQuery,
  useCompletionsQuery,
  useDependenciesQuery,
} from "./lib/data/queries";
import {
  useClearDatabaseMutation,
  useTaskCompletionMutation,
  useUncompleteAllTasksMutation,
  useUnhideAllTasksMutation,
} from "./lib/data/mutations";
import { queryClient } from "./lib/data/store";

const PANE_WIDTH_STORAGE_KEY = "chekov-left-pane-width";

export function AppMain() {
  const [mode, setMode] = useState<ChecklistMode>("task");
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [stateSelectedTaskId, setSelectedTaskId] = useState<TaskId | null>(
    null,
  );
  const [titleFocusTaskId, setTitleFocusTaskId] = useState<TaskId | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 32;
    }

    const storedWidth = window.localStorage.getItem(PANE_WIDTH_STORAGE_KEY);
    if (!storedWidth) {
      return 32;
    }

    const parsedWidth = Number.parseFloat(storedWidth);
    if (!Number.isFinite(parsedWidth)) {
      return 32;
    }

    return Math.min(75, Math.max(20, parsedWidth));
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [multiSelectState, setMultiSelectState] =
    useState<MultiSelectState | null>(null);
  const closeMultiSelect = useCallback(() => {
    setMultiSelectState(null);
  }, []);

  const importDefinitionInputRef = useRef<HTMLInputElement>(null);
  const importStateInputRef = useRef<HTMLInputElement>(null);
  const mainPaneRef = useRef<HTMLElement>(null);

  ///////////////////////////////////////// Data slicing

  const taskStructure = useTaskStructure();
  const allDependencies = useDependenciesQuery().data ?? new Map();
  const allCompletionsRaw = useCompletionsQuery().data;
  const allEffectiveCompletions = useEffectiveCompletions(
    taskStructure.taskSet,
    allCompletionsRaw,
    allDependencies,
  );

  const openTasks = useOpenTasks(
    taskStructure.taskSet,
    allDependencies,
    allEffectiveCompletions,
  );
  const tasksMatchingSearch = useTasksMatchingSearch(searchText);
  const collapsedCategories = useCollapsedCategoriesQuery().data;
  const collapsedEditCategories = useMemo(
    () => collapsedCategories?.edit ?? new Set<string>(),
    [collapsedCategories],
  );
  const taskCategoryById = useTaskCategoryById(taskStructure.categoryTasks);

  ///////////////////////////////////////// Events

  // Clear selection on task invalidation
  const selectedTaskId =
    stateSelectedTaskId && taskStructure.taskSet.has(stateSelectedTaskId)
      ? stateSelectedTaskId
      : null;

  const handleSelectTask = useCallback((taskId: TaskId, isNew = false) => {
    setSelectedTaskId(taskId);
    setTitleFocusTaskId(isNew ? taskId : null);
  }, []);

  const handleTitleFocused = useCallback(() => {
    setTitleFocusTaskId(null);
  }, []);

  const effectiveMultiSelectState = useMemo(() => {
    if (!multiSelectState) {
      return null;
    }

    const nextSelectedSet = new Set(
      Array.from(multiSelectState.selectedTaskSet).filter((taskId) =>
        taskStructure.taskSet.has(taskId),
      ),
    );

    if (nextSelectedSet.size === multiSelectState.selectedTaskSet.size) {
      return multiSelectState;
    }

    return {
      ...multiSelectState,
      selectedTaskSet: nextSelectedSet,
    };
  }, [multiSelectState, taskStructure.taskSet]);
  const isMultiSelectActive = useCallback(
    (selectionContext?: MultiSelectContextId) => {
      if (!effectiveMultiSelectState) {
        return false;
      }

      if (!selectionContext) {
        return true;
      }

      return effectiveMultiSelectState.selectionContext === selectionContext;
    },
    [effectiveMultiSelectState],
  );
  const getMultiSelectSelection = useCallback(
    () => effectiveMultiSelectState?.selectedTaskSet ?? new Set<TaskId>(),
    [effectiveMultiSelectState],
  );

  // Determine if on desktop
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

  // Store pane width on handle drag
  useEffect(() => {
    window.localStorage.setItem(PANE_WIDTH_STORAGE_KEY, String(leftPaneWidth));
  }, [leftPaneWidth]);

  // Impl handle drag
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

  const clearSelection = useCallback(() => {
    setMultiSelectState((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        selectedTaskSet: new Set(),
      };
    });
  }, []);

  const setTaskSelected = useCallback((taskId: TaskId, isSelected: boolean) => {
    setMultiSelectState((previous) => {
      if (!previous) {
        return previous;
      }

      const nextSelectedSet = new Set(previous.selectedTaskSet);
      if (isSelected) {
        nextSelectedSet.add(taskId);
      } else {
        nextSelectedSet.delete(taskId);
      }

      return {
        ...previous,
        selectedTaskSet: nextSelectedSet,
      };
    });
  }, []);

  const selectAllFilteredTasks = useStableCallback(() => {
    setMultiSelectState((previous) => {
      if (!previous) {
        return previous;
      }

      const nextSelectedSet = new Set(
        Array.from(tasksMatchingSearch).filter((taskId) => {
          const category = taskCategoryById.get(taskId);
          if (category && collapsedEditCategories.has(category)) {
            return false;
          }

          if (!previous.taskFilter) {
            return true;
          }

          return !!previous.taskFilter(taskId, undefined, previous);
        }),
      );

      return {
        ...previous,
        selectedTaskSet: nextSelectedSet,
      };
    });
  });

  const toggleMode = () => {
    setMode((current) => {
      if (current === "edit") {
        setMultiSelectState(null);
        return "task";
      }

      return "edit";
    });
  };

  const taskCompletionMutation = useTaskCompletionMutation();

  const toggleTaskCompletion = useCallback(
    (taskId: TaskId) => {
      const isCompleted = allEffectiveCompletions.has(taskId);
      taskCompletionMutation.mutate({ taskId, isCompleted: !isCompleted });
    },
    [allEffectiveCompletions, taskCompletionMutation],
  );

  const unhideAllTasksMutation = useUnhideAllTasksMutation();
  const unhideAllTasks = () => {
    unhideAllTasksMutation.mutate();
  };

  const uncompleteAllTasksMutation = useUncompleteAllTasksMutation();
  const resetAllCompletedTasks = () => {
    uncompleteAllTasksMutation.mutate();
  };

  const clearDatabaseMutation = useClearDatabaseMutation();
  const clearDatabase = () => {
    clearDatabaseMutation.mutate();
    setSelectedTaskId(null);
    setMultiSelectState(null);
    setErrorMessage(null);
  };

  const handleImportDefinition = async (file: File) => {
    try {
      const parsed = await uploadJson(file);
      await importChecklistDefinition(parsed as ExportedChecklistDefinition);
      setSelectedTaskId(null);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Invalid definition JSON file.");
    }
  };

  const handleImportState = async (file: File) => {
    try {
      const parsed = await uploadJson(file);
      await importChecklistState(parsed as ExportedChecklistState);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Invalid state JSON file.");
    }
  };

  const handleExportDefinition = async () => {
    const def = await exportChecklistDefinition();
    downloadJson("chekov-definition.json", def);
  };

  const handleExportState = async () => {
    const state = await exportChecklistState();
    downloadJson("chekov-state.json", state);
  };

  return (
    <MultiSelectContext
      value={{
        setState: setMultiSelectState,
        state: effectiveMultiSelectState,
        isActive: isMultiSelectActive,
        getSelection: getMultiSelectSelection,
        close: closeMultiSelect,
        clearSelection,
        selectAll: selectAllFilteredTasks,
        setTaskSelected,
      }}
    >
      <>
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
              searchText={searchText}
              importDefinitionInputRef={importDefinitionInputRef}
              importStateInputRef={importStateInputRef}
              onToggleMode={toggleMode}
              onUnhideAll={unhideAllTasks}
              onResetCompleted={resetAllCompletedTasks}
              showCompletedTasks={showCompletedTasks}
              onToggleShowCompletedTasks={() =>
                setShowCompletedTasks((current) => !current)
              }
              onClearDatabase={clearDatabase}
              onSearchTextChange={setSearchText}
              onExportDefinition={handleExportDefinition}
              onImportDefinitionClick={() =>
                importDefinitionInputRef.current?.click()
              }
              onExportState={handleExportState}
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
              showCompletedTasks={showCompletedTasks}
              completionsWithReminders={allEffectiveCompletions}
              openTasks={openTasks}
              tasksMatchingSearch={tasksMatchingSearch}
              selectedTaskId={selectedTaskId}
              onRequestTaskSelectionChange={handleSelectTask}
              onToggleComplete={toggleTaskCompletion}
            />
          }
          rightColumn={
            <RightColumn
              mode={mode}
              selectedTaskId={selectedTaskId}
              completionsWithReminders={allEffectiveCompletions}
              openTasks={openTasks}
              errorMessage={errorMessage}
              titleFocusTaskId={titleFocusTaskId}
              onTitleFocused={handleTitleFocused}
            />
          }
        />
        <Toaster position="bottom-center">
          {(toast) => (
            <div
              className={`pointer-events-auto w-full max-w-lg rounded-md border px-4 py-3 text-base shadow-sm ${
                toast.type === "error"
                  ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                  : "border-zinc-300 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-sm">
                  {toast.type === "error"
                    ? "⚠"
                    : toast.type === "success"
                      ? "✓"
                      : "•"}
                </span>
                <span className="min-w-0 break-words">
                  {resolveValue(toast.message, toast)}
                </span>
              </div>
            </div>
          )}
        </Toaster>
      </>
    </MultiSelectContext>
  );
}

export default function AppContainer() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppMain />
    </QueryClientProvider>
  );
}
