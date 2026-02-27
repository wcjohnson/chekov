import type { TagColorKey } from "../tagColors";
import type { TaskId, CategoryName, BooleanExpression } from "./types";

/**
 * Serialized task definition used in checklist definition import/export payloads.
 *
 * This shape supports both current fields (`openers`/`closers`) and legacy
 * compatibility fields (`dependencies`/`dependencyExpression`, `type: "warning"`).
 */
export type ExportedTaskDefinition = {
  /**
   * Stable task identifier.
   */
  id: TaskId;

  /**
   * Category that owns this task.
   */
  category: CategoryName;

  /**
   * Human-readable task title.
   */
  title: string;

  /**
   * Optional markdown description.
   *
   * When omitted on import, runtime normalization persists this as an empty string.
   */
  description?: string;

  /**
   * Optional task type discriminator.
   *
   * - `"task"`: regular task
   * - `"reminder"`: reminder task
   * - `"warning"`: LEGACY alias of `"reminder"` kept for backward compatibility
   */
  type?: "task" | "warning" | "reminder";

  /**
   * LEGACY opener task list.
   *
   * This exists for backward compatibility with older payloads and is mapped to
   * `openers.tasks` during normalization/import.
   */
  dependencies?: TaskId[];

  /**
   * LEGACY opener boolean expression.
   *
   * This exists for backward compatibility with older payloads and is mapped to
   * `openers.expression` during normalization/import.
   */
  dependencyExpression?: BooleanExpression;

  /**
   * Optional free-form task tags.
   */
  tags?: string[];

  /**
   * Current opener definition for task visibility/availability semantics.
   */
  openers?: ExportedDependencyExpression;

  /**
   * Current closer definition for effective-completion semantics.
   */
  closers?: ExportedDependencyExpression;
};

/**
 * Serialized checklist definition payload used for definition import/export.
 */
export type ExportedChecklistDefinition = {
  /**
   * Ordered category list that defines checklist category order.
   */
  categories: CategoryName[];

  /**
   * Tasks grouped by category in display/order sequence.
   */
  tasksByCategory: Record<CategoryName, ExportedTaskDefinition[]>;

  /**
   * Optional tag color assignments keyed by tag text.
   */
  tagColors: Record<string, TagColorKey>;

  /**
   * Optional per-category task dependencies that gate category visibility in Task Mode.
   */
  categoryDependencies?: Record<CategoryName, TaskId[]>;
};

/**
 * Serialized per-task state values for checklist state import/export.
 */
export type ExportedChecklistTaskState = {
  /**
   * Whether the task is explicitly completed in persisted state.
   */
  completed: boolean;

  /**
   * Whether the task is explicitly hidden in persisted state.
   */
  explicitlyHidden: boolean;
};

/**
 * Serialized category visibility state partitioned by app mode.
 */
export type ExportedChecklistCategoryVisibilityByMode = {
  /**
   * Task-mode category visibility map keyed by category.
   */
  task: Record<CategoryName, boolean>;

  /**
   * Edit-mode category visibility map keyed by category.
   */
  edit: Record<CategoryName, boolean>;
};

/**
 * Serialized checklist state payload used for state import/export.
 */
export type ExportedChecklistState = {
  /**
   * Per-task exported state keyed by task id.
   */
  tasks: Record<TaskId, ExportedChecklistTaskState>;

  /**
   * Per-mode category visibility state.
   */
  categoryVisibilityByMode: ExportedChecklistCategoryVisibilityByMode;
};

/**
 * Serialized dependency expression for opener/closer definitions.
 */
export type ExportedDependencyExpression = {
  /**
   * Task ids referenced by this dependency expression.
   */
  tasks: TaskId[];

  /**
   * Optional boolean expression over `tasks`.
   *
   * When omitted, semantics are implicit-AND across all `tasks`.
   */
  expression?: BooleanExpression;
};
