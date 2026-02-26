import {
  BooleanOp,
  type BooleanExpression,
  type TaskId,
} from "@/app/lib/data/types";

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

export function normalizeExpressionToDependencies(
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
