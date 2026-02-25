# AGENTS Metadata

## Project

- Name: Chekov
- Stack: Next.js (App Router), React, Tailwind CSS
- Storage: IndexedDB (in-browser, no backend), accessed via `idb`
- Data flow: `@tanstack/react-query` (queries + mutations over IndexedDB)

## Current Architecture (important)

- UI is componentized:
  - `app/page.tsx` (`AppMain`) owns primary app state (mode, selected task, edit selection, search, pane width, import/export handlers) and provides global set-edit context.
  - `app/page.tsx` (`AppContainer`) provides `QueryClientProvider` with `queryClient` from data.
  - Layout shell: `app/components/layout/AppLayout.tsx`
  - Top bar: `app/components/TopBar.tsx`
  - Left side: `app/components/left/LeftColumn.tsx`, `LeftHeader.tsx`, `Category.tsx`, `Task.tsx`
  - Right side: `app/components/right/RightColumn.tsx`, `RightHeader.tsx`, `TaskDetails.tsx`
- Set-edit workflow is centralized with React context in `app/lib/context.ts`:
  - `MultiSelectContext` carries selection mode, selected set, header text, and `onSetTasks` callback.
  - Dependency editing uses this same context-driven selection flow (not ad hoc per-pane booleans).
- Drag-and-drop uses Atlassian Pragmatic DnD (`@atlaskit/pragmatic-drag-and-drop*`).
- Drag-and-drop abstractions are centralized in `app/components/DragDrop.tsx` via:
  - `DragDropList` (group-level wrapper + context)
  - `DragDropListItem` (draggable + drop target + edge indicator)
- Left pane auto-scroll during drag uses `@atlaskit/pragmatic-drag-and-drop-auto-scroll` and targets the left list scroll container (`[data-left-pane-scroll='true']`).
- Task move orchestration runs from `left/Category.tsx` (`onMoveItem`) and persists via `useMoveTaskMutation` in `app/lib/data.ts`.
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
  - In Task Mode, categories with unmet category dependencies are not rendered
  - Left header is fixed while only the category/task list scrolls
  - In Edit Mode, `Add Task` button appears at the bottom of each category
  - In Edit Mode, category-level `Deps` / `Up` / `Down` controls are shown (`Deps` enters set-edit for category dependencies)
  - In Edit Mode, `Add Category` lives at the bottom of the category list
  - Category expand/collapse state is persisted per mode (`task` vs `edit`)
- Edit Mode workflows:
  - Select All / Clear Selection in left header
  - Delete All appears in top bar when multi-selection exists
  - Dependency-setting mode is context-based (`Set Dependencies` in details pane → select tasks in left list → confirm/cancel in fixed left header banner)
  - Category dependency-setting mode is context-based (`Deps` in category header → select tasks in left list → confirm/cancel in fixed left header banner)
  - Category `Deps` buttons are disabled while any set-edit workflow is active
  - `Clear Dependencies` action for selected task
  - Task details no longer include editable category input (category change from details removed)
- Warning tasks:
  - Tasks can be marked as `warning` in edit details
  - Warning tasks cannot be directly completed
  - Warning tasks are shown with distinct styling and treated as effectively complete when dependencies are complete
  - Warning tasks cannot be selected as dependencies in dependency-editing selection UX
- Layout:
  - Full viewport split pane
  - Independent scrolling in both panes
  - Draggable desktop resize handle with width persisted in `localStorage`
- Hydration fix retained: no nested `<button>` structures in rows.

## Data Model & Storage

- IndexedDB schema is defined in `app/lib/data.ts` (`ChekovDB`, `DB_VERSION = 5`).
- Canonical persisted model is normalized across object stores:
  - `tasks`: `{ id, title, description, category }`
  - `taskTags`: `Set<string>` by task id
  - `taskDependencies`: `Set<string>` by task id
  - `taskCompletion`: `true` by task id (presence = completed)
  - `taskWarnings`: `true` by task id (presence = warning)
  - `taskHidden`: `true` by task id (presence = hidden)
  - `categories`: key `"categories"` → ordered `string[]`
  - `categoryTasks`: category → ordered task id `string[]`
  - `categoryDependencies`: category → `Set<taskId>` (tasks that gate category visibility in Task Mode)
  - `categoryCollapsed`: mode (`task`/`edit`) → `Set<string>`
  - `tagColors`: tag → color key
- React Query hooks in `data.ts` are the data access layer; UI generally should not read/write IndexedDB directly.
- Task/category ordering is source-of-truth in `categories` and `categoryTasks` stores.
- Query return types were partially refactored from records to `Map`:
  - `useTagsQuery` → `Map<TaskId, Set<string>>`
  - `useDetailsQuery` → `Map<TaskId, StoredTask>`
  - `useDependenciesQuery` → `Map<TaskId, Set<string>>`
  - `useCategoriesTasksQuery` → `Map<string, string[]>`
  - `useCategoryDependenciesQuery` → `Map<string, Set<TaskId>>`
  - `useTagColorsQuery` → `Map<string, TagColorKey>`
  - `useWarningsQuery` → `Set<TaskId>`

## Import/Export

- JSON schema is defined in `app/lib/export.ts` (`ExportedChecklistDefinition`, `ExportedChecklistState`, and related types).
- Definition and state are independently exportable/importable JSON files.
- Import/export normalization logic is centralized in `export.ts`:
  - `normalizeChecklistDefinition(...)`
  - `normalizeChecklistState(...)`
- Exported task definition supports optional `type?: "task" | "warning"`; `"task"` is omitted on export.
- Exported task definition supports optional `description?: string`; empty descriptions are omitted on export for compactness.
- Import fills missing task descriptions as empty string when writing to IndexedDB.
- Export/import schema for warning tasks is unchanged (`type?: "task" | "warning"`), but persistence maps this to/from `taskWarnings` store instead of `tasks.type`.
- Exported definition supports optional `categoryDependencies?: Record<CategoryName, TaskId[]>`.
- Imports missing `categoryDependencies` are treated as empty (no category dependencies).
- Category dependency normalization drops dependency IDs that do not correspond to existing tasks.
- Normalization/import enforce warning constraints for dependencies and completion state.
- Legacy concerns outside this schema are ignored.
  - Old ad-hoc payload shapes (for example legacy flat task payloads) are no longer migration targets unless explicitly added back to `export.ts`.

## Dependencies Added

- `@tanstack/react-query`
- `@atlaskit/pragmatic-drag-and-drop`
- `@atlaskit/pragmatic-drag-and-drop-auto-scroll`
- `@atlaskit/pragmatic-drag-and-drop-hitbox`
- `@atlaskit/pragmatic-drag-and-drop-react-drop-indicator`
- `idb`
- `react-markdown`
- `remark-gfm`

## Notes for Future Agents

- The app is intentionally fully client-side with no server APIs.
- Avoid introducing backend persistence unless explicitly requested.
- Treat IndexedDB as the canonical, untainted source of truth on read paths; avoid defensive read-time filtering/checks in query logic when reading from DB stores.
- Place defensive validation/guardrails at mutation boundaries instead: UX actions that write data and import/export normalization in `app/lib/export.ts`.
- Keep storage/query contracts in `data.ts` and export/import schema contracts in `export.ts` aligned.
- Keep dependency cycle prevention enforced when changing dependency logic (`detectCycle` in `app/lib/utils.ts`).
- Preserve current interaction contracts:
  - Edit Mode checkboxes are for selection workflows, not completion toggling
  - Task completion toggles happen in Task Mode only
  - Task and category dependency-setting both use global set-edit context and confirm from the fixed left header banner
  - Category expand/collapse state is persisted per mode in `categoryCollapsed`
  - In Task Mode, categories with unmet category dependencies are not rendered
  - Warning state should be read from warning queries/store (`useTaskWarningQuery` / `useWarningsQuery`), not from `StoredTask`
- Preserve drag-reorder semantics:
  - Reorder/move tasks by updating `categoryTasks` arrays and task `category`
  - Keep `categories` order intact unless explicitly changing category-ordering behavior
- Current add flows:
  - Add category via left-pane bottom control (Edit Mode), not top bar
  - Add task via per-category control in category pane (Edit Mode)

## Mutation Behavior (important)

- `useDeleteTasksMutation` accepts `TaskId[]` and performs batch deletion in one transaction, including referential cleanup (dependencies, category cleanup, empty-category removal).
- `useMoveTaskMutation` resolves moved task from `fromCategory + fromIndex`; if source task is missing, it aborts transaction and returns without throwing.
- `useTaskDependenciesMutation` performs cycle detection using `detectCycle` and throws when a cycle would be created.
- `useCategoryDependenciesMutation` writes/deletes per-category dependency sets and updates both per-category and aggregate category-dependency caches.
- `useTaskDetailMutation` updates title/description only.
- `useTaskWarningMutation` sets/clears warning status in `taskWarnings`; setting warning removes completion + incoming dependency references in one transaction.
- `useTaskCompletionMutation` updates task completion and also adds the category to collapsed task categories when all tasks in the category are complete.

## Quick File Map (handoff)

- Data/types: `app/lib/types.ts`
- Shared context state: `app/lib/context.ts`
- Storage schema + query/mutation layer: `app/lib/data.ts`
- JSON schema + import/export normalization: `app/lib/export.ts`
- Utility functions (including cycle detection): `app/lib/utils.ts`
- Drag/drop abstraction layer: `app/components/DragDrop.tsx`
- App orchestration/state: `app/page.tsx`
- Left list/task wiring: `app/components/left/LeftColumn.tsx`, `app/components/left/Category.tsx`, `app/components/left/Task.tsx`
- Right details rendering/editing: `app/components/right/TaskDetails.tsx`
