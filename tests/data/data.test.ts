import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { BooleanOp, type DependencyExpression } from "../../app/lib/data/types";

import {
  exportChecklistState,
  importChecklistDefinition,
  importChecklistState,
} from "../../app/lib/data/export";
import { type ExportedChecklistState } from "@/app/lib/data/jsonSchema";
import { type ExportedChecklistDefinition } from "@/app/lib/data/jsonSchema";
import { queryClient } from "../../app/lib/data/store";
import {
  useCreateTaskMutation,
  useDeleteTasksMutation,
  useMoveTaskMutation,
  useTaskCompletionMutation,
  useTaskDependenciesMutation,
  useTaskDetailMutation,
  useTaskReminderMutation,
} from "../../app/lib/data/mutations";
import {
  useCategoriesQuery,
  useCategoriesTasksQuery,
  useCategoryDependencyQuery,
  useCompletionsQuery,
  useDependenciesQuery,
  useDetailsQuery,
  useRemindersQuery,
  useTaskCompletionQuery,
  useTaskDependenciesQuery,
  useTaskDetailQuery,
  useTaskHiddenQuery,
  useTaskReminderQuery,
  useTaskSetQuery,
  useTaskTagsQuery,
} from "../../app/lib/data/queries";
import {
  useCompletionsWithReminders,
  useTaskStructure,
  useTasksWithCompleteDependencies,
} from "../../app/lib/data/derivedData";

const EMPTY_DEFINITION: ExportedChecklistDefinition = {
  categories: [],
  tasksByCategory: {},
  tagColors: {},
  categoryDependencies: {},
};

const EMPTY_STATE: ExportedChecklistState = {
  tasks: {},
  categoryVisibilityByMode: {
    task: {},
    edit: {},
  },
};

const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function assertMissingPerItemQuerySentinels(result: {
  detail: unknown;
  tags: Set<string> | undefined;
  dependencies: DependencyExpression | null | undefined;
  categoryDependencies: Set<string> | undefined;
  completion: boolean | undefined;
  reminder: boolean | undefined;
  hidden: boolean | undefined;
}) {
  expect(result.detail).toBeNull();
  expect(result.tags).toEqual(new Set<string>());
  expect(result.dependencies).toBeNull();
  expect(result.categoryDependencies).toEqual(new Set<string>());
  expect(result.completion).toBe(false);
  expect(result.reminder).toBe(false);
  expect(result.hidden).toBe(false);
}

describe("data layer", () => {
  beforeEach(async () => {
    queryClient.clear();
    await importChecklistDefinition(asJson(EMPTY_DEFINITION));
    await importChecklistState(asJson(EMPTY_STATE));
    queryClient.clear();
  });

  it("creates a task and updates base queries", async () => {
    const { result } = renderHook(
      () => ({
        createTask: useCreateTaskMutation(),
        taskSet: useTaskSetQuery().data ?? new Set<string>(),
        categories: useCategoriesQuery().data ?? [],
        categoryTasks:
          useCategoriesTasksQuery().data ?? new Map<string, string[]>(),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.createTask.mutateAsync("Inbox");
    });

    await waitFor(() => {
      expect(result.current.taskSet.size).toBe(1);
    });

    const [taskId] = Array.from(result.current.taskSet);
    await waitFor(() => {
      expect(result.current.categories).toEqual(["Inbox"]);
      expect(taskId).toBeDefined();
    });
  });

  it("updates task details through mutation and reflects in detail queries", async () => {
    const { result } = renderHook(
      () => ({
        createTask: useCreateTaskMutation(),
        updateTaskDetail: useTaskDetailMutation(),
        taskSet: useTaskSetQuery().data ?? new Set<string>(),
        details: useDetailsQuery().data ?? new Map(),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.createTask.mutateAsync("Inbox");
    });

    await waitFor(() => {
      expect(result.current.taskSet.size).toBe(1);
    });

    const [taskId] = Array.from(result.current.taskSet);

    await act(async () => {
      await result.current.updateTaskDetail.mutateAsync({
        taskId,
        title: "Renamed",
        description: "Updated description",
      });
    });

    await waitFor(() => {
      const detail = result.current.details.get(taskId);
      expect(detail?.title).toBe("Renamed");
      expect(detail?.description).toBe("Updated description");
    });
  });

  it("stores dependencyExpression in task dependencies store when imported", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["Main"],
      tasksByCategory: {
        Main: [
          { id: "a", category: "Main", title: "A" },
          {
            id: "t",
            category: "Main",
            title: "Target",
            dependencies: ["a"],
            dependencyExpression: [BooleanOp.Not, "a"],
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    queryClient.clear();

    const { result } = renderHook(
      () => ({
        dependencyData: useTaskDependenciesQuery("t").data,
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.dependencyData?.taskSet).toEqual(new Set(["a"]));
      expect(result.current.dependencyData?.expression).toEqual([
        BooleanOp.Not,
        "a",
      ]);
    });
  });

  it("returns non-undefined sentinels for missing per-item query records", async () => {
    const { result } = renderHook(
      () => ({
        detail: useTaskDetailQuery("missing").data,
        tags: useTaskTagsQuery("missing").data,
        dependencies: useTaskDependenciesQuery("missing").data,
        categoryDependencies:
          useCategoryDependencyQuery("missing-category").data,
        completion: useTaskCompletionQuery("missing").data,
        reminder: useTaskReminderQuery("missing").data,
        hidden: useTaskHiddenQuery("missing").data,
      }),
      { wrapper },
    );

    await waitFor(() => {
      assertMissingPerItemQuerySentinels(result.current);
    });
  });

  it("clears per-task dependencies query after deleting the task", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["Main"],
      tasksByCategory: {
        Main: [
          { id: "a", category: "Main", title: "A" },
          {
            id: "t",
            category: "Main",
            title: "Target",
            dependencies: ["a"],
            dependencyExpression: [BooleanOp.Not, "a"],
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    queryClient.clear();

    const { result } = renderHook(
      () => ({
        deleteTasks: useDeleteTasksMutation(),
        taskSet: useTaskSetQuery().data ?? new Set<string>(),
        dependencyData: useTaskDependenciesQuery("t").data,
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.dependencyData).toEqual({
        taskSet: new Set(["a"]),
        expression: [BooleanOp.Not, "a"],
      });
      expect(result.current.taskSet.has("t")).toBe(true);
    });

    await act(async () => {
      await result.current.deleteTasks.mutateAsync(["t"]);
    });

    await waitFor(() => {
      expect(result.current.taskSet.has("t")).toBe(false);
      expect(result.current.dependencyData).toBeNull();
    });
  });

  it("stores custom dependencyExpression and omits implicit AND expression", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["Main"],
      tasksByCategory: {
        Main: [
          { id: "a", category: "Main", title: "A" },
          { id: "b", category: "Main", title: "B" },
          {
            id: "t",
            category: "Main",
            title: "Target",
            dependencies: ["a", "b"],
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    queryClient.clear();

    const { result } = renderHook(
      () => ({
        setDependencies: useTaskDependenciesMutation(),
        perTaskDependencies: useTaskDependenciesQuery("t").data,
        dependencies:
          useDependenciesQuery().data ??
          new Map<string, DependencyExpression>(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.perTaskDependencies).toEqual({
        taskSet: new Set(["a", "b"]),
      });
      expect(result.current.dependencies.get("t")?.expression).toBeUndefined();
    });

    await act(async () => {
      await result.current.setDependencies.mutateAsync({
        taskId: "t",
        dependencyExpression: {
          taskSet: new Set(["a", "b"]),
          expression: [BooleanOp.Or, "a", "b"],
        },
      });
    });

    await waitFor(() => {
      expect(result.current.perTaskDependencies).toEqual({
        taskSet: new Set(["a", "b"]),
        expression: [BooleanOp.Or, "a", "b"],
      });
      expect(result.current.dependencies.get("t")?.expression).toEqual([
        BooleanOp.Or,
        "a",
        "b",
      ]);
    });

    await act(async () => {
      await result.current.setDependencies.mutateAsync({
        taskId: "t",
        dependencyExpression: {
          taskSet: new Set(["a", "b"]),
          expression: [BooleanOp.And, "a", "b"],
        },
      });
    });

    await waitFor(() => {
      expect(result.current.perTaskDependencies).toEqual({
        taskSet: new Set(["a", "b"]),
      });
      expect(result.current.dependencies.get("t")?.expression).toBeUndefined();
    });
  });

  it("removes deleted task from aggregate dependencies query", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["Main"],
      tasksByCategory: {
        Main: [
          { id: "a", category: "Main", title: "A" },
          {
            id: "t",
            category: "Main",
            title: "Target",
            dependencies: ["a"],
            dependencyExpression: [BooleanOp.Not, "a"],
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    queryClient.clear();

    const { result } = renderHook(
      () => ({
        deleteTasks: useDeleteTasksMutation(),
        taskSet: useTaskSetQuery().data ?? new Set<string>(),
        dependencies:
          useDependenciesQuery().data ??
          new Map<string, DependencyExpression>(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.taskSet.has("t")).toBe(true);
      expect(result.current.dependencies.get("t")?.expression).toEqual([
        BooleanOp.Not,
        "a",
      ]);
    });

    await act(async () => {
      await result.current.deleteTasks.mutateAsync(["t"]);
    });

    await waitFor(() => {
      expect(result.current.taskSet.has("t")).toBe(false);
      expect(result.current.dependencies.has("t")).toBe(false);
    });
  });

  it("applies reminder mutation semantics across completion and dependencies", async () => {
    const { result } = renderHook(
      () => {
        const categoriesTasks =
          useCategoriesTasksQuery().data ?? new Map<string, string[]>();
        const dependencies =
          useDependenciesQuery().data ??
          new Map<string, DependencyExpression>();
        const completions = useCompletionsQuery().data ?? new Set<string>();
        const reminders = useRemindersQuery().data ?? new Set<string>();
        const taskStructure = useTaskStructure();
        const completionsWithReminders = useCompletionsWithReminders(
          taskStructure.taskSet,
          completions,
          reminders,
          dependencies,
        );
        const tasksWithCompleteDependencies = useTasksWithCompleteDependencies(
          taskStructure.taskSet,
          dependencies,
          completionsWithReminders,
        );

        return {
          createTask: useCreateTaskMutation(),
          setDependencies: useTaskDependenciesMutation(),
          setCompletion: useTaskCompletionMutation(),
          setReminder: useTaskReminderMutation(),
          categoriesTasks,
          dependencies,
          completions,
          reminders,
          tasksWithCompleteDependencies,
        };
      },
      { wrapper },
    );

    await act(async () => {
      await result.current.createTask.mutateAsync("Inbox");
      await result.current.createTask.mutateAsync("Inbox");
    });

    await waitFor(() => {
      expect((result.current.categoriesTasks.get("Inbox") ?? []).length).toBe(
        2,
      );
    });

    const [dependencyId, dependentTaskId] =
      result.current.categoriesTasks.get("Inbox") ?? [];

    await act(async () => {
      await result.current.setDependencies.mutateAsync({
        taskId: dependentTaskId,
        dependencyExpression: {
          taskSet: new Set([dependencyId]),
        },
      });
    });

    await waitFor(() => {
      expect(
        result.current.dependencies
          .get(dependentTaskId)
          ?.taskSet.has(dependencyId),
      ).toBe(true);
    });

    await act(async () => {
      await result.current.setCompletion.mutateAsync({
        taskId: dependencyId,
        isCompleted: true,
      });
    });

    await waitFor(() => {
      expect(result.current.completions.has(dependencyId)).toBe(true);
    });

    await act(async () => {
      await result.current.setReminder.mutateAsync({
        taskId: dependencyId,
        isReminder: true,
      });
    });

    await waitFor(() => {
      expect(result.current.reminders.has(dependencyId)).toBe(true);
      expect(result.current.completions.has(dependencyId)).toBe(false);

      const dependencyExpressionData =
        result.current.dependencies.get(dependentTaskId);
      expect(dependencyExpressionData?.taskSet.has(dependencyId)).toBe(true);
      expect(
        result.current.tasksWithCompleteDependencies.has(dependentTaskId),
      ).toBe(true);
    });
  });

  it("deletes tasks with referential cleanup (dependencies and empty category removal)", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["A", "B"],
      tasksByCategory: {
        A: [
          { id: "a1", category: "A", title: "A1" },
          { id: "a2", category: "A", title: "A2" },
        ],
        B: [{ id: "b1", category: "B", title: "B1", dependencies: ["a2"] }],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    queryClient.clear();

    const { result } = renderHook(
      () => ({
        deleteTasks: useDeleteTasksMutation(),
        taskSet: useTaskSetQuery().data ?? new Set<string>(),
        categories: useCategoriesQuery().data ?? [],
        categoryTasks:
          useCategoriesTasksQuery().data ?? new Map<string, string[]>(),
        dependencies:
          useDependenciesQuery().data ??
          new Map<string, DependencyExpression>(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.taskSet.has("a2")).toBe(true);
      expect(result.current.dependencies.get("b1")?.taskSet.has("a2")).toBe(
        true,
      );
    });

    await act(async () => {
      await result.current.deleteTasks.mutateAsync(["a2", "a1"]);
    });

    await waitFor(() => {
      expect(result.current.taskSet.has("a1")).toBe(false);
      expect(result.current.taskSet.has("a2")).toBe(false);
      expect(result.current.categories).toEqual(["B"]);
      expect(result.current.categoryTasks.has("A")).toBe(false);
      expect(result.current.dependencies.has("b1")).toBe(false);
    });
  });

  it("moves task across categories and cleans removed category + collapsed state", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["From", "To"],
      tasksByCategory: {
        From: [{ id: "t1", category: "From", title: "Task 1" }],
        To: [{ id: "t2", category: "To", title: "Task 2" }],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    const state: ExportedChecklistState = {
      tasks: {},
      categoryVisibilityByMode: {
        task: { From: true, To: true },
        edit: { From: true, To: true },
      },
    };

    await importChecklistDefinition(asJson(definition));
    await importChecklistState(asJson(state));
    queryClient.clear();

    const { result } = renderHook(
      () => ({
        moveTask: useMoveTaskMutation(),
        categories: useCategoriesQuery().data ?? [],
        categoryTasks:
          useCategoriesTasksQuery().data ?? new Map<string, string[]>(),
        movedTask: useTaskDetailQuery("t1").data,
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.categories).toEqual(["From", "To"]);
      expect(result.current.categoryTasks.get("From")).toEqual(["t1"]);
    });

    await act(async () => {
      await result.current.moveTask.mutateAsync({
        fromCategory: "From",
        fromIndex: 0,
        toCategory: "To",
        toIndex: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.categories).toEqual(["To"]);
      expect(result.current.categoryTasks.has("From")).toBe(false);
      expect(result.current.categoryTasks.get("To")).toEqual(["t2", "t1"]);
      expect(result.current.movedTask?.category).toBe("To");
    });

    const exportedState = await exportChecklistState();
    expect(exportedState.categoryVisibilityByMode.task.From).toBeUndefined();
    expect(exportedState.categoryVisibilityByMode.edit.From).toBeUndefined();
  });

  it("creates destination category when moving task into a new category", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["From"],
      tasksByCategory: {
        From: [{ id: "t1", category: "From", title: "Task 1" }],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    queryClient.clear();

    const { result } = renderHook(
      () => ({
        moveTask: useMoveTaskMutation(),
        categories: useCategoriesQuery().data ?? [],
        categoryTasks:
          useCategoriesTasksQuery().data ?? new Map<string, string[]>(),
        movedTask: useTaskDetailQuery("t1").data,
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.categories).toEqual(["From"]);
      expect(result.current.categoryTasks.get("From")).toEqual(["t1"]);
    });

    await act(async () => {
      await result.current.moveTask.mutateAsync({
        fromCategory: "From",
        fromIndex: 0,
        toCategory: "New",
        toIndex: 0,
      });
    });

    await waitFor(() => {
      expect(result.current.categories).toEqual(["New"]);
      expect(result.current.categoryTasks.has("From")).toBe(false);
      expect(result.current.categoryTasks.get("New")).toEqual(["t1"]);
      expect(result.current.movedTask?.category).toBe("New");
    });
  });

  it("prevents dependency cycles and keeps previous dependency graph", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["C"],
      tasksByCategory: {
        C: [
          { id: "a", category: "C", title: "A", dependencies: ["b"] },
          { id: "b", category: "C", title: "B" },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    queryClient.clear();

    const { result } = renderHook(
      () => ({
        setDependencies: useTaskDependenciesMutation(),
        dependencies:
          useDependenciesQuery().data ??
          new Map<string, DependencyExpression>(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.dependencies.get("a")?.taskSet.has("b")).toBe(true);
    });

    await expect(
      act(async () => {
        await result.current.setDependencies.mutateAsync({
          taskId: "b",
          dependencyExpression: {
            taskSet: new Set(["a"]),
            expression: undefined,
          },
        });
      }),
    ).rejects.toThrow("Dependency cycle detected");

    await waitFor(() => {
      expect(result.current.dependencies.get("a")?.taskSet.has("b")).toBe(true);
      expect(
        result.current.dependencies.get("b")?.taskSet.has("a") ?? false,
      ).toBe(false);
    });
  });
});
