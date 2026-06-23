/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import dateMath from '@kbn/datemath';
import type { KueryNode } from '@kbn/es-query';
import { fromKueryExpression } from '@kbn/es-query';
import type {
  KqlFunctionNode,
  KqlLiteralNode,
  KqlWildcardNode,
} from '@kbn/es-query/src/kuery/node_types';
import { KQL_NODE_TYPE_WILDCARD, nodeTypes } from '@kbn/es-query/src/kuery/node_types';
import { parseJsPropertyAccess } from '@kbn/workflows/common/utils';

export function evaluateKql(kql: string, context: Record<string, any>): boolean {
  const kqlAst = fromKueryExpression(kql);
  return evaluateRecursive(kqlAst, context);
}

function evaluateRecursive(node: KueryNode, context: Record<string, any>): boolean {
  if (node.type === 'function') {
    const functionNode = node as KqlFunctionNode;

    switch (functionNode.function) {
      case 'and':
        return functionNode.arguments.every((arg) => evaluateRecursive(arg as KueryNode, context));
      case 'or':
        return functionNode.arguments.some((arg) => evaluateRecursive(arg as KueryNode, context));
      case 'not':
        return !evaluateRecursive(functionNode.arguments[0] as KueryNode, context);
      case 'range':
        return visitRange(functionNode, context);
      case 'is':
        return visitIs(functionNode, context);
      default:
        return false;
    }
  }

  return true;
}

function visitIs(node: KqlFunctionNode, context: Record<string, any>): boolean {
  const [leftLiteral, rightLiteral] = node.arguments as [KqlLiteralNode, unknown];
  const { value: contextValue, pathExists } = readContextPath(leftLiteral.value, context);

  if (!pathExists) {
    return false; // Path does not exist in context
  }

  if ((rightLiteral as KqlWildcardNode).type === KQL_NODE_TYPE_WILDCARD) {
    return isWildcardIsMatch(contextValue, rightLiteral as KqlWildcardNode);
  }

  return isExactIsMatch(contextValue, rightLiteral as KqlLiteralNode);
}

/**
 * KQL term equality for in-memory context: if the field is an array, any element may match
 * (aligned with multi-valued field semantics in Elasticsearch).
 */
function isExactIsMatch(contextValue: unknown, rightLiteral: KqlLiteralNode): boolean {
  if (Array.isArray(contextValue)) {
    return contextValue.some((element) => isExactIsMatch(element, rightLiteral));
  }

  try {
    return (
      contextValue ===
      convertLiteralToValue(rightLiteral, typeof contextValue as 'string' | 'number' | 'boolean')
    );
  } catch {
    return false;
  }
}

function isWildcardIsMatch(contextValue: unknown, rightLiteral: KqlWildcardNode): boolean {
  if (typeof contextValue === 'string') {
    return nodeTypes.wildcard.test(rightLiteral, contextValue);
  }

  if (Array.isArray(contextValue)) {
    return contextValue.some((element) => isWildcardIsMatch(element, rightLiteral));
  }

  if (
    typeof contextValue === 'number' ||
    typeof contextValue === 'boolean' ||
    typeof contextValue === 'bigint'
  ) {
    return nodeTypes.wildcard.test(rightLiteral, String(contextValue));
  }

  // Objects and other non-scalars: only "value present" semantics (e.g. `field:*`), not pattern match.
  return contextValue != null && contextValue !== undefined;
}

function visitRange(functionNode: KqlFunctionNode, context: Record<string, any>): boolean {
  const [leftRangeLiteral, operator, rightRangeLiteral] = functionNode.arguments as [
    KqlLiteralNode,
    string,
    KqlLiteralNode
  ];

  const { value: leftRangeValue, pathExists } = readContextPath(leftRangeLiteral.value, context);

  if (!pathExists) {
    return false; // Path does not exist in context
  }

  if (Array.isArray(leftRangeValue)) {
    return leftRangeValue.some((element) =>
      compareRangeScalar(element, operator, rightRangeLiteral)
    );
  }

  return compareRangeScalar(leftRangeValue, operator, rightRangeLiteral);
}

function compareRangeScalar(
  leftRangeValue: unknown,
  operator: string,
  rightRangeLiteral: KqlLiteralNode
): boolean {
  let rightRangeValue: string | number | boolean;

  try {
    rightRangeValue = convertLiteralToValue(
      rightRangeLiteral,
      typeof leftRangeValue as 'string' | 'number' | 'boolean'
    );
  } catch {
    return false;
  }

  const left = leftRangeValue as string | number | boolean;

  switch (operator) {
    case 'gte':
      return left >= rightRangeValue;
    case 'lte':
      return left <= rightRangeValue;
    case 'gt':
      return left > rightRangeValue;
    case 'lt':
      return left < rightRangeValue;
    default:
      throw new Error(`Unsupported range operator: ${operator}`);
  }
}

function readContextPath(
  propertyPath: any,
  context: Record<string, any>
): { pathExists: boolean; value: any } {
  const strPropertyPath = String(propertyPath); // sometimes it could be boolean or number
  const propertyPathSegments = parseJsPropertyAccess(strPropertyPath);
  let result: any = context;

  for (const segment of propertyPathSegments) {
    // A path segment can only be read from an object. When an intermediate
    // value is a scalar/null/undefined (e.g. `a.b` where `a` resolved to a
    // string, or to `undefined` because the referenced step output is absent),
    // the next segment does not exist — treat it as "not found" rather than
    // letting `segment in result` throw `TypeError: Cannot use 'in' operator`.
    // KQL term semantics: a field path that does not resolve is simply false.
    if (result === null || typeof result !== 'object' || !(segment in result)) {
      return { pathExists: false, value: undefined }; // Path not found in context
    }

    result = result[segment];
  }

  return { pathExists: true, value: result };
}

function isDateMathExpression(value: string): boolean {
  return value.startsWith('now') || value.includes('||');
}

function convertLiteralToValue(
  node: KqlLiteralNode,
  expectedType: 'string' | 'number' | 'boolean'
): any {
  switch (expectedType) {
    case 'string': {
      const strValue = String(node.value);
      if (isDateMathExpression(strValue)) {
        const parsed = dateMath.parse(strValue);
        if (parsed?.isValid()) {
          return parsed.toISOString();
        }
      }

      return strValue;
    }
    case 'number':
      return parseFloat(node.value as string);
    case 'boolean':
      return String(node.value) === 'true';
    default:
      throw new Error(`Unsupported type: ${expectedType}`);
  }
}
