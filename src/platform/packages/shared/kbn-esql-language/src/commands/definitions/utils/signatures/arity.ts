/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FunctionDefinition, FunctionParameter, Signature } from '../../types';
import { isConstantParameter } from './traits';

/** Finds which parameter a given argument position belongs to. */
export function getParamAtPosition(
  signature: Signature,
  position: number,
  options?: { repeat?: boolean }
): FunctionParameter | null {
  const { params } = signature;

  if (params.length > position) {
    return params[position];
  }

  if (options?.repeat) {
    return params[params.length - 1] ?? null;
  }

  return null;
}

/** Collects the parameter shapes allowed at one argument position across many signatures. */
export function getParamDefsAtPosition(
  signatures: Signature[],
  argIndex: number
): FunctionParameter[] {
  const seen = new Set<string>();
  const result: FunctionParameter[] = [];

  for (const sig of signatures) {
    const param = getParamAtPosition(sig, argIndex, { repeat: !!sig.minParams });

    if (!param) {
      continue;
    }

    const key = `${param.type}-${isConstantParameter(param)}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(param);
    }
  }

  return result;
}

/** Computes the smallest and largest valid arity for a group of signatures. */
export function getMaxMinNumberOfParams(signatures: Signature[]): { min: number; max: number } {
  if (signatures.length === 0) {
    return { min: 0, max: 0 };
  }

  let min = Infinity;
  let max = 0;

  for (const { params, minParams } of signatures) {
    min = Math.min(min, minParams ?? params.filter(({ optional }) => !optional).length);
    max = Math.max(max, minParams ? Infinity : params.length);
  }

  return { min, max };
}

/** Checks whether one signature accepts the current number of arguments. */
export function matchesArity(
  signature: FunctionDefinition['signatures'][number],
  arity: number
): boolean {
  if (signature.minParams) {
    return arity >= signature.minParams;
  }

  return (
    arity >= signature.params.filter(({ optional }) => !optional).length &&
    arity <= signature.params.length
  );
}
