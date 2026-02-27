"use client";

import type { RefObject } from "react";
import type { ChecklistMode } from "@/app/lib/data/types";
import { Button } from "@/app/components/catalyst/button";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "@/app/components/catalyst/dropdown";
import { Navbar, NavbarSection } from "@/app/components/catalyst/navbar";

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
    <Navbar className="flex-wrap border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <NavbarSection>
        <h1 className="text-xl font-semibold tracking-tight">Chekov</h1>
      </NavbarSection>

      <NavbarSection className="flex-wrap gap-2">
        <Button
          type="button"
          onClick={onToggleMode}
          outline
          className="text-sm"
        >
          {mode === "task" ? "Switch to Edit Mode" : "Switch to Task Mode"}
        </Button>
        <Button type="button" onClick={onUnhideAll} outline className="text-sm">
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
        <Dropdown>
          <DropdownButton type="button" outline className="text-sm">
            Data
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={onExportDefinition}>
              Export Definition
            </DropdownItem>
            <DropdownItem onClick={onImportDefinitionClick}>
              Import Definition
            </DropdownItem>
            <DropdownItem onClick={onExportState}>Export State</DropdownItem>
            <DropdownItem onClick={onImportStateClick}>
              Import State
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
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
      </NavbarSection>
    </Navbar>
  );
}
