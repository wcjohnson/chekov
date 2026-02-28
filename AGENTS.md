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
  - Right side: `app/components/right/RightColumn.tsx`, `RightHeader.tsx`, `TaskDetails.tsx`, `DependencyExpressionEditor.tsx`
  - Expression editor: `app/components/ExpressionEditor.tsx` (drag/drop palette + expression tree editor)
- Derived data hooks are centralized in `app/lib/data/derivedData.ts`:
  - `useTaskStructure`
  - `useTaskCategoryById`
  - `useOpenTasks`
  - `useTasksMatchingSearch`
  - `useTaskBreakout`
  - `useEffectiveCompletions`
- Set-edit workflow is centralized in `app/lib/context.ts`:
  - `MultiSelectContext` selection contexts: `generic`, `openers`, `closers`, `categoryDependencies`.
  - Shared helpers: `isActive(type?)`, `getSelection()`, `setTaskSelected(...)`, `selectAll()`, `clearSelection()`, and `close()`.
  - `MultiSelectState` supports `disablePrimarySelection?: boolean` for set-edit workflows that must lock primary task selection.
  - Openers/closers/category-dependency workflows all use this shared context flow.
- Drag-and-drop uses Atlassian Pragmatic DnD (`@atlaskit/pragmatic-drag-and-drop*`).
- Drag-and-drop abstractions are centralized in `app/components/DragDrop.tsx` via:
  - `DragDropReorderableGroup` (group-level wrapper + context)
  - `DragDropReorderable` (draggable + drop target + edge indicator)
  - `DragDropSource` / `DragDropTarget` also power expression-editor palette/slot interactions
  - `DragDropTarget` uses `onDropDragData` for custom drag payload handling
- Left pane auto-scroll during drag uses `@atlaskit/pragmatic-drag-and-drop-auto-scroll` and targets `[data-left-pane-scroll='true']`.
- Left pane mode-switch behavior centers the currently selected task in view when switching Task/Edit mode and that task is visible.
- Task move orchestration runs from `left/Category.tsx` (`onMoveItem`) and persists via `useMoveTaskMutation`.
- App remains fully client-side (no API routes / no server persistence).

## Work Completed

- Replaced starter page with a single-page checklist app.
- Implemented Task Mode (default) + Edit Mode with mode-specific interactions.
- Added top-bar controls:
  - Mode toggle, Unhide All, Reset Completed
  - `Show Completed` / `Hide Completed` toggle in Task Mode
  - Search (case-insensitive on category/title/description/tags; active when query length > 2)
  - Single Data dropdown for import/export definition/state and `Clear DB`
  - `Clear DB` is confirmation-gated via Alert
- Left pane behavior:
  - Category accordion list in both modes with per-category counts
  - Compact single-line task rows
  - In Task Mode, categories with unmet category dependencies are not rendered
  - In Task Mode, completed tasks use strikethrough based on effective completion
  - In Task Mode, hidden tasks are annotated `(Hidden)`
  - In Task Mode, completion checkbox only appears when openers are complete and task is not a reminder
  - Task-mode checkbox is checked from effective completion; implicit-only completions render checked + disabled
  - Reminder visibility in Task Mode requires complete openers
  - Left header is fixed while only the category/task list scrolls
  - In Edit Mode, `Add Task` appears per category and `Add Category` appears at list bottom
  - In Edit Mode, category-level `Deps` + drag-handle controls are shown (`Deps` enters set-edit for category dependencies)
  - Category expand/collapse state is persisted per mode (`task` vs `edit`)
  - Floating multiselect controls are overlaid in header space to avoid covering top list rows
- Edit Mode task workflows:
  - Generic multiselect launched from left header via `Multiselect`
  - Generic multiselect header supports Select All / Clear Selection / Delete Selected / Cancel
  - Task details support both `Openers` and `Closers` editing with parallel controls:
    - `Set Openers` / `Set Closers` via set-edit workflow
    - `Clear Openers` / `Clear Closers`
    - `Apply Openers` / `Apply Closers` from active generic multiselect
    - `Edit Expression` for both openers and closers
  - Category dependency-setting uses context-based selection and confirmation from floating left header controls
  - Category dependency set-edit panel renders current dependencies as infix expression preview
  - Category `Deps` buttons are disabled while any set-edit workflow is active
  - Task details no longer include editable category input
- Openers/Closers expression authoring:
  - Openers/closers expression persistence is per task in `taskDependencies`
  - Expression editor is drag/drop only (no text parser entry)
  - Palette and drop-slot UI is colorized by role (operators, primitives, add-slot)
  - Expression nodes include remove affordances (`×`) for subtree deletion
  - Persistence normalization omits redundant implicit-AND expressions
- Openers/Closers expression display:
  - Openers and closers render as infix boolean expressions in both modes
  - Parentheses are shown only when required by precedence
  - Operators render as all-caps (`AND`/`OR`/`NOT`) via Catalyst `Badge` with distinct per-operator colors
  - In expression display, completion strikethrough applies in Task Mode only
- Reminder tasks:
  - Tasks can be marked `reminder` in edit details
  - Reminder tasks cannot be completed directly
  - Reminder status persists in `taskWarnings`
  - Reminders participate in opener/closer graphs and opener/closer selection
- Add-task UX:
  - Creating a new task in Edit Mode auto-selects it and focuses the Title input
  - Selection callback naming is request-oriented (`onRequestTaskSelectionChange`)
- Refactors:
  - Left-pane visibility derivation moved from `LeftColumn` local memo into shared hook `useTaskBreakout`
  - Left-pane naming aligned around `openTasks` (instead of older dependency-complete aliases)
- Layout:
  - Full viewport split pane
  - Independent scrolling in both panes
  - Draggable desktop resize handle with width persisted in `localStorage`
  - Catalyst layout migration: `StackedLayout` shell + `Navbar` top bar + Catalyst dropdowns/alerts/badges
- Hydration safety retained: no nested `<button>` structures in rows.

- Tags and colors:
  - Task-list and task-details tag pills use Catalyst `Badge`
  - Tag color picker uses Catalyst `Dropdown` with swatch `data-slot="icon"` and `DropdownLabel`
  - `zinc` is an explicit option (`Gray` label), and missing stored color implies `zinc`
  - Persistence/import normalization omits default `zinc` storage

- Definition bootstrap:
  - `?def=<url>` startup definition import is supported
  - Non-empty existing definitions require overwrite confirmation before URL import

## Data Model & Storage

- IndexedDB schema is defined in `app/lib/data/store.ts` (`ChekovDB`, `DB_VERSION = 8`).
- Upgrade strategy currently recreates object stores (no incremental migration history).
- Canonical persisted model across object stores:
  - `tasks`: `{ id, title, description, category }`
  - `taskTags`: `Set<string>` by task id
  - `taskDependencies`: `TaskDependencies` by task id:
    - `{ openers?: DependencyExpression, closers?: DependencyExpression }`
    - each `DependencyExpression`: `{ taskSet: Set<TaskId>, expression?: BooleanExpression }`
    - store entry absent = no openers/closers
    - missing `expression` = implicit AND over `taskSet`
  - `taskCompletion`: `true` by task id (presence = explicitly completed)
  - `taskWarnings`: `true` by task id (presence = reminder)
  - `taskHidden`: `true` by task id (presence = explicitly hidden)
  - `categories`: key `"categories"` → ordered `string[]`
  - `categoryTasks`: category → ordered task id `string[]`
  - `categoryDependencies`: category → `Set<TaskId>` (gates category visibility in Task Mode)
  - `categoryCollapsed`: mode (`task`/`edit`) → `Set<string>`
  - `tagColors`: tag → color key
- React Query hooks in `app/lib/data/queries.ts` and `app/lib/data/mutations.ts` are the data access layer; UI should avoid direct IndexedDB reads/writes.
- Task/category ordering source of truth remains `categories` + `categoryTasks` stores.
- Query return types are `Map`/`Set` based where appropriate:
  - `useTaskSetQuery` → `Set<TaskId>`
  - `useCategoriesQuery` → `CategoryName[]`
  - `useCategoriesTasksQuery` → `Map<CategoryName, TaskId[]>`
  - `useCategoryDependenciesQuery` → `Map<CategoryName, Set<TaskId>>`
  - `useDependenciesQuery` → `Map<TaskId, TaskDependencies>`
  - `useCompletionsQuery` → `Set<TaskId>`
  - `useRemindersQuery` → `Set<TaskId>`
  - `useDetailsQuery` → `Map<TaskId, TaskDetail>`
  - `useTagsQuery` → `Map<TaskId, Set<string>>`
  - `useTagColorsQuery` → `Map<string, TagColorKey>`
  - `useTaskDependenciesQuery(taskId)` → `TaskDependencies | null` (`null` sentinel for missing)
- Shared boolean-expression logic is centralized in `app/lib/booleanExpression.ts`:
  - `normalizeBooleanExpression(...)`
  - `normalizeDependencyExpression(...)`
  - `buildImplicitAndExpression(...)`
  - `evaluateBooleanExpression(...)`
  - `getInfixExpressionPrecedence(...)`

## Openers/Closers Semantics

- Openers govern task availability/visibility in Task Mode.
  - `useOpenTasks(...)` evaluates opener expression when present; otherwise uses implicit-AND over opener task set.
- Closers govern effective completion via recursive dependency evaluation.
  - `useEffectiveCompletions(...)` combines explicit completion with closer-derived completion.
  - Recursion uses active-evaluation + memoized closer results to avoid infinite loops.
- Cycle prevention is enforced on writes in `useTaskDependenciesMutation` independently for opener and closer graphs via `detectCycle`.
- `detectCycle(...)` returns the concrete cycle path (`TaskId[]`) when a cycle is detected.
- `useTaskDependenciesMutation` throws `DependencyCycleError` (includes cycle path and dependency kind).
- Dependency-edit UI catches `DependencyCycleError` and toasts the dependency chain using task titles.

## Import/Export

- JSON schema types are in `app/lib/data/jsonSchema.ts`.
- Import/export implementation is in `app/lib/data/export.ts`.
- Definition and state are independently exportable/importable JSON files.
- Definition normalization/import supports:
  - Current opener/closer shape: `openers`, `closers` (`tasks` + optional `expression`)
  - Legacy opener fields: `dependencies` + `dependencyExpression` (mapped to openers)
  - Reminder aliases: legacy `warning` and current `reminder`
  - Category dependency cleanup against known task ids
  - Tag-color cleanup against tags still in use
  - Tag-color canonicalization that omits implied-default `zinc` values
- Export behavior:
  - Omits empty descriptions for compactness
  - Omits `type: "task"`; emits `type: "reminder"` for reminders
  - Emits openers/closers only when non-empty
- Import behavior:
  - Missing descriptions are persisted as empty strings
  - Reminder tasks persist via `taskWarnings`
  - State import does not mark reminder tasks completed directly

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
- Test environment uses `jsdom` + `fake-indexeddb` so data/import/export logic can be unit tested without a browser.
- `tests/setup.ts` is the shared setup file for browser/indexeddb shims.
- Boolean-expression tests live in `tests/utils/`:
  - `booleanExpressionEvaluator.test.ts`
  - `booleanExpression.test.ts`
- Any data-model change must include corresponding tests and run full suite before handoff.
- Purely UX-only updates that do not alter data behavior do not require running unit tests.

## Notes for Future Agents

- Policy: non-trivial code changes should include very brief, preferably single-line, comments beginning with "AGENT:" to inform the code was written by an agent. The comment should briefly describe what the agent was asked to do and briefly describe the logic of the new or changed code.
- The app is intentionally fully client-side with no server APIs.
- Avoid introducing backend persistence unless explicitly requested.
- Treat IndexedDB as canonical source of truth on reads; prefer write-time normalization/guardrails in mutations and import normalization.
- Keep data contracts aligned across:
  - `app/lib/data/store.ts`
  - `app/lib/data/queries.ts`
  - `app/lib/data/mutations.ts`
  - `app/lib/data/derivedData.ts`
  - `app/lib/data/export.ts`
  - `app/lib/data/jsonSchema.ts`
- Keep shared expression logic in `app/lib/booleanExpression.ts`; avoid duplicating precedence/normalization/evaluation logic in components.
- Preserve interaction contracts:
  - Edit Mode checkboxes are selection controls, not completion toggles
  - Task completion toggles occur in Task Mode only
  - In Edit Mode, primary task selection remains available while multiselect is active
  - Openers/closers/category-dependency set-edit flows confirm from floating left-header controls
  - Category collapse state is persisted per mode in `categoryCollapsed`
  - In Task Mode, categories with unmet category dependencies are not rendered
  - Reminder status should be read from reminder queries/store (`useTaskReminderQuery` / `useRemindersQuery`)
  - Expression editor is opt-in via `Edit Expression` and starts closed by default on task selection
  - Generic/openers/closers/category-dependency selection flows should use `MultiSelectContext`
  - Category dependency set-edit panel should show current dependencies using `DependencyExpressionView`
  - Keep stable persisted-header callbacks (for example `selectAll`) via shared `useStableCallback`
- Preserve drag-reorder semantics:
  - Reorder/move tasks by updating `categoryTasks` arrays and task `category`
  - Keep `categories` order intact unless category-ordering behavior is explicitly changed
- Current add flows:
  - Add category via left-pane bottom control (Edit Mode)
  - Add task via per-category control (Edit Mode)

## Mutation Behavior (important)

- `useDeleteTasksMutation` accepts `TaskId[]` and performs batch deletion in one transaction, including referential cleanup:
  - removes deleted task ids from opener/closer `taskSet`s
  - removes dependency rows that become empty
  - removes empty categories
- `useMoveTaskMutation` resolves moved task from `fromCategory + fromIndex`; if source task is missing, transaction aborts and returns without throwing.
- `useTaskDependenciesMutation` accepts `{ taskId, taskDependencies }`, normalizes persisted expressions, detects opener/closer cycles, and throws on cycle.
  - Cycle errors are thrown as `DependencyCycleError` with `cycle: TaskId[]` and `dependencyKind`.
- `useCategoryDependenciesMutation` writes/deletes per-category dependency sets and updates per-category + aggregate dependency caches.
- `useTaskDetailMutation` updates title/description only.
- `useTaskReminderMutation` sets/clears reminder status in `taskWarnings`; setting reminder also clears explicit completion in one transaction.
- `useTaskCompletionMutation` updates explicit completion and auto-adds category to collapsed task categories when every task in that category is either explicitly completed or a reminder.

## Quick File Map (handoff)

- Data/types: `app/lib/data/types.ts`
- Shared context state: `app/lib/context.ts`
- Storage schema + query client: `app/lib/data/store.ts`
- Query hooks: `app/lib/data/queries.ts`
- Mutation hooks: `app/lib/data/mutations.ts`
- Derived data hooks: `app/lib/data/derivedData.ts`
- JSON schema types: `app/lib/data/jsonSchema.ts`
- Import/export normalization + IO: `app/lib/data/export.ts`
- Shared boolean-expression helpers: `app/lib/booleanExpression.ts`
- Utility functions (including cycle detection): `app/lib/utils.ts`
- Drag/drop abstraction layer: `app/components/DragDrop.tsx`
- Expression editor UI: `app/components/ExpressionEditor.tsx`
- Dependency expression wrapper UI: `app/components/right/DependencyExpressionEditor.tsx`
- App orchestration/state: `app/page.tsx`
- Left list/task wiring: `app/components/left/LeftColumn.tsx`, `app/components/left/Category.tsx`, `app/components/left/Task.tsx`
- Right details rendering/editing: `app/components/right/TaskDetails.tsx`
