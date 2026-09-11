/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { assertUnboundedStringReason, getStringHelperLimits } from './limits';

test.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid maximum length %s',
  (maxLength) => {
    expect(() => getStringHelperLimits('description', { maxLength })).toThrow();
  }
);

test.each([NaN, Infinity, -1, 1.5])('rejects invalid minimum length %s', (minLength) => {
  expect(() => getStringHelperLimits('description', { minLength })).toThrow();
});

test('rejects contradictory limits', () => {
  expect(() => getStringHelperLimits('savedObjectId', { minLength: 3, maxLength: 2 })).toThrow();
});

test('allows empty-only strings and finite overrides', () => {
  expect(getStringHelperLimits('description', { maxLength: 0 })).toEqual({
    minLength: 0,
    maxLength: 0,
  });
  expect(getStringHelperLimits('savedObjectId', { maxLength: 1024 })).toEqual({
    minLength: 1,
    maxLength: 1024,
  });
});

test('requires a nonempty explanation', () => {
  expect(() => assertUnboundedStringReason('  ')).toThrow();
  expect(() => assertUnboundedStringReason('Enforced upstream')).not.toThrow();
});
