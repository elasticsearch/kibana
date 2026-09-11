/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expectType } from 'tsd';
import {
  z,
  savedObjectId,
  savedObjectType,
  savedObjectVersion,
  spaceId,
  displayName,
  description,
  searchFilter,
  aggregation,
  querySortField,
  unboundedString,
} from '..';
import { reportStringLengthViolation } from '@kbn/schema-string-helpers';

jest.mock('@kbn/schema-string-helpers', () => ({
  ...jest.requireActual('@kbn/schema-string-helpers'),
  reportStringLengthViolation: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe.each([
  ['savedObjectId', savedObjectId, 1, 512],
  ['savedObjectType', savedObjectType, 0, 256],
  ['savedObjectVersion', savedObjectVersion, 0, 256],
  ['spaceId', spaceId, 1, 512],
  ['displayName', displayName, 1, 1024],
  ['description', description, 0, 10000],
  ['searchFilter', searchFilter, 0, 10000],
  ['aggregation', aggregation, 0, 100000],
  ['querySortField', querySortField, 0, 256],
] as const)('%s', (name, helper, minLength, maxLength) => {
  test('enforces the default boundaries and string type', () => {
    const strict = helper();
    expect(strict.parse('x'.repeat(maxLength))).toHaveLength(maxLength);
    expect(() => strict.parse('x'.repeat(maxLength + 1))).toThrow();
    expect(() => strict.parse(42)).toThrow();
    expect(() => strict.parse(undefined)).toThrow();
    if (minLength > 0) {
      expect(() => strict.parse('')).toThrow();
    } else {
      expect(strict.parse('')).toBe('');
    }
    expect(reportStringLengthViolation).not.toHaveBeenCalled();
  });

  test('reports only values above the limit and keeps minimum length validation', () => {
    const reporting = helper.warn({ label: 'dashboard.panelId' });
    expect(reporting.parse('x'.repeat(maxLength))).toHaveLength(maxLength);
    expect(reportStringLengthViolation).not.toHaveBeenCalled();
    expect(reporting.parse('x'.repeat(maxLength + 1))).toHaveLength(maxLength + 1);
    expect(reportStringLengthViolation).toHaveBeenCalledTimes(1);
    expect(reportStringLengthViolation).toHaveBeenCalledWith({
      helper: name,
      library: 'zod',
      maxLength,
      length: maxLength + 1,
      label: 'dashboard.panelId',
    });
    expect(() => reporting.parse(42)).toThrow();
    if (minLength > 0) {
      expect(() => reporting.parse('')).toThrow();
    }
  });

  test('uses overrides in both enforcing and reporting modes', () => {
    expect(() => helper({ maxLength: 3 }).parse('four')).toThrow();
    expect(helper.warn({ maxLength: 3 }).parse('four')).toBe('four');
    expect(reportStringLengthViolation).toHaveBeenCalledWith(
      expect.objectContaining({ maxLength: 3 })
    );
    expect(() => helper.warn({ minLength: 3 }).parse('ab')).toThrow();
    expect(helper({ minLength: 0 }).parse('')).toBe('');
    expect(() => helper({ maxLength: undefined }).parse('x'.repeat(maxLength + 1))).toThrow();
  });

  test('creates reporting schemas without changing strict schemas or future defaults', () => {
    const strict = helper();
    expect(strict.parse('abc')).toBe('abc');
    expect(helper.warn().parse('x'.repeat(maxLength + 1))).toHaveLength(maxLength + 1);
    expect(() => strict.parse('x'.repeat(maxLength + 1))).toThrow();
    expect(() => helper().parse('x'.repeat(maxLength + 1))).toThrow();
  });
});

describe('unboundedString', () => {
  test.each(['', '  ', '\n\t'])('rejects an empty reason %j at definition time', (reason) => {
    expect(() => unboundedString({ reason })).toThrow('requires a non-empty reason');
  });

  test('accepts large strings, preserves minimum length and validates the input type', () => {
    const unbounded = unboundedString({
      reason: 'Size is enforced upstream',
      minLength: 1,
    });
    expect(unbounded.parse('x'.repeat(200_000))).toHaveLength(200_000);
    expect(() => unbounded.parse('')).toThrow();
    expect(() => unbounded.parse(42)).toThrow();
    expect(reportStringLengthViolation).not.toHaveBeenCalled();
  });
});

test('supports composition, inference and refinement after warn()', () => {
  const requestSchema = z.object({
    id: savedObjectId.warn().regex(/^a+$/).optional(),
    description: description().nullable(),
  });
  type Request = z.infer<typeof requestSchema>;
  const input: Request = { id: 'a'.repeat(600), description: null };
  expect(requestSchema.parse(input)).toEqual(input);
  expect(requestSchema.parse({ description: null })).toEqual({ description: null });
  expect(() => requestSchema.parse({ id: 'b', description: null })).toThrow();
});

test('preserves custom Zod error options', () => {
  expect(() => savedObjectId({ error: 'Expected an ID' }).parse(42)).toThrow('Expected an ID');
  expect(() =>
    unboundedString({ reason: 'Trusted input', error: 'Expected text' }).parse(42)
  ).toThrow('Expected text');
});

test('exports accurate JSON Schema limits in both modes', () => {
  expect(z.toJSONSchema(savedObjectId())).toMatchObject({
    type: 'string',
    minLength: 1,
    maxLength: 512,
  });
  const reporting = z.toJSONSchema(savedObjectId.warn());
  expect(reporting).toMatchObject({ type: 'string', minLength: 1 });
  expect(reporting).not.toHaveProperty('maxLength');
});

test('returns ordinary Zod schemas for composition after selecting the mode', () => {
  const modified = savedObjectId().min(3);
  expectType<'warn' extends keyof typeof modified ? true : false>(false);
  expect(modified).not.toHaveProperty('warn');
  expect(() => modified.parse('ab')).toThrow();
  expect(modified.parse('abc')).toBe('abc');
});
