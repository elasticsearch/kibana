/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { normalizeIntegerRevision } from './normalize_integer_revision';

describe('normalizeIntegerRevision', () => {
  it.each([
    ['integer number', 3, 3],
    ['zero', 0, 0],
    ['max safe integer', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ['integer string', '3', 3],
  ])('accepts %s', (_label, value, expected) => {
    expect(normalizeIntegerRevision(value)).toBe(expected);
  });

  it.each([
    ['undefined', undefined],
    ['whitespace', '  '],
    ['trimmed integer string', ' 3 '],
    ['plus-signed integer string', '+3'],
    ['negative integer', -1],
    ['leading-zero integer string', '03'],
    ['float string', '2.0'],
    ['NaN', Number.NaN],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['overflow digit string', '9007199254740993'],
  ])('rejects %s', (_label, value) => {
    expect(normalizeIntegerRevision(value)).toBeUndefined();
  });
});
