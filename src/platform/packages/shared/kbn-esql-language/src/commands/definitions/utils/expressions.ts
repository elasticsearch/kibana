/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { uniq } from 'lodash';
import {
  isColumn,
  isFunctionExpression,
  isInlineCast,
  isLiteral,
  isParamLiteral,
  isSubQuery,
  lastItem,
  type PromQLAstExpression,
} from '@elastic/esql';
import type { ESQLAstItem, ESQLFunction, ESQLSingleAstItem } from '@elastic/esql/types';
import type { InlineCastingType, PromQLFunctionParamType, SupportedDataType } from '../types';
import {
  getFunctionDefinition,
  getFunctionForInlineCast,
  isTypeConversionFunction,
} from './functions';
import { getMatchingSignatures } from './signatures';
import { getColumnForASTNode } from './shared';
import type { ESQLColumnData } from '../../registry/types';
import { UnmappedFieldsStrategy } from '../../registry/types';
import { inOperators } from '../all_operators';
import { TIME_SYSTEM_PARAMS } from './literals';
import { getUnmappedFieldType } from './settings';
import { getPromqlFunctionDefinition } from './promql';

// #region type detection

/**
 * Determines the type of the expression
 * @param root The root AST node of the expression
 * @param columns Optional map of available columns to resolve column types
 * @param unmappedFieldsStrategy Strategy to handle unmapped fields, it's only relevant if columns maps is provided
 * @returns The determined type or 'unknown' if it cannot be determined
 */
export function getExpressionType(
  root: ESQLAstItem | undefined,
  columns?: Map<string, ESQLColumnData>,
  unmappedFieldsStrategy: UnmappedFieldsStrategy = UnmappedFieldsStrategy.DEFAULT
): SupportedDataType | 'unknown' {
  if (!root) {
    return 'unknown';
  }

  if (Array.isArray(root)) {
    if (root.length === 0) {
      return 'unknown';
    }
    return getExpressionType(root[0], columns, unmappedFieldsStrategy);
  }

  if (isLiteral(root)) {
    if (root.literalType === 'param' && TIME_SYSTEM_PARAMS.includes(root.text)) {
      return 'keyword';
    }
    return root.literalType;
  }

  if (isInlineCast(root)) {
    const castFunction = getFunctionForInlineCast(root.castType as InlineCastingType);
    if (!castFunction) {
      return 'unknown';
    }

    const fnDef = getFunctionDefinition(castFunction);
    if (!fnDef || fnDef.signatures.length === 0) {
      return 'unknown';
    }

    return fnDef.signatures[0].returnType;
  }

  if (isColumn(root) && columns) {
    const column = getColumnForASTNode(root, { columns });
    const lastArg = lastItem(root.args);
    // If the last argument is a param, we return its type (param literal type)
    // This is useful for cases like `where ??field`
    if (isParamLiteral(lastArg)) {
      return lastArg.literalType;
    }

    if (!column) {
      return getUnmappedFieldType(unmappedFieldsStrategy);
    }
    if ('hasConflict' in column && column.hasConflict) {
      return 'unknown';
    }
    return column.type;
  }

  if (root.type === 'list') {
    return getExpressionType(root.values[0], columns, unmappedFieldsStrategy);
  }

  if (root.type === 'map') {
    return 'function_named_parameters';
  }

  if (isFunctionExpression(root)) {
    const fnDefinition = getFunctionDefinition(root.name);
    if (!fnDefinition) {
      return 'unknown';
    }

    /**
     * Special case for COUNT(*) because
     * the "*" column doesn't match any
     * of COUNT's function definitions
     */
    if (
      fnDefinition.name === 'count' &&
      root.args[0] &&
      isColumn(root.args[0]) &&
      root.args[0].name === '*'
    ) {
      return 'long';
    }

    if (fnDefinition.name === 'case' && root.args.length) {
      /**
       * The CASE function doesn't fit our system of function definitions
       * and needs special handling. This is imperfect, but it's a start because
       * at least we know that the final argument to case will never be a conditional
       * expression, always a result expression.
       *
       * One problem with this is that if a elseValue is not provided, the return type
       * will be null, which we aren't detecting. But this is ok because we consider
       * userDefinedColumns and fields to be nullable anyways and account for that during validation.
       */
      return getExpressionType(root.args[root.args.length - 1], columns, unmappedFieldsStrategy);
    }

    const rightArg = root.args[1];
    if (
      inOperators.some(({ name }) => name === fnDefinition.name) &&
      !Array.isArray(rightArg) &&
      isSubQuery(rightArg)
    ) {
      return 'boolean';
    }

    const { argTypes, literalMask } = resolveArgumentTypes(root.args, {
      columns,
      unmappedFieldsStrategy,
    });
    const matchingSignatures = getMatchingSignatures(
      fnDefinition.signatures,
      argTypes,
      literalMask,
      isTypeConversionFunction(fnDefinition.name)
    );

    if (matchingSignatures.length > 0 && argTypes.includes('null')) {
      // if one of the arguments is null, the return type is null.
      // this is true for most (all?) functions in ES|QL
      // though it is not reflected in our function definitions
      // so we handle it here
      return 'null';
    }

    const returnTypes = uniq(matchingSignatures.map((sig) => sig.returnType));

    // no signature matched the provided arguments
    if (returnTypes.length === 0) return 'unknown';

    // ambiguous return type (i.e. we can't always identify the true
    // matching signature because we don't always know the types of the parameters)
    if (returnTypes.length > 1) return 'unknown';

    if (returnTypes[0] === 'any') {
      return 'unknown';
    }

    return returnTypes[0];
  }

  return 'unknown';
}

// #endregion type detection

// #region argument resolution

export function resolveArgumentTypes(
  args: ESQLAstItem[],
  options?: {
    columns?: Map<string, ESQLColumnData>;
    unmappedFieldsStrategy?: UnmappedFieldsStrategy;
  }
): { argTypes: (SupportedDataType | 'unknown')[]; literalMask: boolean[] } {
  const { columns, unmappedFieldsStrategy } = options ?? {};

  return {
    argTypes: args.map((arg) => getExpressionType(arg, columns, unmappedFieldsStrategy)),
    literalMask: args.map((arg) => {
      const unwrapped = Array.isArray(arg) ? arg[0] : arg;

      return isLiteral(unwrapped);
    }),
  };
}

// #endregion argument resolution

// #region expression completeness

/**
 * Builds a regex that matches partial strings starting
 * from the beginning of the string.
 *
 * Example:
 * "is null" -> /^i(?:s(?:\s+(?:n(?:u(?:l(?:l)?)?)?)?)?)?$/i
 */
export function buildPartialMatcher(str: string) {
  // Split the string into characters
  const chars = str.split('');

  // Initialize the regex pattern
  let pattern = '';

  // Iterate through the characters and build the pattern
  chars.forEach((char, index) => {
    if (char === ' ') {
      pattern += '\\s+';
    } else {
      pattern += char;
    }
    if (index < chars.length - 1) {
      pattern += '(?:';
    }
  });

  // Close the non-capturing groups
  for (let i = 0; i < chars.length - 1; i++) {
    pattern += ')?';
  }

  // Return the final regex pattern
  return pattern;
}

// Handles: "IS ", "IS N", "IS NU", "IS NUL" with flexible whitespace
const isNullMatcher = new RegExp('is\\s*(' + buildPartialMatcher('nul') + ')?$', 'i');
const isNotNullMatcher = new RegExp('is\\s*(' + buildPartialMatcher('not nul') + ')?$', 'i');

// --- Expression types helpers ---

/**
 * Checks whether an expression is truly complete.
 *
 * (Encapsulates handling of the "is null" and "is not null"
 * checks)
 *
 * @todo use the simpler "getExpressionType(root) !== 'unknown'"
 * as soon as https://github.com/elastic/kibana/issues/199401 is resolved
 */
export function isExpressionComplete(
  expressionType: SupportedDataType | 'unknown',
  innerText: string
) {
  if (expressionType === 'unknown') {
    return false;
  }

  // Check for incomplete IS NULL / IS NOT NULL
  if (isNullMatcher.test(innerText) || isNotNullMatcher.test(innerText)) {
    return false;
  }

  return true;
}

// #endregion expression completeness

/**
 * Returns the left or right operand of a binary expression function.
 */
export function getBinaryExpressionOperand(
  binaryExpression: ESQLFunction,
  side: 'left' | 'right'
): ESQLSingleAstItem | ESQLSingleAstItem[] | undefined {
  const left = binaryExpression.args[0] as ESQLSingleAstItem | ESQLSingleAstItem[] | undefined;
  const right = binaryExpression.args[1] as ESQLSingleAstItem | ESQLSingleAstItem[] | undefined;

  return side === 'left' ? left : right;
}

/**
 * Extracts a valid expression root from an assignment, handling array operands.
 */
export function getAssignmentExpressionRoot(
  assignment: ESQLFunction
): ESQLSingleAstItem | undefined {
  const rhs = getBinaryExpressionOperand(assignment, 'right');
  const root = Array.isArray(rhs) ? rhs[0] : rhs;

  if (!root) {
    return undefined;
  }

  return root;
}

export function getPromqlExpressionType(
  expression: PromQLAstExpression
): PromQLFunctionParamType | undefined {
  switch (expression.type) {
    case 'selector':
      return expression.duration ? 'range_vector' : 'instant_vector';
    case 'subquery':
      return 'range_vector';
    case 'literal':
      return expression.literalType === 'string' ? 'string' : 'scalar';
    case 'parens':
      return getPromqlExpressionType(expression.child);
    case 'unary-expression':
      return getPromqlExpressionType(expression.arg);
    case 'function':
      return getPromqlFunctionDefinition(expression.name)?.signatures[0]?.returnType;
    case 'binary-expression': {
      const bothScalar =
        getPromqlExpressionType(expression.left) === 'scalar' &&
        getPromqlExpressionType(expression.right) === 'scalar';

      return bothScalar ? 'scalar' : 'instant_vector';
    }
  }
}
