# AGENTS Metadata

## Project

- Name: Chekov
- Stack: Next.js (App Router), React, Tailwind CSS
- Storage: IndexedDB (in-browser, no backend), accessed via `idb`
- Data flow: `@tanstack/react-query` (queries + mutations over IndexedDB)

## Current Architecture (important)

- UI is componentized:
  - `app/page.tsx` (`AppMain`) owns primary app state (mode, selected task, multiselect state, search, pane width, import/export handlers) and provides global set-edit context.
  - `app/page.tsx` (`AppContainer`) provides `QueryClientProvider` with `queryClient` from data.
  - Layout shell: `app/components/layout/AppLayout.tsx`
  - Top bar: `app/components/TopBar.tsx`
  - Left side: `app/components/left/LeftColumn.tsx`, `LeftHeader.tsx`, `Category.tsx`, `Task.tsx`
  - Right side: `app/components/right/RightColumn.tsx`, `RightHeader.tsx`, `TaskDetails.tsx`
  - Dependency expression editor: `app/components/ExpressionEditor.tsx` (drag/drop palette + expression tree editor)
- Set-edit workflow is centralized with React context in `app/lib/context.ts`:
  - `MultiSelectContext` carries typed selection context (`generic`/`dependencies`/`categoryDependencies`), selected set, optional task filter, and custom header renderer.
  - `MultiSelectContext` exposes helpers: `isActive(type?)`, `getSelection()`, `setTaskSelected(...)`, `selectAll()`, `clearSelection()`, and `close()`.
  - Dependency editing uses this same context-driven selection flow (not ad hoc per-pane booleans).
- Drag-and-drop uses Atlassian Pragmatic DnD (`@atlaskit/pragmatic-drag-and-drop*`).
- Drag-and-drop abstractions are centralized in `app/components/DragDrop.tsx` via:
  - `DragDropReorderableGroup` (group-level wrapper + context)
  - `DragDropReorderable` (draggable + drop target + edge indicator)
  - `DragDropSource` / `DragDropTarget` are also used by `ExpressionEditor` for palette and expression-slot interactions
  - `DragDropTarget` uses `onDropDragData` for custom drop payload handling (avoid using `onDrop` prop name for custom drag data)
- Left pane auto-scroll during drag uses `@atlaskit/pragmatic-drag-and-drop-auto-scroll` and targets the left list scroll container (`[data-left-pane-scroll='true']`).
- Task move orchestration runs from `left/Category.tsx` (`onMoveItem`) and persists via `useMoveTaskMutation` in `app/lib/data/mutations.ts`.
- App remains fully client-side (no API routes / no server persistence).

## Work Completed

- Replaced starter page with a single-page checklist app.
- Implemented Task Mode (default) + Edit Mode with mode-specific interactions.
- Added top-bar controls:
  - Mode toggle, Unhide All, Reset Completed
  - `Show Completed` / `Hide Completed` toggle in Task Mode
  - Search (case-insensitive on category/title/description/tags, activates at 2+ chars)
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
  - Generic multiselect is launched from left header via `Multiselect`
  - Generic multiselect header provides Select All / Clear Selection / Delete Selected / Cancel
  - Dependency-setting mode is context-based (`Set Dependencies` in details pane → select tasks in left list → confirm/cancel in fixed left header banner)
  - Category dependency-setting mode is context-based (`Deps` in category header → select tasks in left list → confirm/cancel in fixed left header banner)
  - Category `Deps` buttons are disabled while any set-edit workflow is active
  - `Clear Dependencies` action for selected task
  - `Apply Dependencies` appears in task details during active generic multiselect and applies current generic selection to the selected task
  - `Edit Expression` button adjacent to dependency controls opens expression editor on demand; while open, the button is disabled and editor stays open until details-panel navigation
  - Task details no longer include editable category input (category change from details removed)
- Dependency expression authoring:
  - Expression persistence is separate from task details and stored per task
  - Visual editor is drag/drop only (no text parser entry)
  - Palette and drop-slot UI is colorized by role (operators, primitives, add-slot)
  - Expression nodes include remove affordances (`×`) for subtree deletion
  - `Clear Expression` clears draft and persists `null` expression (implicit AND fallback); expression actions disable when the draft is empty
- Dependency expression display:
  - Dependencies in task details (both Task Mode and Edit Mode) render as infix boolean expressions, not unordered lists
  - Parentheses are only shown where required by precedence
  - Operators render as all-caps (`AND`/`OR`/`NOT`) with distinct text styling
  - In dependency detail display, completion strikethrough applies in Task Mode only (not Edit Mode)
- Reminder tasks:
  - Tasks can be marked as `reminder` in edit details
  - Reminder tasks cannot be directly completed
  - Reminder tasks are shown with distinct styling and treated as effectively complete when dependencies are complete
  - Reminder tasks can be selected as dependencies; dependent tasks resolve through reminder completion transitively
- Layout:
  - Full viewport split pane
  - Independent scrolling in both panes
  - Draggable desktop resize handle with width persisted in `localStorage`
- Hydration fix retained: no nested `<button>` structures in rows.

## Data Model & Storage

- IndexedDB schema is defined in `app/lib/data/store.ts` (`ChekovDB`, `DB_VERSION = 7`).
- Canonical persisted model is normalized across object stores:
  - `tasks`: `{ id, title, description, category }`
  - `taskTags`: `Set<string>` by task id
  - `taskDependencies`: `DependencyExpression` by task id (`{ taskSet, expression? }`; store entry absent = no dependencies, missing `expression` = implicit AND)
  - `taskCompletion`: `true` by task id (presence = completed)
  - `taskWarnings`: `true` by task id (presence = reminder; legacy store key name retained)
  - `taskHidden`: `true` by task id (presence = hidden)
  - `categories`: key `"categories"` → ordered `string[]`
  - `categoryTasks`: category → ordered task id `string[]`
  - `categoryDependencies`: category → `Set<taskId>` (tasks that gate category visibility in Task Mode)
  - `categoryCollapsed`: mode (`task`/`edit`) → `Set<string>`
  - `tagColors`: tag → color key
- React Query hooks in `app/lib/data/queries.ts` and `app/lib/data/mutations.ts` are the data access layer; UI generally should not read/write IndexedDB directly.
- Task/category ordering is source-of-truth in `categories` and `categoryTasks` stores.
- Query return types were partially refactored from records to `Map`:
- Query return types are `Map`/`Set` based where appropriate:
- `useTagsQuery` → `Map<TaskId, Set<string>>`
- `useDetailsQuery` → `Map<TaskId, StoredTask>`
- `useDependenciesQuery` → `Map<TaskId, DependencyExpression>`
- `useCategoriesTasksQuery` → `Map<string, string[]>`
- `useCategoryDependenciesQuery` → `Map<string, Set<TaskId>>`
- `useTagColorsQuery` → `Map<string, TagColorKey>`
- `useRemindersQuery` → `Set<TaskId>`
- `useTaskDependencyExpressionQuery` → `BooleanExpression | null` (`null` sentinel for missing)
- Shared boolean-expression logic is centralized in `app/lib/booleanExpression.ts`:
  - `evaluateBooleanExpression(...)`
  - `normalizeExpressionToDependencies(...)`
  - `buildImplicitAndExpression(...)`
  - `getExpressionPrecedence(...)`

## Import/Export

- JSON schema is defined in `app/lib/export.ts` (`ExportedChecklistDefinition`, `ExportedChecklistState`, and related types).
- Definition and state are independently exportable/importable JSON files.
- Import/export normalization logic is centralized in `export.ts`:
  - `normalizeChecklistDefinition(...)`
  - `normalizeChecklistState(...)`
- Exported task definition supports optional `type?: "task" | "reminder" | "warning"`; `"task"` is omitted on export.
- Exported task definition supports optional `description?: string`; empty descriptions are omitted on export for compactness.
- Import fills missing task descriptions as empty string when writing to IndexedDB.
- Export/import schema supports both legacy and current reminder types:
  - Exports emit `type?: "reminder"` for reminder tasks (and omit `"task"`).
  - Normalization/import accepts legacy `type?: "warning"` and treats it as reminder.
  - Persistence maps reminder status to/from `taskWarnings` store instead of `tasks.type`.
- Exported definition supports optional `categoryDependencies?: Record<CategoryName, TaskId[]>`.
- Imports missing `categoryDependencies` are treated as empty (no category dependencies).
- Category dependency normalization drops dependency IDs that do not correspond to existing tasks.
- Normalization/import enforce reminder completion-state constraints.
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
- `vitest`
- `jsdom`
- `fake-indexeddb`

## Testing

- Test files live under `tests/`.
- Run tests with:
  - `npm test` (single run)
  - `npm run test:watch` (watch mode)
- Test environment is configured for browser-like behavior (`jsdom`) and IndexedDB simulation (`fake-indexeddb`) so data-layer and import/export logic can be unit tested without a real browser.
- `tests/setup.ts` is the shared setup file and is the right place for test-wide browser/indexeddb shims.
- Start new coverage by adding `*.test.ts` files in `tests/` (for example `tests/data/*.test.ts` or `tests/export/*.test.ts`).
- Boolean-expression utility tests live in `tests/utils/`:
  - `booleanExpressionEvaluator.test.ts` (evaluation semantics)
  - `booleanExpression.test.ts` (precedence, normalization, implicit-AND construction)
- Any change to the data model must be accompanied by corresponding unit tests for data, referential integrity, and import/export.
- Any change to the data model (stores, query/mutation behavior, import/export normalization, or dependency/completion semantics) must run the full test suite before handoff.
- Any change to the data model must audit query return sentinels in `app/lib/data/queries.ts` so query functions never return `undefined` for missing records (use explicit `null` / empty collections / booleans as appropriate).
- Purely UX-only updates that do not affect data model behavior do not require running unit tests.

## Notes for Future Agents

- The app is intentionally fully client-side with no server APIs.
- Avoid introducing backend persistence unless explicitly requested.
- Treat IndexedDB as the canonical, untainted source of truth on read paths; avoid defensive read-time filtering/checks in query logic when reading from DB stores.
- Place defensive validation/guardrails at mutation boundaries instead: UX actions that write data and import/export normalization in `app/lib/export.ts`.
- Run `npm test` for every data-model-affecting change, especially changes in `app/lib/data/store.ts`, `app/lib/data/queries.ts`, `app/lib/data/mutations.ts`, and `app/lib/export.ts`; do not run unit tests for purely UX-only changes.
- Keep data contracts aligned across `app/lib/data/store.ts`, `app/lib/data/queries.ts`, `app/lib/data/mutations.ts`, `app/lib/data/derivedData.ts`, and `app/lib/export.ts`.
- Keep shared boolean-expression logic in `app/lib/booleanExpression.ts`; avoid duplicating precedence/normalization/evaluation helpers in UI components.
- Keep dependency cycle prevention enforced when changing dependency logic (`detectCycle` in `app/lib/utils.ts`).
- Preserve current interaction contracts:
  - Edit Mode checkboxes are for selection workflows, not completion toggling
  - Task completion toggles happen in Task Mode only
  - In Edit Mode, primary task selection remains available even while multiselect is active
  - Task and category dependency-setting both use global set-edit context and confirm from the fixed left header banner
  - Category expand/collapse state is persisted per mode in `categoryCollapsed`
  - In Task Mode, categories with unmet category dependencies are not rendered
  - Reminder state should be read from reminder queries/store (`useTaskReminderQuery` / `useRemindersQuery`), not from `StoredTask`
  - Dependency display in `TaskDetails` is infix-expression based (not list based), with Task-Mode-only strikethrough semantics for completed dependency terms
  - Expression editor is opt-in via `Edit Expression` and starts closed by default when selecting a task
  - Generic, dependency, and category-dependency selection flows should all use `MultiSelectContext` (not separate per-feature selection state)
  - Keep stable event handlers for persisted custom-header actions (for example `selectAll`) via shared `useStableCallback` in `app/lib/utils.ts`
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
- `useTaskDependencyExpressionMutation` stores custom expressions inside `taskDependencies` values (`DependencyExpression.expression`); it omits `expression` for `null` or implicit-AND-equivalent expressions.
- `useCategoryDependenciesMutation` writes/deletes per-category dependency sets and updates both per-category and aggregate category-dependency caches.
- `useTaskDetailMutation` updates title/description only.
- `useTaskReminderMutation` sets/clears reminder status in `taskWarnings`; setting reminder removes completion in one transaction.
- `useTaskCompletionMutation` updates task completion and also adds the category to collapsed task categories when all tasks in the category are complete.

## Quick File Map (handoff)

- Data/types: `app/lib/data/types.ts`
- Shared context state: `app/lib/context.ts`
- Storage schema + query client: `app/lib/data/store.ts`
- Query hooks: `app/lib/data/queries.ts`
- Mutation hooks: `app/lib/data/mutations.ts`
- Derived data hooks: `app/lib/data/derivedData.ts`
- Shared boolean-expression helpers: `app/lib/booleanExpression.ts`
- JSON schema + import/export normalization: `app/lib/export.ts`
- Utility functions (including cycle detection): `app/lib/utils.ts`
- Drag/drop abstraction layer: `app/components/DragDrop.tsx`
- Dependency expression editor UI: `app/components/ExpressionEditor.tsx`
- App orchestration/state: `app/page.tsx`
- Left list/task wiring: `app/components/left/LeftColumn.tsx`, `app/components/left/Category.tsx`, `app/components/left/Task.tsx`
- Right details rendering/editing: `app/components/right/TaskDetails.tsx`
