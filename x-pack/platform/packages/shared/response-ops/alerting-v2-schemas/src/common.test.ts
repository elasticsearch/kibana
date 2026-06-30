/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { arrayOrSingleSchema, optionalWithDescription } from './common';

describe('optionalWithDescription', () => {
  it('makes a required schema optional', () => {
    const schema = z.string().describe('A name');
    const result = optionalWithDescription(schema);

    expect(result.isOptional()).toBe(true);
    expect(result.parse(undefined)).toBeUndefined();
    expect(result.parse('hello')).toBe('hello');
  });

  it('preserves the .describe() metadata', () => {
    const schema = z.string().describe('A name');
    const result = optionalWithDescription(schema);

    expect(result.description).toBe('A name');
  });

  it('preserves nullability on a nullable schema', () => {
    const schema = z.string().nullable().describe('Nullable field');
    const result = optionalWithDescription(schema);

    expect(result.isOptional()).toBe(true);
    expect(result.description).toBe('Nullable field');
    expect(result.parse(null)).toBeNull();
    expect(result.parse(undefined)).toBeUndefined();
    expect(result.parse('value')).toBe('value');
  });

  it('works when the schema has no description', () => {
    const schema = z.number();
    const result = optionalWithDescription(schema);

    expect(result.isOptional()).toBe(true);
    expect(result.description).toBeUndefined();
    expect(result.parse(42)).toBe(42);
    expect(result.parse(undefined)).toBeUndefined();
  });

  it('preserves the description on object schemas', () => {
    const schema = z.object({ owner: z.string(), active: z.boolean() }).describe('Auth info');
    const result = optionalWithDescription(schema);

    expect(result.isOptional()).toBe(true);
    expect(result.description).toBe('Auth info');
    expect(result.parse({ owner: 'alice', active: true })).toEqual({
      owner: 'alice',
      active: true,
    });
    expect(result.parse(undefined)).toBeUndefined();
  });
});

describe('arrayOrSingleSchema', () => {
  const schema = arrayOrSingleSchema(z.string().min(1).max(10), 3);

  it('coerces a single value into a one-element array', () => {
    expect(schema.parse('a')).toEqual(['a']);
  });

  it('passes through arrays unchanged', () => {
    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('rejects an empty array', () => {
    expect(schema.safeParse([]).success).toBe(false);
  });

  it('rejects arrays longer than max', () => {
    expect(schema.safeParse(['a', 'b', 'c', 'd']).success).toBe(false);
  });

  it('accepts an array at the exact max', () => {
    expect(schema.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('enforces the inner schema on the single-value branch', () => {
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('a'.repeat(11)).success).toBe(false);
  });

  it('enforces the inner schema on each array entry', () => {
    expect(schema.safeParse(['valid', '']).success).toBe(false);
    expect(schema.safeParse(['valid', 'a'.repeat(11)]).success).toBe(false);
  });

  it('works with enum items', () => {
    const enumSchema = arrayOrSingleSchema(z.enum(['a', 'b']), 2);
    expect(enumSchema.parse('a')).toEqual(['a']);
    expect(enumSchema.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(enumSchema.safeParse(['c']).success).toBe(false);
  });
});
