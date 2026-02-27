import { describe, expect, it } from "vitest";
import {
  BooleanOp,
  type BooleanExpression,
  type DependencyExpression,
} from "../../app/lib/data/types";
import {
  buildImplicitAndExpression,
  getExpressionPrecedence,
  normalizeDependencyExpression,
} from "../../app/lib/booleanExpression";

describe("getExpressionPrecedence", () => {
  it("returns highest precedence for task-id leaf", () => {
    expect(getExpressionPrecedence("task-1")).toBe(4);
  });

  it("returns NOT above AND above OR", () => {
    expect(getExpressionPrecedence([BooleanOp.Not, "task-1"])).toBe(3);
    expect(getExpressionPrecedence([BooleanOp.And, "a", "b"])).toBe(2);
    expect(getExpressionPrecedence([BooleanOp.Or, "a", "b"])).toBe(1);
  });
});

describe("normalizeDependencyExpression", () => {
  it("returns the same object when no expression exists", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a", "b"]),
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toBe(
      dependencyExpression,
    );
  });

  it("treats null expression as omitted", () => {
    expect(
      normalizeDependencyExpression({
        taskSet: new Set(["a", "b"]),
        expression: null,
      }),
    ).toEqual({
      taskSet: new Set(["a", "b"]),
    });
  });

  it("returns the same object when expression is already valid", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a", "b"]),
      expression: [BooleanOp.Or, "a", "b"],
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toBe(
      dependencyExpression,
    );
  });

  it("drops invalid primitive expression and omits expression field", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a"]),
      expression: "missing",
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toEqual({
      taskSet: new Set(["a"]),
    });
  });

  it("drops NOT when its operand is removed", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a"]),
      expression: [BooleanOp.Not, "missing"],
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toEqual({
      taskSet: new Set(["a"]),
    });
  });

  it("keeps NOT when its operand remains valid", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a"]),
      expression: [BooleanOp.Not, "a"],
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toBe(
      dependencyExpression,
    );
  });

  it("filters invalid operands from AND and keeps valid ones", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a", "b"]),
      expression: [BooleanOp.And, "a", "missing", "b"],
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toEqual({
      taskSet: new Set(["a", "b"]),
    });
  });

  it("omits expression when it is a simple AND of dependencies", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a", "b"]),
      expression: [BooleanOp.And, "a", "b"],
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toEqual({
      taskSet: new Set(["a", "b"]),
    });
  });

  it("omits expression when all AND operands are filtered out", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a"]),
      expression: [BooleanOp.And, "x", "y"],
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toEqual({
      taskSet: new Set(["a"]),
    });
  });

  it("filters invalid operands from OR and keeps valid ones", () => {
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a"]),
      expression: [BooleanOp.Or, "x", "a", "y"],
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toEqual({
      taskSet: new Set(["a"]),
      expression: [BooleanOp.Or, "a"],
    });
  });

  it("normalizes nested expressions recursively", () => {
    const expression: BooleanExpression = [
      BooleanOp.And,
      [BooleanOp.Or, "a", "x"],
      [BooleanOp.Not, "b"],
      [BooleanOp.And, "y", "z"],
    ];
    const dependencyExpression: DependencyExpression = {
      taskSet: new Set(["a", "b"]),
      expression,
    };

    expect(normalizeDependencyExpression(dependencyExpression)).toEqual({
      taskSet: new Set(["a", "b"]),
      expression: [BooleanOp.And, [BooleanOp.Or, "a"], [BooleanOp.Not, "b"]],
    });
  });
});

describe("buildImplicitAndExpression", () => {
  it("returns null for no dependencies", () => {
    expect(buildImplicitAndExpression([])).toBeNull();
  });

  it("returns a single task id for one dependency", () => {
    expect(buildImplicitAndExpression(["a"])).toBe("a");
  });

  it("returns AND expression for multiple dependencies in order", () => {
    expect(buildImplicitAndExpression(["a", "b", "c"])).toEqual([
      BooleanOp.And,
      "a",
      "b",
      "c",
    ]);
  });
});
