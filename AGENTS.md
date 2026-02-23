# AGENTS Metadata

## Project
- Name: Chekov
- Stack: Next.js (App Router), React, Tailwind CSS
- Storage: IndexedDB (in-browser, no backend)

## Work Completed
- Replaced starter page with a single-page checklist app UI in `app/page.tsx`.
- Implemented two UI modes:
  - Task Mode (default): shows only tasks that are incomplete, not explicitly hidden, and dependency-valid.
  - Edit Mode: shows all tasks and allows editing full task details.
- Added top bar with Chekov branding and toolbar actions for:
  - Mode switching
  - Add/Delete task (Edit Mode)
  - Export/Import checklist definition JSON
  - Export/Import checklist state JSON
- Added task detail panel with:
  - Read-only markdown render in Task Mode
  - Editable title, category, order, completed, hidden, dependencies, description in Edit Mode
- Added dependency validation to prevent circular dependencies.

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
- `idb`
- `react-markdown`
- `remark-gfm`

## Notes for Future Agents
- The app is intentionally fully client-side with no server APIs.
- Avoid introducing backend persistence unless explicitly requested.
- Maintain the separation between definition and state objects.
- Keep cycle prevention enforced when changing dependencies.
