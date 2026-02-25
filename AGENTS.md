# AGENTS Metadata

## Project

- Name: Chekov
- Stack: Next.js (App Router), React, Tailwind CSS
- Storage: IndexedDB (in-browser, no backend), accessed via `idb`
- Data flow: `@tanstack/react-query` (queries + mutations over IndexedDB)

## Current Architecture (important)

- UI is componentized:
  - `app/page.tsx` (`AppMain`) owns UI/session state (mode, selection, dependency workflow, search, pane width) and import/export handlers.
  - `app/page.tsx` (`AppContainer`) provides `QueryClientProvider` with `queryClient` from storage.
  - Layout shell: `app/components/layout/AppLayout.tsx`
  - Top bar: `app/components/TopBar.tsx`
  - Left side: `app/components/left/LeftColumn.tsx`, `LeftHeader.tsx`, `Category.tsx`, `Task.tsx`
  - Right side: `app/components/right/RightColumn.tsx`, `RightHeader.tsx`, `TaskDetails.tsx`
- Drag-and-drop uses Atlassian Pragmatic DnD (`@atlaskit/pragmatic-drag-and-drop*`).
- Drag-and-drop abstractions are centralized in `app/components/DragDrop.tsx` via:
  - `DragDropList` (group-level wrapper + context)
  - `DragDropListItem` (draggable + drop target + edge indicator)
- Task move orchestration runs from `left/Category.tsx` (`onMoveItem`) and persists via `useMoveTaskMutation` in `app/lib/storage.ts`.
- App remains fully client-side (no API routes / no server persistence).

## Work Completed

- Replaced starter page with a single-page checklist app.
- Implemented Task Mode (default) + Edit Mode with mode-specific interactions.
- Added top-bar controls:
  - Mode toggle, Unhide All, Reset Completed
  - Search (case-insensitive on title/description, activates at 2+ chars)
  - Single Data dropdown for import/export definition/state
- Left pane behavior:
  - Category accordion list in both modes with per-category counts
  - Compact single-line task rows
  - In Task Mode, completed tasks strikethrough and hidden tasks annotated `(Hidden)`
  - In Task Mode, completion checkbox only appears when dependencies are complete
  - In Edit Mode, `Add Task` button appears at the bottom of each category
  - In Edit Mode, category-level `Up` / `Down` controls reorder categories
  - In Edit Mode, `Add Category` lives at the bottom of the category list
  - Category expand/collapse state is persisted per mode (`task` vs `edit`)
- Edit Mode workflows:
  - Select All / Clear Selection in left header
  - Delete All appears in top bar when multi-selection exists
  - Dependency-setting mode (`Set Dependencies` → select in list → `Confirm Dependencies`)
  - `Clear Dependencies` action for selected task
  - Task details no longer include editable category input (category change from details removed)
- Layout:
  - Full viewport split pane
  - Independent scrolling in both panes
  - Draggable desktop resize handle with width persisted in `localStorage`
- Hydration fix retained: no nested `<button>` structures in rows.

## Data Model & Storage

- IndexedDB schema is defined in `app/lib/storage.ts` (`ChekovDB`, `DB_VERSION = 3`).
- Canonical persisted model is normalized across object stores:
  - `tasks`: `{ id, title, description, category }`
  - `taskTags`: `Set<string>` by task id
  - `taskDependencies`: `Set<string>` by task id
  - `taskCompletion`: `true` by task id (presence = completed)
  - `taskHidden`: `true` by task id (presence = hidden)
  - `categories`: key `"categories"` → ordered `string[]`
  - `categoryTasks`: category → ordered task id `string[]`
  - `tagColors`: tag → color key
  - `categoryHidden`: mode (`task`/`edit`) → `Set<string>`
- React Query hooks in `storage.ts` are the data access layer; UI generally should not read/write IndexedDB directly.
- Task/category ordering is source-of-truth in `categories` and `categoryTasks` stores.

## Import/Export

- JSON schema is defined in `app/lib/export.ts` (`ExportedChecklistDefinition`, `ExportedChecklistState`, and related types).
- Definition and state are independently exportable/importable JSON files.
- Import/export normalization logic is centralized in `export.ts`:
  - `normalizeChecklistDefinition(...)`
  - `normalizeChecklistState(...)`
- Legacy concerns outside this schema are ignored.
  - Old ad-hoc payload shapes (for example legacy flat task payloads) are no longer migration targets unless explicitly added back to `export.ts`.

## Dependencies Added

- `@tanstack/react-query`
- `@atlaskit/pragmatic-drag-and-drop`
- `@atlaskit/pragmatic-drag-and-drop-hitbox`
- `@atlaskit/pragmatic-drag-and-drop-react-drop-indicator`
- `idb`
- `react-markdown`
- `remark-gfm`

## Notes for Future Agents

- The app is intentionally fully client-side with no server APIs.
- Avoid introducing backend persistence unless explicitly requested.
- Keep storage/query contracts in `storage.ts` and export/import schema contracts in `export.ts` aligned.
- Keep dependency cycle prevention enforced when changing dependency logic (`detectCycle` in `app/lib/utils.ts`).
- Preserve current interaction contracts:
  - Edit Mode checkboxes are for selection workflows, not completion toggling
  - Task completion toggles happen in Task Mode only
  - Dependency-setting mode intentionally repurposes list selection
  - Category expand/collapse state is persisted per mode in `categoryHidden`
- Preserve drag-reorder semantics:
  - Reorder/move tasks by updating `categoryTasks` arrays and task `category`
  - Keep `categories` order intact unless explicitly changing category-ordering behavior
- Current add flows:
  - Add category via left-pane bottom control (Edit Mode), not top bar
  - Add task via per-category control in category pane (Edit Mode)

## Mutation Behavior (important)

- `useDeleteTasksMutation` accepts `TaskId[]` and performs batch deletion in one transaction, including referential cleanup (dependencies, category cleanup, empty-category removal).
- `useMoveTaskMutation` resolves moved task from `fromCategory + fromIndex`; if source task is missing, it aborts transaction and returns without throwing.

## Quick File Map (handoff)

- Data/types: `app/lib/types.ts`
- Storage schema + query/mutation layer: `app/lib/storage.ts`
- JSON schema + import/export normalization: `app/lib/export.ts`
- Utility functions (including cycle detection): `app/lib/utils.ts`
- Drag/drop abstraction layer: `app/components/DragDrop.tsx`
- App orchestration/state: `app/page.tsx`
- Left list/task wiring: `app/components/left/LeftColumn.tsx`, `app/components/left/Category.tsx`, `app/components/left/Task.tsx`
- Right details rendering/editing: `app/components/right/TaskDetails.tsx`
