/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createUnicodeConfusablesStrategy } from './unicode_confusables';

describe('unicode_confusables strategy', () => {
  const strategy = createUnicodeConfusablesStrategy();

  it('has correct metadata', () => {
    expect(strategy.name).toBe('unicode_confusables');
    expect(strategy.kind).toBe('single-turn');
  });

  it('replaces mapped characters', () => {
    // 'a' should be replaced with Cyrillic а
    const result = strategy.transform('attack');
    expect(result).not.toBe('attack');
    expect(result).not.toContain('a'); // all 'a's replaced
  });

  it('leaves unmapped characters unchanged', () => {
    const result = strategy.transform('xyz'); // x is mapped, y and z are not
    // x should be replaced, y and z stay
    expect(result).not.toContain('x');
    expect(result).toContain('y');
    expect(result).toContain('z');
  });

  it('produces a longer or equal length string', () => {
    const input = 'hello world';
    const result = strategy.transform(input);
    expect(result.length).toBeGreaterThanOrEqual(input.length);
  });

  it('handles empty string', () => {
    expect(strategy.transform('')).toBe('');
  });

  it('replaces all 6 minimum confusables', () => {
    // Test each mapped character individually
    const resultA = strategy.transform('a');
    const resultE = strategy.transform('e');
    const resultO = strategy.transform('o');
    const resultP = strategy.transform('p');
    const resultC = strategy.transform('c');
    const resultX = strategy.transform('x');

    expect(resultA).not.toBe('a');
    expect(resultE).not.toBe('e');
    expect(resultO).not.toBe('o');
    expect(resultP).not.toBe('p');
    expect(resultC).not.toBe('c');
    expect(resultX).not.toBe('x');
  });
});
