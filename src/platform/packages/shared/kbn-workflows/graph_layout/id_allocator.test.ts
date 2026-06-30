/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { IdAllocator, slugify } from './id_allocator';

describe('slugify', () => {
  it('lowercases and replaces non-alphanumeric chars with hyphens', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  spaces  ')).toBe('spaces');
  });

  it('collapses consecutive special chars to a single hyphen', () => {
    expect(slugify('a__b  c')).toBe('a-b-c');
  });
});

describe('IdAllocator', () => {
  it('returns the base slug for the first unique name', () => {
    const a = new IdAllocator();
    expect(a.allocate('My Step')).toBe('my-step');
  });

  it('appends -2 for the second duplicate', () => {
    const a = new IdAllocator();
    a.allocate('notify');
    expect(a.allocate('notify')).toBe('notify-2');
  });

  it('increments suffix for each further duplicate', () => {
    const a = new IdAllocator();
    a.allocate('notify');
    a.allocate('notify');
    expect(a.allocate('notify')).toBe('notify-3');
  });

  it('does not reuse ids across different base names', () => {
    const a = new IdAllocator();
    const ids = ['send-email', 'retry', 'send-email', 'retry', 'send-email'].map((n) =>
      a.allocate(n)
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('falls back to "step" when the slug is empty', () => {
    const a = new IdAllocator();
    expect(a.allocate('---')).toBe('step');
  });

  it('handles 10 000 duplicates in under 50ms (amortised O(1))', () => {
    const a = new IdAllocator();
    const COUNT = 10_000;
    const start = performance.now();
    for (let i = 0; i < COUNT; i++) {
      a.allocate('dup');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
