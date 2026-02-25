"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { AppLayout } from "./components/layout/AppLayout";
import { LeftColumn } from "./components/left/LeftColumn";
import { RightColumn } from "./components/right/RightColumn";
import { TopBar } from "./components/TopBar";
import type { ChecklistMode, TaskId } from "./lib/types";
import {
  queryClient,
  useCompletionsQuery,
  useDeleteTasksMutation,
  useDependenciesQuery,
  useTaskCompletionMutation,
  useTaskDependenciesMutation,
  useTasksMatchingSearch,
  useTaskStructure,
  useTasksWithCompleteDependencies,
  useUncompleteAllTasksMutation,
  useUnhideAllTasksMutation,
} from "./lib/storage";
import { detectCycle } from "./lib/utils";
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
  const [searchText, setSearchText] = useState("");
  const [stateSelectedTaskId, setSelectedTaskId] = useState<TaskId | null>(
    null,
  );
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const importDefinitionInputRef = useRef<HTMLInputElement>(null);
  const importStateInputRef = useRef<HTMLInputElement>(null);
  const mainPaneRef = useRef<HTMLElement>(null);

  ///////////////////////////////////////// Data slicing

  const taskStructure = useTaskStructure();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allDependencies = useDependenciesQuery().data ?? {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allCompletions = useCompletionsQuery().data ?? new Set<string>();

  const tasksWithCompleteDependencies = useTasksWithCompleteDependencies(
    taskStructure.taskSet,
    allDependencies,
    allCompletions,
  );
  const tasksMatchingSearch = useTasksMatchingSearch(searchText);

  ///////////////////////////////////////// Events

  // Clear selection on task invalidation
  const selectedTaskId =
    stateSelectedTaskId && taskStructure.taskSet.has(stateSelectedTaskId)
      ? stateSelectedTaskId
      : null;

  // Clear edit mode data on switch to task mode
  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    setEditSelectedTaskIds(new Set());
    setIsSettingDependencies(false);
    setPendingDependencyIds(new Set());
  }, [mode]);

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

  // Restore stored width on mount
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

  useEffect(() => {
    const validTaskIds = taskStructure.taskSet;

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
  }, [taskStructure.taskSet, selectedTaskId]);

  const selectAllFilteredTasks = useCallback(() => {
    // TODO: filter against hiddenness of categories
    setEditSelectedTaskIds(new Set(tasksMatchingSearch));
  }, [tasksMatchingSearch]);

  const deleteTasksMutation = useDeleteTasksMutation();

  const deleteSelectedTasks = () => {
    const selectedIds = editSelectedTaskIds;
    if (selectedIds.size === 0) {
      return;
    }
    deleteTasksMutation.mutate(Array.from(selectedIds));
    setEditSelectedTaskIds(new Set());
  };

  const clearSelection = () => {
    setEditSelectedTaskIds(new Set());
    setPendingDependencyIds(new Set());
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

  const unhideAllTasksMutation = useUnhideAllTasksMutation();
  const unhideAllTasks = () => {
    unhideAllTasksMutation.mutate();
  };

  const uncompleteAllTasksMutation = useUncompleteAllTasksMutation();
  const resetAllCompletedTasks = () => {
    uncompleteAllTasksMutation.mutate();
  };

  const startSetDependencies = useCallback(() => {
    if (!selectedTaskId) {
      return;
    }
    const dependencies = allDependencies[selectedTaskId] ?? new Set<string>();

    setPendingDependencyIds(new Set(dependencies));
    setIsSettingDependencies(true);
    setErrorMessage(null);
  }, [allDependencies, selectedTaskId]);

  const taskDependenciesMutation = useTaskDependenciesMutation();
  const confirmSetDependencies = () => {
    if (!selectedTaskId) {
      return;
    }

    // This mutation is ok since the condition is impossible anyway
    pendingDependencyIds.delete(selectedTaskId);

    if (detectCycle(allDependencies, selectedTaskId, pendingDependencyIds)) {
      setErrorMessage(
        "That dependency set would create a circular dependency.",
      );
      return;
    }

    taskDependenciesMutation.mutate({
      taskId: selectedTaskId,
      dependencies: pendingDependencyIds,
    });
    setIsSettingDependencies(false);
    setErrorMessage(null);
  };

  const cancelSetDependencies = () => {
    setPendingDependencyIds(new Set());
    setIsSettingDependencies(false);
    setErrorMessage(null);
  };

  const clearSelectedTaskDependencies = () => {
    if (!selectedTaskId) {
      return;
    }

    taskDependenciesMutation.mutate({
      taskId: selectedTaskId,
      dependencies: new Set(),
    });
    setPendingDependencyIds(new Set());
    setIsSettingDependencies(false);
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
          tasksWithCompleteDependencies={tasksWithCompleteDependencies}
          tasksMatchingSearch={tasksMatchingSearch}
          selectedTaskId={selectedTaskId}
          isSettingDependencies={isSettingDependencies}
          editSelectedTaskIds={editSelectedTaskIds}
          pendingDependencyIds={pendingDependencyIds}
          onSelectAll={selectAllFilteredTasks}
          onClearSelection={clearSelection}
          onSelectTask={setSelectedTaskId}
          onToggleComplete={toggleTaskCompletion}
          onToggleEditSelection={toggleEditTaskSelection}
          onTogglePendingDependency={togglePendingDependencySelection}
          onConfirmSetDependencies={confirmSetDependencies}
          onCancelSetDependencies={cancelSetDependencies}
        />
      }
      rightColumn={
        <RightColumn
          mode={mode}
          selectedTaskId={selectedTaskId}
          tasksWithCompleteDependencies={tasksWithCompleteDependencies}
          errorMessage={errorMessage}
          isSettingDependencies={isSettingDependencies}
          onStartSetDependencies={startSetDependencies}
          onClearSelectedTaskDependencies={clearSelectedTaskDependencies}
        />
      }
    />
  );
}

export default function AppContainer() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppMain />
    </QueryClientProvider>
  );
}
