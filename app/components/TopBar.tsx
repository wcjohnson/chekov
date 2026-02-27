"use client";

import type { RefObject } from "react";
import type { ChecklistMode } from "@/app/lib/data/types";
import { Button } from "@/app/components/catalyst/button";

type TopBarProps = {
  mode: ChecklistMode;
  searchText: string;
  importDefinitionInputRef: RefObject<HTMLInputElement | null>;
  importStateInputRef: RefObject<HTMLInputElement | null>;
  onToggleMode: () => void;
  onUnhideAll: () => void;
  onResetCompleted: () => void;
  showCompletedTasks: boolean;
  onToggleShowCompletedTasks: () => void;
  onClearDatabase: () => void;
  onSearchTextChange: (value: string) => void;
  onExportDefinition: () => void;
  onImportDefinitionClick: () => void;
  onExportState: () => void;
  onImportStateClick: () => void;
  onImportDefinitionFile: (file: File) => void;
  onImportStateFile: (file: File) => void;
};

export function TopBar({
  mode,
  searchText,
  importDefinitionInputRef,
  importStateInputRef,
  onToggleMode,
  onUnhideAll,
  onResetCompleted,
  showCompletedTasks,
  onToggleShowCompletedTasks,
  onClearDatabase,
  onSearchTextChange,
  onExportDefinition,
  onImportDefinitionClick,
  onExportState,
  onImportStateClick,
  onImportDefinitionFile,
  onImportStateFile,
}: TopBarProps) {
  return (
    <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex w-full items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Chekov</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onToggleMode}
            outline
            className="text-sm"
          >
            {mode === "task" ? "Switch to Edit Mode" : "Switch to Task Mode"}
          </Button>
          <Button
            type="button"
            onClick={onUnhideAll}
            outline
            className="text-sm"
          >
            Unhide All
          </Button>
          <Button
            type="button"
            onClick={onResetCompleted}
            outline
            className="text-sm"
          >
            Reset Completed
          </Button>
          {mode === "task" && (
            <Button
              type="button"
              onClick={onToggleShowCompletedTasks}
              outline
              className="text-sm"
            >
              {showCompletedTasks ? "Hide Completed" : "Show Completed"}
            </Button>
          )}
          <Button
            type="button"
            onClick={onClearDatabase}
            outline
            className="text-sm"
          >
            Clear DB
          </Button>
          <input
            type="search"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Search..."
            className="w-52 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
          />
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
              Data
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-52 rounded-md border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <Button
                type="button"
                onClick={onExportDefinition}
                plain
                className="w-full justify-start text-sm"
              >
                Export Definition
              </Button>
              <Button
                type="button"
                onClick={onImportDefinitionClick}
                plain
                className="w-full justify-start text-sm"
              >
                Import Definition
              </Button>
              <Button
                type="button"
                onClick={onExportState}
                plain
                className="w-full justify-start text-sm"
              >
                Export State
              </Button>
              <Button
                type="button"
                onClick={onImportStateClick}
                plain
                className="w-full justify-start text-sm"
              >
                Import State
              </Button>
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
                onImportDefinitionFile(file);
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
                onImportStateFile(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>
    </header>
  );
}
