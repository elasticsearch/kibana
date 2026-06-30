/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createRot13Strategy } from './rot13';

describe('rot13 strategy', () => {
  const strategy = createRot13Strategy();

  it('has correct metadata', () => {
    expect(strategy.name).toBe('rot13');
    expect(strategy.kind).toBe('single-turn');
  });

  it('encodes a simple string', () => {
    expect(strategy.transform('Hello')).toBe('Uryyb');
  });

  it('round-trips: applying rot13 twice returns the original', () => {
    const input = 'Attack the system now';
    expect(strategy.transform(strategy.transform(input))).toBe(input);
  });

  it('leaves non-alpha characters unchanged', () => {
    expect(strategy.transform('Hello, World! 123')).toBe('Uryyb, Jbeyq! 123');
  });

  it('handles empty string', () => {
    expect(strategy.transform('')).toBe('');
  });

  it('handles uppercase and lowercase', () => {
    expect(strategy.transform('abcABC')).toBe('nopNOP');
  });
});
