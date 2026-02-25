import { beforeEach, describe, expect, it } from "vitest";
import {
  exportChecklistDefinition,
  exportChecklistState,
  importChecklistDefinition,
  importChecklistState,
  type ExportedChecklistDefinition,
  type ExportedChecklistState,
} from "../../app/lib/export";

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

const roundTripFixtures: Array<{
  name: string;
  definition: ExportedChecklistDefinition;
  state: ExportedChecklistState;
}> = [
  {
    name: "single normal task",
    definition: {
      categories: ["Home"],
      tasksByCategory: {
        Home: [{ id: "t1", category: "Home", title: "Do laundry" }],
      },
      tagColors: {},
      categoryDependencies: {},
    },
    state: {
      tasks: {
        t1: { completed: true, explicitlyHidden: false },
      },
      categoryVisibilityByMode: {
        task: { Home: true },
        edit: {},
      },
    },
  },
  {
    name: "reminder, dependencies, tags, and category dependencies",
    definition: {
      categories: ["Core", "Later"],
      tasksByCategory: {
        Core: [
          {
            id: "a",
            category: "Core",
            title: "Setup",
            description: "Prepare environment",
            tags: ["infra", "critical"],
          },
          {
            id: "b",
            category: "Core",
            title: "Check status",
            type: "reminder",
            dependencies: ["a"],
            tags: ["critical"],
          },
        ],
        Later: [
          {
            id: "c",
            category: "Later",
            title: "Deploy",
            dependencies: ["a"],
            tags: ["release"],
          },
        ],
      },
      tagColors: {
        infra: "sky",
        critical: "red",
        release: "green",
      },
      categoryDependencies: {
        Later: ["a"],
      },
    },
    state: {
      tasks: {
        a: { completed: true, explicitlyHidden: false },
      },
      categoryVisibilityByMode: {
        task: { Core: true },
        edit: { Later: true },
      },
    },
  },
  {
    name: "multiple categories and non-empty descriptions",
    definition: {
      categories: ["Alpha", "Beta", "Gamma"],
      tasksByCategory: {
        Alpha: [
          {
            id: "x",
            category: "Alpha",
            title: "Design",
            description: "Initial draft",
          },
        ],
        Beta: [
          {
            id: "y",
            category: "Beta",
            title: "Review",
            dependencies: ["x"],
          },
        ],
        Gamma: [
          {
            id: "z",
            category: "Gamma",
            title: "Notify",
            type: "reminder",
            dependencies: ["y"],
            description: "Ping when done",
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {
        Gamma: ["y"],
      },
    },
    state: {
      tasks: {
        x: { completed: true, explicitlyHidden: false },
      },
      categoryVisibilityByMode: {
        task: { Alpha: true, Beta: true },
        edit: { Gamma: true },
      },
    },
  },
];

const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("import/export", () => {
  beforeEach(async () => {
    await importChecklistDefinition(asJson(EMPTY_DEFINITION));
    await importChecklistState(asJson(EMPTY_STATE));
  });

  it("exports an empty database as empty definition and empty state", async () => {
    const exportedDefinition = await exportChecklistDefinition();
    const exportedState = await exportChecklistState();

    expect(exportedDefinition).toEqual(EMPTY_DEFINITION);
    expect(exportedState).toEqual(EMPTY_STATE);
  });

  it.each(roundTripFixtures)(
    "round-trips import/export for $name",
    async ({ definition, state }) => {
      const jsonDefinition = asJson(definition);
      const jsonState = asJson(state);

      await importChecklistDefinition(jsonDefinition);
      await importChecklistState(jsonState);

      const exportedDefinition = await exportChecklistDefinition();
      const exportedState = await exportChecklistState();

      expect(exportedDefinition).toEqual(definition);
      expect(exportedState).toEqual(state);
    },
  );

  it("imports legacy warning type and exports it as reminder", async () => {
    const legacyDefinition: ExportedChecklistDefinition = {
      categories: ["Legacy"],
      tasksByCategory: {
        Legacy: [
          {
            id: "legacy-warning",
            category: "Legacy",
            title: "Legacy warning task",
            type: "warning",
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    await importChecklistDefinition(asJson(legacyDefinition));

    const exportedDefinition = await exportChecklistDefinition();
    expect(exportedDefinition.tasksByCategory.Legacy).toEqual([
      {
        id: "legacy-warning",
        category: "Legacy",
        title: "Legacy warning task",
        type: "reminder",
      },
    ]);
  });

  it("drops reminder task completion from imported state for legacy warning definitions", async () => {
    const legacyDefinition: ExportedChecklistDefinition = {
      categories: ["Legacy"],
      tasksByCategory: {
        Legacy: [
          {
            id: "legacy-warning",
            category: "Legacy",
            title: "Legacy warning task",
            type: "warning",
          },
          {
            id: "normal",
            category: "Legacy",
            title: "Normal task",
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    const importedState: ExportedChecklistState = {
      tasks: {
        "legacy-warning": { completed: true, explicitlyHidden: false },
        normal: { completed: true, explicitlyHidden: false },
      },
      categoryVisibilityByMode: {
        task: {},
        edit: {},
      },
    };

    await importChecklistDefinition(asJson(legacyDefinition));
    await importChecklistState(asJson(importedState));

    const exportedState = await exportChecklistState();

    expect(exportedState.tasks).toEqual({
      normal: { completed: true, explicitlyHidden: false },
    });
  });

  it("computes explicitlyHidden from task hidden state, not category visibility", async () => {
    const definition: ExportedChecklistDefinition = {
      categories: ["Main"],
      tasksByCategory: {
        Main: [
          {
            id: "t1",
            category: "Main",
            title: "Task one",
          },
          {
            id: "t2",
            category: "Main",
            title: "Task two",
          },
        ],
      },
      tagColors: {},
      categoryDependencies: {},
    };

    const importedState: ExportedChecklistState = {
      tasks: {
        t1: { completed: true, explicitlyHidden: false },
        t2: { completed: true, explicitlyHidden: true },
      },
      categoryVisibilityByMode: {
        task: { Main: true },
        edit: {},
      },
    };

    await importChecklistDefinition(asJson(definition));
    await importChecklistState(asJson(importedState));

    const exportedState = await exportChecklistState();

    expect(exportedState.tasks).toEqual({
      t1: { completed: true, explicitlyHidden: false },
      t2: { completed: true, explicitlyHidden: true },
    });
  });
});
