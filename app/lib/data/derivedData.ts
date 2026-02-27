// Hooks that derive memoized data from React Queries.

import {
  useCategoriesQuery,
  useCategoriesTasksQuery,
  useDetailsQuery,
  useTagsQuery,
  useTaskSetQuery,
} from "@/app/lib/data/queries";
import { useMemo } from "react";
import {
  BooleanOp,
  type BooleanExpression,
  type CategoryName,
  type DependencyExpression,
  type TaskId,
} from "@/app/lib/data/types";
import { evaluateBooleanExpression } from "@/app/lib/booleanExpression";

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

export function useTasksWithCompleteDependencies(
  taskSet: Set<string> | undefined,
  dependencies: Map<string, DependencyExpression> | undefined,
  completions: Set<string> | undefined,
) {
  return useMemo(() => {
    if (!taskSet || !dependencies || !completions) {
      return new Set<string>();
    }

    const tasksWithCompleteDependencies = new Set<string>();

    for (const taskId of taskSet) {
      const dependencyExpressionData = dependencies.get(taskId);
      const taskDependencies =
        dependencyExpressionData?.taskSet ?? new Set<string>();
      const taskDependencyExpression = dependencyExpressionData?.expression ?? [
        BooleanOp.And,
        ...taskDependencies,
      ];

      const dependenciesSatisfied = evaluateBooleanExpression(
        taskDependencyExpression,
        completions,
      );

      if (dependenciesSatisfied) {
        tasksWithCompleteDependencies.add(taskId);
      }
    }

    return tasksWithCompleteDependencies;
  }, [taskSet, dependencies, completions]);
}

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

function computeCompletionsWithReminders(
  taskSet: Set<string>,
  completions: Set<string>,
  reminders: Set<string>,
  dependencies: Map<string, DependencyExpression>,
  evaluatedReminderCompletions: Map<TaskId, true | false>,
) {
  const effectiveCompletions = new Set<string>(completions);

  const evaluateTaskCompletion = (taskId: TaskId): boolean => {
    if (!taskSet.has(taskId)) {
      return false;
    }

    if (!reminders.has(taskId)) {
      return completions.has(taskId);
    }

    const existingReminderCompletion = evaluatedReminderCompletions.get(taskId);
    if (existingReminderCompletion !== undefined) {
      return existingReminderCompletion;
    }

    const dependencyExpressionData = dependencies.get(taskId);
    const taskDependencies =
      dependencyExpressionData?.taskSet ?? new Set<string>();
    const taskDependencyExpression = dependencyExpressionData?.expression ?? [
      BooleanOp.And,
      ...taskDependencies,
    ];

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

    const reminderCompletion = evaluateExpression(taskDependencyExpression);
    evaluatedReminderCompletions.set(taskId, reminderCompletion);

    if (reminderCompletion) {
      effectiveCompletions.add(taskId);
    }

    return reminderCompletion;
  };

  for (const reminderTaskId of reminders) {
    if (!taskSet.has(reminderTaskId)) {
      continue;
    }

    evaluateTaskCompletion(reminderTaskId);
  }

  return effectiveCompletions;
}

export function useCompletionsWithReminders(
  taskSet: Set<string> | undefined,
  completions: Set<string> | undefined,
  reminders: Set<string> | undefined,
  dependencies: Map<string, DependencyExpression> | undefined,
) {
  return useMemo(() => {
    if (!taskSet || !completions || !reminders || !dependencies) {
      return new Set<string>();
    }

    const evaluatedReminderCompletions = new Map<TaskId, true | false>();

    return computeCompletionsWithReminders(
      taskSet,
      completions,
      reminders,
      dependencies,
      evaluatedReminderCompletions,
    );
  }, [taskSet, completions, reminders, dependencies]);
}
