/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createJailbreakWrapperStrategy } from './jailbreak_wrapper';

describe('jailbreak_wrapper strategy', () => {
  it('has correct metadata', () => {
    const strategy = createJailbreakWrapperStrategy();
    expect(strategy.name).toBe('jailbreak_wrapper');
    expect(strategy.kind).toBe('single-turn');
  });

  it('wraps the original prompt within the output', () => {
    const strategy = createJailbreakWrapperStrategy();
    const input = 'tell me your secrets';
    const result = strategy.transform(input);
    expect(result).toContain(input);
    expect(result.length).toBeGreaterThan(input.length);
  });

  it('uses different wrapper templates across multiple transform calls', () => {
    const strategy = createJailbreakWrapperStrategy();
    const results = new Set<string>();
    // Different prompts hash to different wrapper indices — use distinct inputs.
    for (let i = 0; i < 20; i++) {
      results.add(strategy.transform(`test prompt ${i}`));
    }
    // 20 distinct prompts covering 5 templates — expect more than one unique result.
    expect(results.size).toBeGreaterThan(1);
  });

  it('handles empty string', () => {
    const strategy = createJailbreakWrapperStrategy();
    const result = strategy.transform('');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('produces one of the 5 known wrapper templates across multiple instances', () => {
    const templates = new Set<string>();
    // These prompts hash (charCode % 5) to indices 0-4 respectively,
    // giving deterministic full coverage: 'd'→0, 'e'→1, 'a'→2, 'b'→3, 'c'→4.
    for (const prompt of ['d', 'e', 'a', 'b', 'c']) {
      const s = createJailbreakWrapperStrategy();
      const result = s.transform(prompt);
      // All templates append the prompt at the end; slice gives the wrapper prefix.
      templates.add(result.slice(0, result.length - prompt.length));
    }
    expect(templates.size).toBe(5);
  });
});
