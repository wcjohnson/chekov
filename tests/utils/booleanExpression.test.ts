import { describe, expect, it } from "vitest";
import { BooleanOp, type BooleanExpression } from "../../app/lib/types";
import {
  buildImplicitAndExpression,
  getExpressionPrecedence,
  normalizeExpressionToDependencies,
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

describe("normalizeExpressionToDependencies", () => {
  it("keeps a primitive dependency that exists", () => {
    expect(normalizeExpressionToDependencies("a", new Set(["a", "b"]))).toBe(
      "a",
    );
  });

  it("drops a primitive dependency that does not exist", () => {
    expect(normalizeExpressionToDependencies("missing", new Set(["a"]))).toBe(
      null,
    );
  });

  it("returns null for NOT when its operand is removed", () => {
    const expression: BooleanExpression = [BooleanOp.Not, "missing"];

    expect(normalizeExpressionToDependencies(expression, new Set(["a"]))).toBe(
      null,
    );
  });

  it("keeps NOT when its operand remains valid", () => {
    const expression: BooleanExpression = [BooleanOp.Not, "a"];

    expect(
      normalizeExpressionToDependencies(expression, new Set(["a"])),
    ).toEqual([BooleanOp.Not, "a"]);
  });

  it("filters invalid operands from AND and keeps valid ones", () => {
    const expression: BooleanExpression = [BooleanOp.And, "a", "missing", "b"];

    expect(
      normalizeExpressionToDependencies(expression, new Set(["a", "b"])),
    ).toEqual([BooleanOp.And, "a", "b"]);
  });

  it("returns null when all AND operands are filtered out", () => {
    const expression: BooleanExpression = [BooleanOp.And, "x", "y"];

    expect(normalizeExpressionToDependencies(expression, new Set(["a"]))).toBe(
      null,
    );
  });

  it("filters invalid operands from OR and keeps valid ones", () => {
    const expression: BooleanExpression = [BooleanOp.Or, "x", "a", "y"];

    expect(
      normalizeExpressionToDependencies(expression, new Set(["a"])),
    ).toEqual([BooleanOp.Or, "a"]);
  });

  it("normalizes nested expressions recursively", () => {
    const expression: BooleanExpression = [
      BooleanOp.And,
      [BooleanOp.Or, "a", "x"],
      [BooleanOp.Not, "b"],
      [BooleanOp.And, "y", "z"],
    ];

    expect(
      normalizeExpressionToDependencies(expression, new Set(["a", "b"])),
    ).toEqual([BooleanOp.And, [BooleanOp.Or, "a"], [BooleanOp.Not, "b"]]);
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
