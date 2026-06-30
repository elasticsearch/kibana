/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createLeetspeakStrategy } from './leetspeak';

describe('leetspeak strategy', () => {
  const strategy = createLeetspeakStrategy();

  it('has correct metadata', () => {
    expect(strategy.name).toBe('leetspeak');
    expect(strategy.kind).toBe('single-turn');
  });

  it('applies character substitutions', () => {
    expect(strategy.transform('a')).toBe('@');
    expect(strategy.transform('e')).toBe('3');
    expect(strategy.transform('i')).toBe('1');
    expect(strategy.transform('o')).toBe('0');
    expect(strategy.transform('s')).toBe('5');
    expect(strategy.transform('t')).toBe('7');
    expect(strategy.transform('l')).toBe('|');
  });

  it('applies substitutions to uppercase characters via lowercase matching', () => {
    expect(strategy.transform('A')).toBe('@');
    expect(strategy.transform('E')).toBe('3');
    expect(strategy.transform('S')).toBe('5');
  });

  it('leaves non-mapped characters unchanged', () => {
    expect(strategy.transform('b')).toBe('b');
    expect(strategy.transform('z')).toBe('z');
    expect(strategy.transform('1')).toBe('1');
    expect(strategy.transform(' ')).toBe(' ');
  });

  it('transforms a full phrase correctly', () => {
    expect(strategy.transform('leet')).toBe('|337');
  });

  it('handles empty string', () => {
    expect(strategy.transform('')).toBe('');
  });
});
