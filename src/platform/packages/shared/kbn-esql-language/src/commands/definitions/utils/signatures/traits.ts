/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FunctionParameter, Signature } from '../../types';

/** Detects whether a parameter only accepts constant values. */
export const isConstantParameter = (param: FunctionParameter): boolean =>
  param.hint?.kind === 'constant';

/** Detects signatures where all parameters are expected to stay on the same type family. */
export function areParamsHomogeneous(signatures: Signature[]): boolean {
  return signatures.every((sig) => {
    const isVariadicSig = sig.minParams != null;

    if (!isVariadicSig && sig.params.length < 2) {
      return false;
    }

    const firstParamType = sig.params[0]?.type;

    if (!firstParamType || firstParamType === 'any') {
      return false;
    }

    return sig.params.every((param) => {
      if (param.type === firstParamType) {
        return true;
      }

      if (
        (firstParamType === 'keyword' || firstParamType === 'text') &&
        (param.type === 'keyword' || param.type === 'text')
      ) {
        return true;
      }

      return false;
    });
  });
}

/** Detects whether at least one signature is variadic. */
export function hasVariadicSignature(signatures: Signature[]): boolean {
  return signatures.some((sig) => sig.minParams != null);
}

/** Detects repeating signatures such as `CASE(condition, value, condition, value, ...)`. */
export function hasRepeatingSignature(signatures: Signature[]): boolean {
  return signatures.some(({ isSignatureRepeating }) => isSignatureRepeating);
}

/**
 * Detects signatures that are meant to accept full expressions, not only simple values.
 *
 * Example: `CASE` mixes boolean conditions with result expressions.
 */
export function hasArbitraryExpressionSignature(signatures: Signature[]): boolean {
  if (!signatures || signatures.length === 0) {
    return false;
  }

  return signatures.some(({ minParams, returnType, params }) => {
    const isVariadicWithMultipleParams = minParams != null && minParams >= 2;
    const hasUnknownReturn = returnType === 'unknown';
    const hasMixedBooleanAndAny =
      params.some(({ type }) => type === 'boolean') && params.some(({ type }) => type === 'any');

    return isVariadicWithMultipleParams && hasUnknownReturn && hasMixedBooleanAndAny;
  });
}

/** Detects whether a function family can start with a boolean parameter. */
export function hasBooleanSignature(signatures: Signature[]): boolean {
  return signatures.some((sig) => sig.params.length > 0 && sig.params[0].type === 'boolean');
}
