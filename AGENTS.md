# AGENTS Metadata

## Project

- Name: Chekov
- Stack: Next.js (App Router), React, Tailwind CSS
- Storage: IndexedDB (in-browser, no backend)

## Current Architecture (important)

- UI is componentized:
  - `app/page.tsx` owns state, data mutations, persistence wiring, import/export handlers, and passes callbacks/derived props.
  - Layout shell: `app/components/layout/AppLayout.tsx`
  - Top bar: `app/components/TopBar.tsx`
  - Left side: `app/components/left/LeftColumn.tsx`, `LeftHeader.tsx`, `Category.tsx`, `Task.tsx`
  - Right side: `app/components/right/RightColumn.tsx`, `RightHeader.tsx`, `TaskDetails.tsx`
- Drag-and-drop task ordering uses `@dnd-kit/react` + `useSortable` in `left/Task.tsx`, orchestrated by `DragDropProvider` in `left/LeftColumn.tsx`.
- App remains fully client-side (no API routes / no server persistence).

## Work Completed

- Replaced starter page with a single-page checklist app.
- Implemented Task Mode (default) + Edit Mode with mode-specific interactions.
- Added top-bar controls:
  - Mode toggle, Add Task (Edit), Unhide All, Reset Completed
  - Search (case-insensitive on title/description, activates at 2+ chars)
  - Single Data dropdown for import/export definition/state
- Left pane behavior:
  - Category accordion list in both modes with per-category counts
  - Compact single-line task rows
  - In Task Mode, completed tasks strikethrough and hidden tasks annotated `(Hidden)`
  - In Task Mode, completion checkbox only appears when dependencies are complete
- Edit Mode workflows:
  - Select All / Clear Selection in left header
  - Delete All appears in top bar when multi-selection exists
  - Dependency-setting mode (`Set Dependencies` → select in list → `Confirm Dependencies`)
  - `Clear Dependencies` action for selected task
- Layout:
  - Full viewport split pane
  - Independent scrolling in both panes
  - Draggable desktop resize handle with width persisted in `localStorage`
- Hydration fix retained: no nested `<button>` structures in rows.

## Data Model

- **Model was migrated** from flat `tasks[]` + `order` + task-level `category`.
- Canonical definition shape now:
  - `ChecklistDefinition = { categories: string[]; tasksByCategory: Record<string, ChecklistTaskDefinition[]> }`
  - `ChecklistTaskDefinition = { id, title, description, dependencies }` (no `order`, no `category`)
  - `ChecklistState = { tasks: Record<TaskId, { completed, explicitlyHidden }> }`
- Category display order is driven by `definition.categories`.
- Task order is driven by array order inside `definition.tasksByCategory[category]`.
- Helpers in `app/lib/checklist.ts` now include:
  - `flattenDefinitionTasks(definition)`
  - `ensureStateForDefinition(definition, state)` based on flattened task IDs
  - `wouldCreateCycle(...)` based on flattened tasks
  - `normalizeDefinition(...)` supporting both new model and legacy `tasks[]` payloads.

## Legacy Compatibility

- `normalizeDefinition` accepts old JSON imports of shape `tasks[]` (with `category` and optional `order`) and converts to current `categories + tasksByCategory` model.
- Legacy `order` is ignored in canonical model; resulting in-category order follows incoming array order during migration.

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
- Maintain strict separation between definition and state objects.
- Keep cycle prevention enforced when changing dependencies.
- Preserve current interaction contracts:
  - Edit Mode checkboxes are for selection workflows, not completion toggling
  - Task completion toggles happen in Task Mode only
  - Dependency-setting mode intentionally repurposes list selection
- Preserve drag-reorder semantics:
  - Reorder/move tasks by mutating arrays in `tasksByCategory`
  - Keep `categories` order intact unless explicitly changing category ordering feature
- When touching right pane details, note category is derived externally and passed as `selectedTaskCategory` (task no longer owns category field).

## Quick File Map (handoff)

- Data/types: `app/lib/types.ts`
- Data normalization/cycle/state alignment: `app/lib/checklist.ts`
- IndexedDB adapter: `app/lib/storage.ts`
- App orchestration/state: `app/page.tsx`
- DnD row behavior: `app/components/left/Task.tsx`
- Left list composition/provider: `app/components/left/LeftColumn.tsx`
- Right details rendering/editing: `app/components/right/TaskDetails.tsx`
