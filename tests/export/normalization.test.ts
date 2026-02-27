import { beforeEach, describe, expect, it } from "vitest";
import { BooleanOp } from "../../app/lib/data/types";
import {
  exportChecklistDefinition,
  exportChecklistState,
  importChecklistDefinition,
  importChecklistState,
} from "../../app/lib/export";
import { type ExportedChecklistState } from "@/app/lib/data/jsonSchema";
import { type ExportedChecklistDefinition } from "@/app/lib/data/jsonSchema";

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

describe("import/export normalization", () => {
  beforeEach(async () => {
    await importChecklistDefinition(asJson(EMPTY_DEFINITION));
    await importChecklistState(asJson(EMPTY_STATE));
  });

  it("normalizes definition shape and cross-references", async () => {
    const rawDefinition = {
      categories: ["A", "B", "Empty"],
      tasksByCategory: {
        A: [
          {
            id: "t1",
            category: "A",
            title: "Task 1",
            description: "",
            dependencies: ["t1", "t2", "t2", "missing", "t3"],
            dependencyExpression: [BooleanOp.And, "t2", "t3"],
            tags: ["keep", "dup", "dup", ""],
          },
          {
            id: "t3",
            category: "A",
            title: "Reminder",
            type: "reminder",
            tags: ["keep"],
          },
        ],
        B: [
          {
            id: "t2",
            category: "B",
            title: "Task 2",
            tags: ["other"],
          },
          {
            id: "t4",
            category: "B",
            title: "Task 4",
            dependencies: ["t1", "t2"],
            dependencyExpression: [BooleanOp.Or, "t1", "t2"],
          },
        ],
        Empty: [],
      },
      tagColors: {
        keep: "red",
        dup: "blue",
        other: "green",
        unused: "purple",
      },
      categoryDependencies: {
        B: ["t1", "missing", "t1"],
        Empty: ["t2"],
      },
    } as unknown as ExportedChecklistDefinition;

    await importChecklistDefinition(asJson(rawDefinition));
    const exportedDefinition = await exportChecklistDefinition();

    expect(exportedDefinition).toEqual({
      categories: ["A", "B"],
      tasksByCategory: {
        A: [
          {
            id: "t1",
            category: "A",
            title: "Task 1",
            dependencies: ["t2", "t3"],
            tags: ["keep", "dup"],
          },
          {
            id: "t3",
            category: "A",
            title: "Reminder",
            type: "reminder",
            tags: ["keep"],
          },
        ],
        B: [
          {
            id: "t2",
            category: "B",
            title: "Task 2",
            tags: ["other"],
          },
          {
            id: "t4",
            category: "B",
            title: "Task 4",
            dependencies: ["t1", "t2"],
            dependencyExpression: [BooleanOp.Or, "t1", "t2"],
          },
        ],
      },
      tagColors: {
        keep: "red",
        dup: "blue",
        other: "green",
      },
      categoryDependencies: {
        B: ["t1"],
      },
    });
  });

  it("omits invalid dependencyExpression during normalization", async () => {
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
            dependencyExpression: [BooleanOp.Not] as unknown as never,
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    const exportedDefinition = await exportChecklistDefinition();

    expect(exportedDefinition.tasksByCategory.Main).toEqual([
      { id: "a", category: "Main", title: "A" },
      { id: "t", category: "Main", title: "Target", dependencies: ["a"] },
    ]);
  });

  it("drops dependencyExpression terms that reference task IDs outside dependencies", async () => {
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
            dependencies: ["a"],
            dependencyExpression: [BooleanOp.Or, "a", "b"],
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(definition));
    const exportedDefinition = await exportChecklistDefinition();

    expect(exportedDefinition.tasksByCategory.Main).toEqual([
      { id: "a", category: "Main", title: "A" },
      { id: "b", category: "Main", title: "B" },
      {
        id: "t",
        category: "Main",
        title: "Target",
        dependencies: ["a"],
        dependencyExpression: "a",
      },
    ]);
  });

  it("normalizes imported state by dropping unknown and reminder completion", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["Main"],
      tasksByCategory: {
        Main: [
          {
            id: "normal",
            category: "Main",
            title: "Normal",
          },
          {
            id: "rem",
            category: "Main",
            title: "Reminder",
            type: "reminder",
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    const rawState: ExportedChecklistState = {
      tasks: {
        normal: { completed: true, explicitlyHidden: true },
        rem: { completed: true, explicitlyHidden: true },
        ghost: { completed: true, explicitlyHidden: true },
      },
      categoryVisibilityByMode: {
        task: {
          Main: true,
          GhostCategory: true,
        },
        edit: {
          Main: true,
          UnknownCategory: true,
        },
      },
    };

    await importChecklistDefinition(asJson(definition));
    await importChecklistState(asJson(rawState));

    const exportedState = await exportChecklistState();

    expect(exportedState).toEqual({
      tasks: {
        normal: { completed: true, explicitlyHidden: true },
      },
      categoryVisibilityByMode: {
        task: {
          Main: true,
        },
        edit: {
          Main: true,
        },
      },
    });
  });

  it("accepts legacy warning type and normalizes to reminder on export", async () => {
    const legacyDefinition: ExportedChecklistDefinition = {
      categories: ["Legacy"],
      tasksByCategory: {
        Legacy: [
          {
            id: "w1",
            category: "Legacy",
            title: "Legacy warning",
            type: "warning",
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(legacyDefinition));
    const exportedDefinition = await exportChecklistDefinition();

    expect(exportedDefinition.tasksByCategory).toEqual({
      Legacy: [
        {
          id: "w1",
          category: "Legacy",
          title: "Legacy warning",
          type: "reminder",
        },
      ],
    });
  });
});
