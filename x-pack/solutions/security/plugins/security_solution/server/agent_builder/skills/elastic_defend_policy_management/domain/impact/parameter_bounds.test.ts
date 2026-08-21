/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MAX_NESTING_DEPTH, MAX_SERIALIZED_BYTES, assertParameterBounds } from './parameter_bounds';
import {
  POLICY_CHANGE_BOUNDS_MESSAGE,
  POLICY_CHANGE_PREPARATION_ERROR_CODE,
  PolicyChangePreparationError,
} from './policy_change_operation';

const expectBoundsError = (value: unknown): void => {
  try {
    assertParameterBounds(value);
    throw new Error('expected bounds to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(PolicyChangePreparationError);
    expect((error as PolicyChangePreparationError).code).toBe(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input
    );
    expect((error as PolicyChangePreparationError).message).toBe(POLICY_CHANGE_BOUNDS_MESSAGE);
  }
};

const objectOfDepth = (depth: number): unknown => {
  let current: unknown = {};
  for (let level = 2; level <= depth; level++) {
    current = { child: current };
  }
  return current;
};

const stringWhoseJsonBytes = (bytes: number): string => 'a'.repeat(bytes - 2);

describe('parameter bounds', () => {
  it('accepts nesting depth at the boundary and rejects one deeper', () => {
    expect(() => assertParameterBounds(objectOfDepth(MAX_NESTING_DEPTH))).not.toThrow();
    expectBoundsError(objectOfDepth(MAX_NESTING_DEPTH + 1));
  });

  it('accepts serialized bytes at the boundary and rejects one more', () => {
    expect(() => assertParameterBounds(stringWhoseJsonBytes(MAX_SERIALIZED_BYTES))).not.toThrow();
    expectBoundsError(stringWhoseJsonBytes(MAX_SERIALIZED_BYTES + 1));
  });
});
