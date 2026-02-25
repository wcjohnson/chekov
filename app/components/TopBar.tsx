"use client";

import { useContext, type RefObject } from "react";
import type { ChecklistMode } from "@/app/lib/types";
import { MultiSelectContext } from "@/app/lib/context";

type TopBarProps = {
  mode: ChecklistMode;
  editSelectedCount: number;
  searchText: string;
  importDefinitionInputRef: RefObject<HTMLInputElement | null>;
  importStateInputRef: RefObject<HTMLInputElement | null>;
  onToggleMode: () => void;
  onDeleteAll: () => void;
  onUnhideAll: () => void;
  onResetCompleted: () => void;
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
  editSelectedCount,
  searchText,
  importDefinitionInputRef,
  importStateInputRef,
  onToggleMode,
  onDeleteAll,
  onUnhideAll,
  onResetCompleted,
  onSearchTextChange,
  onExportDefinition,
  onImportDefinitionClick,
  onExportState,
  onImportStateClick,
  onImportDefinitionFile,
  onImportStateFile,
}: TopBarProps) {
  const setEditContext = useContext(MultiSelectContext);
  const isSettingDependencies = !!setEditContext.state;

  return (
    <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex w-full items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Chekov</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleMode}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {mode === "task" ? "Switch to Edit Mode" : "Switch to Task Mode"}
          </button>
          {mode === "edit" && (
            <>
              {!isSettingDependencies && editSelectedCount > 0 && (
                <button
                  type="button"
                  onClick={onDeleteAll}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Delete All
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onUnhideAll}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Unhide All
          </button>
          <button
            type="button"
            onClick={onResetCompleted}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Reset Completed
          </button>
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
              <button
                type="button"
                onClick={onExportDefinition}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Export Definition
              </button>
              <button
                type="button"
                onClick={onImportDefinitionClick}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Import Definition
              </button>
              <button
                type="button"
                onClick={onExportState}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Export State
              </button>
              <button
                type="button"
                onClick={onImportStateClick}
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
