# AGENTS Metadata

## Project
- Name: Chekov
- Stack: Next.js (App Router), React, Tailwind CSS
- Storage: IndexedDB (in-browser, no backend)

## Work Completed
- Replaced starter page with a single-page checklist app in `app/page.tsx`.
- Implemented two primary modes:
  - Task Mode (default): operational task execution view.
  - Edit Mode: checklist definition/state management view.
- Added top bar with:
  - Mode switch
  - Add Task (Edit Mode)
  - Unhide All / Reset Completed
  - Search (case-insensitive title/description; active from 2+ chars)
  - Consolidated Data dropdown for import/export actions
- Implemented category accordion task list in both modes:
  - Categories render as collapsible sections with per-category task counts
  - Categories with zero rendered tasks are omitted
  - Tasks are compact single-line rows
- Added Task Mode rendering behavior:
  - Completed title strikethrough
  - `(Hidden)` annotation for explicitly hidden tasks
  - Completion checkbox hidden when dependencies are unmet (including search surfacing cases)
- Added Task Mode details actions:
  - Hide Task / Unhide Task
- Added Edit Mode multi-select workflows:
  - Select All (in task list pane header, search-aware)
  - Clear Selection
  - Delete All appears when task multi-selection exists
  - Dedicated dependency selection mode via `Set Dependencies` + `Confirm Dependencies`
  - `Clear Dependencies` action
- Added drag-and-drop reordering within category (Edit Mode):
  - Drag handle per task row implemented with `@dnd-kit/react`
  - Uses `DragDropProvider` + `useSortable` primitives (`@dnd-kit/react/sortable`)
  - Drop mutates `order` values for all tasks in the category so ordering is consistent top-to-bottom
  - Removed manual order input from Edit Mode details pane
- Refactored layout:
  - Full viewport split-pane layout
  - Independent scrolling for task pane and details pane
  - Draggable vertical resize handle between panes on desktop
  - Pane width persists across reloads via `localStorage`
- Resolved hydration issue by avoiding nested `<button>` elements in task rows.

## Data Model
- Top-level objects are separated into:
  - `ChecklistDefinition` (`tasks` with id, order, category, title, description, dependencies)
  - `ChecklistState` (per-task `completed` and `explicitlyHidden` flags)
- Created shared types in `app/lib/types.ts`.
- Added normalization/default behavior and dependency utilities in `app/lib/checklist.ts`.

## Persistence
- Added IndexedDB persistence in `app/lib/storage.ts` using `idb`.
- Stores definition and state in separate object stores:
  - `definition`
  - `state`
- Reads/writes normalized payloads and keeps state aligned to current definition.

## Import/Export
- Definition and state are independently exportable/importable JSON files.
- Import performs normalization and validation; circular dependency definitions are rejected.

## Dependencies Added
- `@dnd-kit/react`
- `idb`
- `react-markdown`
- `remark-gfm`

## Notes for Future Agents
- The app is intentionally fully client-side with no server APIs.
- Avoid introducing backend persistence unless explicitly requested.
- Maintain the separation between definition and state objects.
- Keep cycle prevention enforced when changing dependencies.
- Preserve current interaction contracts:
  - Edit Mode checkboxes are for selection workflows, not completion toggling
  - Task completion toggles happen in Task Mode only
  - Dependency-setting mode intentionally repurposes list selection
- Preserve drag-reorder semantics: reorder only within category, then renumber category task orders.
