"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { AppLayout } from "./components/layout/AppLayout";
import { LeftColumn } from "./components/left/LeftColumn";
import { RightColumn } from "./components/right/RightColumn";
import { TopBar } from "./components/TopBar";
import type { ChecklistMode, TaskId } from "./lib/types";
import {
  useClearDatabaseMutation,
  queryClient,
  useCompletionsWithReminders,
  useCompletionsQuery,
  useDeleteTasksMutation,
  useDependenciesQuery,
  useRemindersQuery,
  useTaskDependencyExpressions,
  useTaskCompletionMutation,
  useTasksMatchingSearch,
  useTaskStructure,
  useTasksWithCompleteDependencies,
  useUncompleteAllTasksMutation,
  useUnhideAllTasksMutation,
} from "./lib/data";
import { MultiSelectContext, type MultiSelectState } from "@/app/lib/context";
import {
  downloadJson,
  exportChecklistDefinition,
  exportChecklistState,
  importChecklistDefinition,
  importChecklistState,
  uploadJson,
  type ExportedChecklistDefinition,
  type ExportedChecklistState,
} from "./lib/export";

const PANE_WIDTH_STORAGE_KEY = "chekov-left-pane-width";

export function AppMain() {
  const [mode, setMode] = useState<ChecklistMode>("task");
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [stateSelectedTaskId, setSelectedTaskId] = useState<TaskId | null>(
    null,
  );
  const [editSelectedTaskIds, setEditSelectedTaskIds] = useState<Set<TaskId>>(
    new Set(),
  );
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

  const importDefinitionInputRef = useRef<HTMLInputElement>(null);
  const importStateInputRef = useRef<HTMLInputElement>(null);
  const mainPaneRef = useRef<HTMLElement>(null);

  ///////////////////////////////////////// Data slicing

  const taskStructure = useTaskStructure();
  const allDependencies = useDependenciesQuery().data ?? new Map();
  const dependencyExpressions = useTaskDependencyExpressions();
  const allCompletionsRaw = useCompletionsQuery().data;
  const allReminders = useRemindersQuery().data;
  const allCompletions = useCompletionsWithReminders(
    taskStructure.taskSet,
    allCompletionsRaw,
    allReminders,
    allDependencies,
    dependencyExpressions,
  );

  const tasksWithCompleteDependencies = useTasksWithCompleteDependencies(
    taskStructure.taskSet,
    allDependencies,
    allCompletions,
    dependencyExpressions,
  );
  const tasksMatchingSearch = useTasksMatchingSearch(searchText);

  ///////////////////////////////////////// Events

  // Clear selection on task invalidation
  const selectedTaskId =
    stateSelectedTaskId && taskStructure.taskSet.has(stateSelectedTaskId)
      ? stateSelectedTaskId
      : null;

  const effectiveEditSelectedTaskIds = useMemo(() => {
    const next = new Set(
      Array.from(editSelectedTaskIds).filter((taskId) =>
        taskStructure.taskSet.has(taskId),
      ),
    );

    return next.size === editSelectedTaskIds.size ? editSelectedTaskIds : next;
  }, [editSelectedTaskIds, taskStructure.taskSet]);

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

  const selectAllFilteredTasks = useCallback(() => {
    // TODO: filter against hiddenness of categories
    setEditSelectedTaskIds(new Set(tasksMatchingSearch));
  }, [tasksMatchingSearch]);

  const deleteTasksMutation = useDeleteTasksMutation();

  const deleteSelectedTasks = () => {
    const selectedIds = effectiveEditSelectedTaskIds;
    if (selectedIds.size === 0) {
      return;
    }
    deleteTasksMutation.mutate(Array.from(selectedIds));
    setEditSelectedTaskIds(new Set());
  };

  const clearSelection = () => {
    setEditSelectedTaskIds(new Set());
    if (effectiveMultiSelectState) {
      setMultiSelectState({
        ...effectiveMultiSelectState,
        selectedTaskSet: new Set(),
      });
    }
  };

  const toggleMode = () => {
    setMode((current) => {
      if (current === "edit") {
        setEditSelectedTaskIds(new Set());
        setMultiSelectState(null);
        return "task";
      }

      return "edit";
    });
  };

  const taskCompletionMutation = useTaskCompletionMutation();

  const toggleTaskCompletion = useCallback(
    (taskId: TaskId) => {
      const isCompleted = allCompletions.has(taskId);
      taskCompletionMutation.mutate({ taskId, isCompleted: !isCompleted });
    },
    [allCompletions, taskCompletionMutation],
  );

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
    setEditSelectedTaskIds(new Set());
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
      }}
    >
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
            editSelectedCount={effectiveEditSelectedTaskIds.size}
            searchText={searchText}
            importDefinitionInputRef={importDefinitionInputRef}
            importStateInputRef={importStateInputRef}
            onToggleMode={toggleMode}
            onDeleteAll={deleteSelectedTasks}
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
            completionsWithReminders={allCompletions}
            tasksWithCompleteDependencies={tasksWithCompleteDependencies}
            tasksMatchingSearch={tasksMatchingSearch}
            selectedTaskId={selectedTaskId}
            editSelectedTaskIds={effectiveEditSelectedTaskIds}
            onSelectAll={selectAllFilteredTasks}
            onClearSelection={clearSelection}
            onSelectTask={setSelectedTaskId}
            onToggleComplete={toggleTaskCompletion}
            onToggleEditSelection={toggleEditTaskSelection}
          />
        }
        rightColumn={
          <RightColumn
            mode={mode}
            selectedTaskId={selectedTaskId}
            completionsWithReminders={allCompletions}
            tasksWithCompleteDependencies={tasksWithCompleteDependencies}
            errorMessage={errorMessage}
          />
        }
      />
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
