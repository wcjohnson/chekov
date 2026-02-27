import { describe, expect, it } from "vitest";
import { BooleanOp, type BooleanExpression } from "../../app/lib/data/types";
import { evaluateBooleanExpression } from "../../app/lib/booleanExpression";

describe("evaluateBooleanExpression", () => {
  it("evaluates a task-id leaf from truthy set membership", () => {
    expect(evaluateBooleanExpression("a", new Set(["a"]))).toBe(true);
    expect(evaluateBooleanExpression("b", new Set(["a"]))).toBe(false);
  });

  it("evaluates NOT expressions", () => {
    const expression: BooleanExpression = [BooleanOp.Not, "a"];

    expect(evaluateBooleanExpression(expression, new Set(["a"]))).toBe(false);
    expect(evaluateBooleanExpression(expression, new Set(["b"]))).toBe(true);
  });

  it("evaluates AND expressions", () => {
    const expression: BooleanExpression = [BooleanOp.And, "a", "b", "c"];

    expect(
      evaluateBooleanExpression(expression, new Set(["a", "b", "c"])),
    ).toBe(true);
    expect(evaluateBooleanExpression(expression, new Set(["a", "b"]))).toBe(
      false,
    );
  });

  it("evaluates OR expressions", () => {
    const expression: BooleanExpression = [BooleanOp.Or, "a", "b", "c"];

    expect(evaluateBooleanExpression(expression, new Set(["b"]))).toBe(true);
    expect(evaluateBooleanExpression(expression, new Set(["x", "y"]))).toBe(
      false,
    );
  });

  it("evaluates empty AND as true", () => {
    const expression: BooleanExpression = [BooleanOp.And];

    expect(evaluateBooleanExpression(expression, new Set())).toBe(true);
    expect(
      evaluateBooleanExpression(expression, new Set(["a", "b", "c"])),
    ).toBe(true);
  });

  it("evaluates empty OR as true", () => {
    const expression: BooleanExpression = [BooleanOp.Or];

    expect(evaluateBooleanExpression(expression, new Set())).toBe(true);
    expect(
      evaluateBooleanExpression(expression, new Set(["a", "b", "c"])),
    ).toBe(true);
  });

  it("evaluates nested mixed expressions", () => {
    const expression: BooleanExpression = [
      BooleanOp.And,
      [BooleanOp.Or, "a", "b"],
      [BooleanOp.Not, "c"],
      [BooleanOp.Or, [BooleanOp.And, "d", "e"], "f"],
    ];

    expect(
      evaluateBooleanExpression(expression, new Set(["b", "d", "e"])),
    ).toBe(true);
    expect(
      evaluateBooleanExpression(expression, new Set(["a", "c", "d", "e"])),
    ).toBe(false);
    expect(evaluateBooleanExpression(expression, new Set(["a", "f"]))).toBe(
      true,
    );
  });

  it("supports reminder-like transitive-style dependency expression shape", () => {
    const reminderDeps: BooleanExpression = [
      BooleanOp.And,
      "dep-1",
      [BooleanOp.Or, "dep-2", "dep-3"],
    ];

    expect(
      evaluateBooleanExpression(reminderDeps, new Set(["dep-1", "dep-3"])),
    ).toBe(true);
    expect(
      evaluateBooleanExpression(reminderDeps, new Set(["dep-2", "dep-3"])),
    ).toBe(false);
  });

  it("treats null/undefined expression as implicit AND over supplied dependencies", () => {
    expect(
      evaluateBooleanExpression(null, new Set(["a", "b"]), new Set(["a", "b"])),
    ).toBe(true);
    expect(
      evaluateBooleanExpression(undefined, new Set(["a"]), new Set(["a", "b"])),
    ).toBe(false);
  });

  it("treats null/undefined expression with no dependency list as true", () => {
    expect(evaluateBooleanExpression(null, new Set())).toBe(true);
    expect(evaluateBooleanExpression(undefined, new Set(["a"]))).toBe(true);
  });
});
