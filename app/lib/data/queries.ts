// React Query query hooks.
// NOTE: Hooks that derive data from queries go in `derivedData.ts`, not here.
// All hooks here should return objects shaped like `useQuery`.

import { useQuery } from "@tanstack/react-query";
import {
  CATEGORIES_STORE,
  CATEGORY_COLLAPSED_STORE,
  CATEGORY_DEPENDENCIES_STORE,
  CATEGORY_TASKS_STORE,
  getDb,
  queryClient,
  TAG_COLORS_STORE,
  TASK_COMPLETION_STORE,
  TASK_DEPENDENCIES_STORE,
  TASK_HIDDEN_STORE,
  TASK_REMINDERS_STORE,
  TASK_TAGS_STORE,
  TASKS_STORE,
} from "@/app/lib/data/store";
import type { CategoryName, TaskId } from "@/app/lib/data/types";
import { fromKvPairsToMap } from "@/app/lib/utils";

function getQueryArgs_categories() {
  return {
    queryKey: ["categories"],
    queryFn: async () => {
      console.log("Fetching category order");
      const db = await getDb();
      const categories = await db.get(CATEGORIES_STORE, "categories");
      if (categories === undefined) {
        return [];
      }
      return categories;
    },
  };
}

export function useCategoriesQuery() {
  return useQuery(getQueryArgs_categories());
}

function getQueryArgs_categoriesTasks() {
  return {
    queryKey: ["categoryTasks"],
    queryFn: async () => {
      console.log("Fetching ALL category task maps");
      const db = await getDb();
      const categoryKeys = await db.getAllKeys(CATEGORY_TASKS_STORE);
      const categoryValues = await db.getAll(CATEGORY_TASKS_STORE);
      return fromKvPairsToMap(categoryKeys, categoryValues);
    },
  };
}

export function useCategoriesTasksQuery() {
  return useQuery(getQueryArgs_categoriesTasks());
}

function getQueryArgs_categoryDependencies() {
  return {
    queryKey: ["categoryDependencies"],
    queryFn: async () => {
      console.log("Fetching ALL category dependencies");
      const db = await getDb();
      const categoryKeys = await db.getAllKeys(CATEGORY_DEPENDENCIES_STORE);
      const dependencyValues = await db.getAll(CATEGORY_DEPENDENCIES_STORE);
      const map = fromKvPairsToMap(categoryKeys, dependencyValues);

      for (const [category, dependencies] of map.entries()) {
        queryClient.setQueryData(
          ["category", "dependencies", category],
          dependencies,
        );
      }

      return map;
    },
  };
}

export function useCategoryDependenciesQuery() {
  return useQuery(getQueryArgs_categoryDependencies());
}

function getQueryArgs_dependencies() {
  return {
    queryKey: ["dependencies"],
    queryFn: async () => {
      console.log("Fetching ALL task dependencies");
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASK_DEPENDENCIES_STORE);
      const dependencyExpressions = await db.getAll(TASK_DEPENDENCIES_STORE);
      const map = fromKvPairsToMap(taskIds, dependencyExpressions);
      for (const [taskId, dependencyExpression] of map.entries()) {
        queryClient.setQueryData(
          ["task", "dependencies", taskId],
          dependencyExpression,
        );
      }

      return map;
    },
  };
}

export function useDependenciesQuery() {
  return useQuery(getQueryArgs_dependencies());
}

function getQueryArgs_completions() {
  return {
    queryKey: ["completions"],
    queryFn: async () => {
      console.log("Fetching ALL task completions");
      const db = await getDb();
      const allTasks = new Set<string>(
        await db.getAllKeys(TASK_COMPLETION_STORE),
      );
      for (const taskId of allTasks) {
        queryClient.setQueryData(["task", "completion", taskId], true);
      }
      return allTasks;
    },
  };
}

export function useCompletionsQuery() {
  return useQuery(getQueryArgs_completions());
}

function getQueryArgs_reminders() {
  return {
    queryKey: ["reminders"],
    queryFn: async () => {
      console.log("Fetching ALL task reminders");
      const db = await getDb();
      const allReminderTasks = new Set<string>(
        await db.getAllKeys(TASK_REMINDERS_STORE),
      );
      for (const taskId of allReminderTasks) {
        queryClient.setQueryData(["task", "reminder", taskId], true);
      }
      return allReminderTasks;
    },
  };
}

export function useRemindersQuery() {
  return useQuery(getQueryArgs_reminders());
}

function getQueryArgs_details(enabled?: boolean) {
  return {
    queryKey: ["details"],
    enabled: enabled === undefined ? true : enabled,
    queryFn: async () => {
      console.log("Fetching ALL task details");
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASKS_STORE);
      const details = await db.getAll(TASKS_STORE);
      const map = fromKvPairsToMap(taskIds, details);
      for (const [taskId, detail] of map.entries()) {
        queryClient.setQueryData(["task", "detail", taskId], detail);
      }
      return map;
    },
  };
}

export function useDetailsQuery(enabled?: boolean) {
  return useQuery(getQueryArgs_details(enabled));
}

function getQueryArgs_taskSet() {
  return {
    queryKey: ["taskSet"],
    queryFn: async () => {
      console.log("Fetching taskSet");
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASKS_STORE);
      const taskSet = new Set<string>(taskIds);
      return taskSet;
    },
  };
}

export function useTaskSetQuery() {
  return useQuery(getQueryArgs_taskSet());
}

export function getQueryArgs_tags(enabled?: boolean) {
  return {
    queryKey: ["tags"],
    enabled: enabled === undefined ? true : enabled,
    queryFn: async () => {
      console.log("Fetching ALL tags");
      const db = await getDb();
      const taskIds = await db.getAllKeys(TASK_TAGS_STORE);
      const tags = await db.getAll(TASK_TAGS_STORE);
      const map = fromKvPairsToMap(taskIds, tags);
      for (const [taskId, tags] of map.entries()) {
        queryClient.setQueryData(["task", "tags", taskId], tags);
      }
      return map;
    },
  };
}

export function useTagsQuery(enabled?: boolean) {
  return useQuery(getQueryArgs_tags(enabled));
}

export function useTaskDetailQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "detail", taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const db = await getDb();
      console.log("Fetching task detail for", taskId);
      const res = await db.get(TASKS_STORE, taskId);
      return res === undefined ? null : res;
    },
  });
}

export function useTaskTagsQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "tags", taskId],
    queryFn: async () => {
      const db = await getDb();
      const tags = await db.get(TASK_TAGS_STORE, taskId);
      if (tags === undefined) {
        return new Set<string>();
      }
      return tags;
    },
  });
}

export function useTaskDependenciesQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "dependencies", taskId],
    queryFn: async () => {
      const db = await getDb();
      const dependencyExpression = await db.get(
        TASK_DEPENDENCIES_STORE,
        taskId,
      );
      if (dependencyExpression === undefined) {
        return null;
      }
      return dependencyExpression;
    },
  });
}

export function useCategoryDependencyQuery(category: CategoryName) {
  return useQuery({
    queryKey: ["category", "dependencies", category],
    queryFn: async () => {
      const db = await getDb();
      const dependencies = await db.get(CATEGORY_DEPENDENCIES_STORE, category);
      if (dependencies === undefined) {
        return new Set<TaskId>();
      }
      return dependencies;
    },
  });
}

export function useTaskCompletionQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "completion", taskId],
    queryFn: async () => {
      const db = await getDb();
      const isCompleted = await db.get(TASK_COMPLETION_STORE, taskId);
      return !!isCompleted;
    },
  });
}

export function useTaskReminderQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "reminder", taskId],
    queryFn: async () => {
      const db = await getDb();
      const isReminder = await db.get(TASK_REMINDERS_STORE, taskId);
      return !!isReminder;
    },
  });
}

export function useTaskHiddenQuery(taskId: TaskId) {
  return useQuery({
    queryKey: ["task", "hidden", taskId],
    queryFn: async () => {
      const db = await getDb();
      const isHidden = await db.get(TASK_HIDDEN_STORE, taskId);
      return !!isHidden;
    },
  });
}

function getQueryArgs_hiddens() {
  return {
    queryKey: ["hiddens"],
    queryFn: async () => {
      const db = await getDb();
      const allHiddenTasks = new Set<string>(
        await db.getAllKeys(TASK_HIDDEN_STORE),
      );
      return allHiddenTasks;
    },
    onSuccess: (hiddenTaskIds: Set<string>) => {
      for (const taskId of hiddenTaskIds) {
        queryClient.setQueryData(["task", "hidden", taskId], true);
      }
    },
  };
}

export function useTaskHiddensQuery() {
  return useQuery(getQueryArgs_hiddens());
}

export function useCollapsedCategoriesQuery() {
  return useQuery({
    queryKey: ["collapsedCategories"],
    queryFn: async () => {
      const db = await getDb();

      const hiddenTaskCategories =
        (await db.get(CATEGORY_COLLAPSED_STORE, "task")) ?? new Set<string>();
      const hiddenEditCategories =
        (await db.get(CATEGORY_COLLAPSED_STORE, "edit")) ?? new Set<string>();

      return { task: hiddenTaskCategories, edit: hiddenEditCategories };
    },
  });
}

export function useTagColorsQuery() {
  return useQuery({
    queryKey: ["tagColors"],
    queryFn: async () => {
      const db = await getDb();
      const colorKeys = await db.getAllKeys(TAG_COLORS_STORE);
      const colorValues = await db.getAll(TAG_COLORS_STORE);
      return fromKvPairsToMap(colorKeys, colorValues);
    },
  });
}

export function useAllKnownTagsQuery() {
  return useQuery({
    queryKey: ["allKnownTags"],
    queryFn: async () => {
      const db = await getDb();
      const tags = await db.getAll(TASK_TAGS_STORE);
      let allTags = new Set<string>();
      for (const tagSet of tags) {
        allTags = allTags.union(tagSet);
      }
      return allTags;
    },
  });
}
