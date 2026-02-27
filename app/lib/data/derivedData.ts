// Hooks that derive memoized data from React Queries.

import {
  useCategoriesQuery,
  useCategoriesTasksQuery,
  useCategoryDependenciesQuery,
  useDetailsQuery,
  useTagsQuery,
  useTaskHiddensQuery,
  useTaskSetQuery,
} from "@/app/lib/data/queries";
import { useMemo } from "react";
import {
  BooleanOp,
  type BooleanExpression,
  type CategoryName,
  type ChecklistMode,
  type TaskBreakout,
  type TaskDependencies,
  type TaskId,
} from "@/app/lib/data/types";
import { evaluateBooleanExpression } from "@/app/lib/booleanExpression";

/**
 * Aggregates foundational checklist structure queries into stable collection types.
 *
 * @returns An object with three normalized collections:
 * - `taskSet`: `Set<TaskId>` of all known task ids (empty set when query is unresolved).
 * - `categories`: ordered `CategoryName[]` preserving persisted category order.
 * - `categoryTasks`: `Map<CategoryName, TaskId[]>` where each value is the ordered task ids for that category.
 */
export function useTaskStructure() {
  const taskSet = useTaskSetQuery();
  const categories = useCategoriesQuery();
  const categoryTasks = useCategoriesTasksQuery();

  return {
    taskSet: taskSet.data ?? new Set<string>(),
    categories: categories.data ?? [],
    categoryTasks: categoryTasks.data ?? new Map<string, string[]>(),
  };
}

/**
 * Builds a reverse lookup map from task id to category name.
 *
 * @param categoryTasks Category-to-task adjacency map where values are ordered task id arrays.
 * @returns `Map<TaskId, CategoryName>` containing one entry per task id, pointing to its owning category.
 */
export function useTaskCategoryById(categoryTasks: Map<string, string[]>) {
  return useMemo(() => {
    const map = new Map<TaskId, CategoryName>();

    for (const [category, taskIds] of categoryTasks.entries()) {
      for (const taskId of taskIds) {
        map.set(taskId, category);
      }
    }

    return map;
  }, [categoryTasks]);
}

/**
 * Computes which tasks have opener requirements satisfied by the provided completion set.
 *
 * @returns `Set<TaskId>` containing only tasks whose opener expression (or implicit opener task set) evaluates to true.
 * Returns an empty set while required query inputs are unresolved.
 */
export function useOpenTasks(
  taskSet: Set<string> | undefined,
  dependencies: Map<string, TaskDependencies> | undefined,
  completions: Set<string> | undefined,
) {
  return useMemo(() => {
    if (!taskSet || !dependencies || !completions) {
      return new Set<string>();
    }

    const tasksWithCompleteOpeners = new Set<string>();

    for (const taskId of taskSet) {
      const openerDependencies = dependencies.get(taskId)?.openers;

      const openersSatisfied = evaluateBooleanExpression(
        openerDependencies?.expression,
        completions,
        openerDependencies?.taskSet,
      );

      if (openersSatisfied) {
        tasksWithCompleteOpeners.add(taskId);
      }
    }

    return tasksWithCompleteOpeners;
  }, [taskSet, dependencies, completions]);
}

/**
 * Produces the set of task ids matching the current search text.
 *
 * Matching is case-insensitive across category, title, description, and tags.
 * Query work is skipped for short input and all tasks are returned when search is disabled.
 *
 * @returns `Set<TaskId>` of task ids that match the active search criteria.
 */
export function useTasksMatchingSearch(searchQuery: string) {
  const taskSetQuery = useTaskSetQuery();
  const taskSet = taskSetQuery.data;
  const trimmedQuery = searchQuery?.trim() ?? "";
  const searchEnabled = trimmedQuery.length > 2;

  const detailsQuery = useDetailsQuery(searchEnabled);
  const tagsQuery = useTagsQuery(searchEnabled);

  return useMemo(() => {
    if (!taskSet) {
      return new Set<string>();
    }
    const details = detailsQuery.data;
    const tags = tagsQuery.data;

    // No search query, return all tasks
    if (!searchEnabled) return taskSet;
    const lowerCaseSearchQuery = trimmedQuery.toLowerCase();
    const matchingTasks = new Set<string>();

    for (const taskId of taskSet) {
      const detail = details?.get(taskId);
      const taskTags = tags?.get(taskId);

      const categoryMatch = detail?.category
        .toLowerCase()
        .includes(lowerCaseSearchQuery);
      if (categoryMatch) {
        matchingTasks.add(taskId);
        continue;
      }

      const titleMatch = detail?.title
        .toLowerCase()
        .includes(lowerCaseSearchQuery);
      if (titleMatch) {
        matchingTasks.add(taskId);
        continue;
      }

      const descriptionMatch = detail?.description
        .toLowerCase()
        .includes(lowerCaseSearchQuery);
      if (descriptionMatch) {
        matchingTasks.add(taskId);
        continue;
      }
      const tagsMatch = taskTags
        ? Array.from(taskTags).some((tag) =>
            tag.toLowerCase().includes(lowerCaseSearchQuery),
          )
        : false;

      if (titleMatch || descriptionMatch || tagsMatch) {
        matchingTasks.add(taskId);
      }
    }

    return matchingTasks;
  }, [trimmedQuery, searchEnabled, taskSet, detailsQuery.data, tagsQuery.data]);
}

/**
 * Derives task/category visibility for the given mode and filters.
 *
 * In task mode:
 * - Categories with unmet category dependencies are excluded.
 * - Tasks are shown only when openers are complete and completed-state filters allow them.
 *
 * In edit mode:
 * - Category dependencies and completion filters are ignored; only search matching is applied.
 *
 * @returns `TaskBreakout` containing:
 * - `visibleCategories`: ordered category names that currently contain at least one visible task.
 * - `categoryTasks`: map of visible category to its filtered ordered task ids.
 * - `orderedCategoryTasks`: array of visible task-id arrays aligned with `visibleCategories`.
 * - `visibleTasks`: set of all visible task ids across categories.
 */
export function useTaskBreakout(
  mode: ChecklistMode,
  showCompletedTasks: boolean,
  effectiveCompletions: Set<TaskId>,
  openTasks: Set<TaskId>,
  tasksMatchingSearch: Set<TaskId>,
): TaskBreakout {
  const categories = useCategoriesQuery().data;
  const categoriesTasks = useCategoriesTasksQuery().data;
  const categoryDependencies = useCategoryDependenciesQuery().data;
  const hiddenTasksData = useTaskHiddensQuery().data;

  return useMemo(() => {
    const visibleCategories: string[] = [];
    const categoryTasks = new Map<string, TaskId[]>();
    const orderedCategoryTasks: TaskId[][] = [];
    const visibleTasks = new Set<TaskId>();
    const hiddenTasks = hiddenTasksData ?? new Set<TaskId>();

    if (!categories || !categoriesTasks) {
      return {
        visibleCategories,
        categoryTasks,
        orderedCategoryTasks,
        visibleTasks,
      };
    }

    for (const category of categories) {
      if (mode === "task") {
        const dependencies = categoryDependencies?.get(category);
        let dependenciesMet = true;
        if (dependencies) {
          for (const dependencyId of dependencies) {
            if (!effectiveCompletions.has(dependencyId)) {
              dependenciesMet = false;
              break;
            }
          }
        }

        if (!dependenciesMet) {
          continue;
        }
      }

      const tasks = categoriesTasks.get(category) ?? [];
      const filtered = tasks.filter((taskId) => {
        const matchesSearch = tasksMatchingSearch.has(taskId);
        if (mode === "task") {
          const isHidden = hiddenTasks.has(taskId);
          const hasCompleteOpeners = openTasks.has(taskId);
          const isCompleted = effectiveCompletions.has(taskId);
          const shouldShow =
            !isHidden &&
            hasCompleteOpeners &&
            (showCompletedTasks || !isCompleted);
          return shouldShow && matchesSearch;
        }

        return matchesSearch;
      });

      if (filtered.length > 0) {
        visibleCategories.push(category);
        categoryTasks.set(category, filtered);
        orderedCategoryTasks.push(filtered);
        filtered.forEach((taskId) => visibleTasks.add(taskId));
      }
    }

    return {
      visibleCategories,
      categoryTasks,
      orderedCategoryTasks,
      visibleTasks,
    };
  }, [
    categories,
    categoriesTasks,
    categoryDependencies,
    effectiveCompletions,
    hiddenTasksData,
    mode,
    openTasks,
    showCompletedTasks,
    tasksMatchingSearch,
  ]);
}

function computeEffectiveCompletions(
  taskSet: Set<string>,
  completions: Set<string>,
  dependencies: Map<string, TaskDependencies>,
  evaluatedClosersCompletions: Map<TaskId, true | false>,
) {
  const effectiveCompletions = new Set<string>(completions);
  const activeTasks = new Set<TaskId>();

  const evaluateTaskCompletion = (taskId: TaskId): boolean => {
    if (!taskSet.has(taskId)) {
      return false;
    }

    if (completions.has(taskId)) {
      return true;
    }

    const existingClosersCompletion = evaluatedClosersCompletions.get(taskId);
    if (existingClosersCompletion !== undefined) {
      return existingClosersCompletion;
    }

    if (activeTasks.has(taskId)) {
      return false;
    }

    activeTasks.add(taskId);

    const taskCloserDependencies = dependencies.get(taskId)?.closers;

    if (!taskCloserDependencies) {
      evaluatedClosersCompletions.set(taskId, false);
      activeTasks.delete(taskId);
      return false;
    }

    const evaluateExpression = (expression: BooleanExpression): boolean => {
      if (typeof expression === "string") {
        return evaluateTaskCompletion(expression);
      }

      const [operator, ...operands] = expression;

      if (operator === BooleanOp.Not) {
        return !evaluateExpression(operands[0]);
      }

      if (operator === BooleanOp.And) {
        if (operands.length === 0) {
          return true;
        }

        return operands.every((operand) => evaluateExpression(operand));
      }

      if (operator === BooleanOp.Or) {
        if (operands.length === 0) {
          return true;
        }

        return operands.some((operand) => evaluateExpression(operand));
      }

      return false;
    };

    const closersCompletion = taskCloserDependencies.expression
      ? evaluateExpression(taskCloserDependencies.expression)
      : Array.from(taskCloserDependencies.taskSet).every((taskDependencyId) =>
          evaluateTaskCompletion(taskDependencyId),
        );
    evaluatedClosersCompletions.set(taskId, closersCompletion);
    activeTasks.delete(taskId);

    if (closersCompletion) {
      effectiveCompletions.add(taskId);
    }

    return closersCompletion;
  };

  for (const taskId of taskSet) {
    evaluateTaskCompletion(taskId);
  }

  return effectiveCompletions;
}

/**
 * Computes the effective completion set by combining explicit completions with closer-derived completions.
 *
 * For each task id in `taskSet`:
 * - Explicit completion in `completions` is honored directly.
 * - Otherwise, closer dependencies are evaluated recursively and successful evaluations are added.
 *
 * @returns `Set<TaskId>` containing all effectively complete tasks.
 * This includes initially explicit completions plus any additional tasks completed via closer logic.
 * Returns an empty set while required query inputs are unresolved.
 */
export function useEffectiveCompletions(
  taskSet: Set<string> | undefined,
  completions: Set<string> | undefined,
  dependencies: Map<string, TaskDependencies> | undefined,
) {
  return useMemo(() => {
    if (!taskSet || !completions || !dependencies) {
      return new Set<string>();
    }

    const evaluatedClosersCompletions = new Map<TaskId, true | false>();

    return computeEffectiveCompletions(
      taskSet,
      completions,
      dependencies,
      evaluatedClosersCompletions,
    );
  }, [taskSet, completions, dependencies]);
}
