import {
  BooleanOp,
  type BooleanExpression,
  type DependencyExpression,
  type TaskId,
} from "@/app/lib/data/types";

type NonNormalizedDependencyExpression = Omit<
  DependencyExpression,
  "expression"
> & {
  expression?: BooleanExpression | null;
};

/** Returns precedence used for infix rendering: leaf > NOT > AND > OR. */
export function getInfixExpressionPrecedence(
  expression: BooleanExpression,
): number {
  if (typeof expression === "string") {
    return 4;
  }

  const operator = expression[0];
  if (operator === BooleanOp.Not) {
    return 3;
  }

  return operator === BooleanOp.And ? 2 : 1;
}

/**
 * Normalizes an unknown boolean expression against an allowed dependency set.
 * Returns `null` when the expression cannot be represented after filtering.
 */
export function normalizeBooleanExpression(
  expression: unknown,
  dependencyIdSet: Set<TaskId>,
): BooleanExpression | null {
  if (typeof expression === "string") {
    return dependencyIdSet.has(expression) ? expression : null;
  }

  if (!Array.isArray(expression) || expression.length === 0) {
    return null;
  }

  const [operator, ...operands] = expression;
  if (operator === BooleanOp.Not) {
    if (operands.length !== 1) {
      return null;
    }
    const normalizedOperand = normalizeBooleanExpression(
      operands[0],
      dependencyIdSet,
    );
    return normalizedOperand ? [BooleanOp.Not, normalizedOperand] : null;
  }

  if (operator === BooleanOp.And || operator === BooleanOp.Or) {
    const normalizedOperands = operands
      .map((operand) => normalizeBooleanExpression(operand, dependencyIdSet))
      .filter((operand): operand is BooleanExpression => operand !== null);

    if (normalizedOperands.length === 0) {
      return null;
    }

    if (normalizedOperands.length === 1) {
      return normalizedOperands[0];
    }

    return [operator, ...normalizedOperands];
  }

  return null;
}

function areExpressionsEqual(
  left: BooleanExpression,
  right: BooleanExpression,
): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }

  if (left[0] !== right[0] || left.length !== right.length) {
    return false;
  }

  const leftOperands = left.slice(1) as BooleanExpression[];
  const rightOperands = right.slice(1) as BooleanExpression[];

  for (let index = 0; index < leftOperands.length; index += 1) {
    if (!areExpressionsEqual(leftOperands[index], rightOperands[index])) {
      return false;
    }
  }

  return true;
}

function isSimpleAndOfDependencies(
  expression: BooleanExpression,
  dependencies: Set<TaskId>,
): boolean {
  if (typeof expression === "string") {
    return false;
  }

  if (expression[0] !== BooleanOp.And) {
    return false;
  }

  const operands = expression.slice(1);
  if (
    !operands.every((operand): operand is TaskId => typeof operand === "string")
  ) {
    return false;
  }

  if (operands.length !== dependencies.size) {
    return false;
  }

  const operandSet = new Set(operands);
  if (operandSet.size !== operands.length) {
    return false;
  }

  for (const dependencyId of dependencies) {
    if (!operandSet.has(dependencyId)) {
      return false;
    }
  }

  return true;
}

/**
 * Normalizes and compacts a dependency-expression payload for persistence.
 * Removes empty/implicit expressions and drops simple implicit-AND equivalents.
 */
export function normalizeDependencyExpression(
  dependencyExpression: NonNormalizedDependencyExpression,
): DependencyExpression {
  const expression = dependencyExpression.expression;

  if (expression === undefined) {
    return dependencyExpression as DependencyExpression;
  }

  if (expression === null) {
    return { taskSet: dependencyExpression.taskSet };
  }

  const normalizedExpression = normalizeBooleanExpression(
    expression,
    dependencyExpression.taskSet,
  );

  if (normalizedExpression === null) {
    return { taskSet: dependencyExpression.taskSet };
  }

  if (
    isSimpleAndOfDependencies(
      normalizedExpression,
      dependencyExpression.taskSet,
    )
  ) {
    return { taskSet: dependencyExpression.taskSet };
  }

  if (areExpressionsEqual(normalizedExpression, expression)) {
    return dependencyExpression as DependencyExpression;
  }

  return {
    taskSet: dependencyExpression.taskSet,
    expression: normalizedExpression,
  };
}

/**
 * Builds the implicit dependency expression used for plain dependency sets.
 * Returns `null` for no dependencies and a task id for a single dependency.
 */
export function buildImplicitAndExpression(
  dependencyIds: TaskId[],
): BooleanExpression | null {
  if (dependencyIds.length === 0) {
    return null;
  }

  if (dependencyIds.length === 1) {
    return dependencyIds[0];
  }

  return [BooleanOp.And, ...dependencyIds];
}

/** Evaluates a boolean expression against the set of truthy task ids. */
export function evaluateBooleanExpression(
  expression: BooleanExpression | null | undefined,
  truthyTaskIds: Set<TaskId>,
  implicitAndTaskIds: Iterable<TaskId> = [],
): boolean {
  if (!expression) {
    return Array.from(implicitAndTaskIds).every((taskId) =>
      truthyTaskIds.has(taskId),
    );
  }

  if (typeof expression === "string") {
    return truthyTaskIds.has(expression);
  }

  const [operator, ...operands] = expression;

  if (operator === BooleanOp.Not) {
    return !evaluateBooleanExpression(operands[0], truthyTaskIds);
  }

  if (operator === BooleanOp.And) {
    if (operands.length === 0) {
      return true;
    }

    return operands.every((operand) =>
      evaluateBooleanExpression(operand, truthyTaskIds),
    );
  }

  if (operator === BooleanOp.Or) {
    if (operands.length === 0) {
      return true;
    }

    return operands.some((operand) =>
      evaluateBooleanExpression(operand, truthyTaskIds),
    );
  }

  return false;
}
