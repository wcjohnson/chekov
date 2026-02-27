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

export function getExpressionPrecedence(expression: BooleanExpression): number {
  if (typeof expression === "string") {
    return 4;
  }

  const operator = expression[0];
  if (operator === BooleanOp.Not) {
    return 3;
  }

  return operator === BooleanOp.And ? 2 : 1;
}

function normalizeExpressionToDependencies(
  expression: BooleanExpression,
  dependencyIdSet: Set<TaskId>,
): BooleanExpression | null {
  if (typeof expression === "string") {
    return dependencyIdSet.has(expression) ? expression : null;
  }

  const [operator, ...operands] = expression;
  if (operator === BooleanOp.Not) {
    const normalizedOperand = normalizeExpressionToDependencies(
      operands[0],
      dependencyIdSet,
    );
    return normalizedOperand ? [BooleanOp.Not, normalizedOperand] : null;
  }

  const normalizedOperands = operands
    .map((operand) =>
      normalizeExpressionToDependencies(operand, dependencyIdSet),
    )
    .filter((operand): operand is BooleanExpression => operand !== null);

  if (normalizedOperands.length === 0) {
    return null;
  }

  return [operator, ...normalizedOperands];
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

  const normalizedExpression = normalizeExpressionToDependencies(
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

export function evaluateBooleanExpression(
  expression: BooleanExpression,
  truthyTaskIds: Set<TaskId>,
): boolean {
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
