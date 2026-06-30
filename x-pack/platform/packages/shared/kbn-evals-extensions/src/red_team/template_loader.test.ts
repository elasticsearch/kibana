/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loadTemplates } from './template_loader';
import type { AttackModuleConfig } from './types';

const baseConfig: AttackModuleConfig = {
  count: 3,
  difficulty: 'basic',
};

describe('loadTemplates', () => {
  it('loads templates for prompt_injection module', () => {
    const examples = loadTemplates('prompt_injection', baseConfig);
    expect(examples).toHaveLength(3);
  });

  it('returns examples with correct structure', () => {
    const examples = loadTemplates('prompt_injection', baseConfig);
    for (const example of examples) {
      expect(example.input).toHaveProperty('prompt');
      expect(example.output).toHaveProperty('intent');
      expect(example.output).toHaveProperty('expectedBehavior');
      expect(example.metadata).toHaveProperty('module', 'prompt_injection');
      expect(example.metadata).toHaveProperty('difficulty', 'basic');
    }
  });

  it('loads different difficulties', () => {
    for (const difficulty of ['basic', 'moderate', 'advanced'] as const) {
      const examples = loadTemplates('prompt_injection', { ...baseConfig, difficulty });
      expect(examples.length).toBeGreaterThan(0);
      expect(examples[0].metadata?.difficulty).toBe(difficulty);
    }
  });

  it('cycles through templates when count exceeds available', () => {
    const examples = loadTemplates('prompt_injection', { ...baseConfig, count: 20 });
    expect(examples).toHaveLength(20);
    // First and (basic count + 1)th should have the same prompt
    const basicPrompt = (examples[0].input as Record<string, unknown>).prompt;
    // The templates cycle, so at some point the prompt repeats
    const matchingExamples = examples.filter(
      (e) => (e.input as Record<string, unknown>).prompt === basicPrompt
    );
    expect(matchingExamples.length).toBeGreaterThan(1);
  });

  it('respects the count parameter', () => {
    const examples = loadTemplates('prompt_injection', { ...baseConfig, count: 1 });
    expect(examples).toHaveLength(1);
  });

  it('throws for a non-existent module', () => {
    expect(() => loadTemplates('nonexistent_module', baseConfig)).toThrow();
  });
});
