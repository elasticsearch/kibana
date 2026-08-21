/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  POLICY_CHANGE_BOUNDS_MESSAGE,
  POLICY_CHANGE_PREPARATION_ERROR_CODE,
  PolicyChangePreparationError,
} from './policy_change_operation';

export const MAX_SERIALIZED_BYTES = 65536;
export const MAX_NESTING_DEPTH = 16;

const isWalkable = (value: unknown): value is object =>
  value !== null && Object.prototype.toString.call(value) === '[object Object]';

const nestingDepth = (value: unknown, depth: number, seen: WeakSet<object>): number => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new PolicyChangePreparationError(
        POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
        POLICY_CHANGE_BOUNDS_MESSAGE
      );
    }
    seen.add(value);
    const childDepth = value.reduce(
      (max, child) => Math.max(max, nestingDepth(child, depth + 1, seen)),
      depth
    );
    seen.delete(value);
    return childDepth;
  }

  if (!isWalkable(value)) {
    return depth;
  }

  if (seen.has(value)) {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
      POLICY_CHANGE_BOUNDS_MESSAGE
    );
  }

  seen.add(value);
  const childDepth = Object.values(value).reduce(
    (max, child) => Math.max(max, nestingDepth(child, depth + 1, seen)),
    depth
  );
  seen.delete(value);
  return childDepth;
};

const serializedByteLength = (value: unknown): number => {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
      POLICY_CHANGE_BOUNDS_MESSAGE
    );
  }
};

export const assertParameterBounds = (value: unknown): void => {
  if (nestingDepth(value, 1, new WeakSet()) > MAX_NESTING_DEPTH) {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
      POLICY_CHANGE_BOUNDS_MESSAGE
    );
  }

  if (serializedByteLength(value) > MAX_SERIALIZED_BYTES) {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
      POLICY_CHANGE_BOUNDS_MESSAGE
    );
  }
};
