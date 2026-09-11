/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPromptInjectionModule } from './prompt_injection';

describe('prompt_injection module', () => {
  const module = createPromptInjectionModule();

  it('has correct metadata', () => {
    expect(module.name).toBe('prompt_injection');
    expect(module.owaspCategory).toBe('LLM01');
    expect(module.description).toBeTruthy();
  });

  it('has default evaluators', () => {
    expect(module.defaultEvaluators).toContain('prompt-leak-detection');
    expect(module.defaultEvaluators).toContain('attack-success-judge');
  });

  it('generates examples', async () => {
    const examples = await module.generate({
      count: 5,
      difficulty: 'basic',
    });
    expect(examples).toHaveLength(5);
    expect(examples[0].input).toHaveProperty('prompt');
  });

  it('generates examples for each difficulty', async () => {
    for (const difficulty of ['basic', 'moderate', 'advanced'] as const) {
      const examples = await module.generate({ count: 2, difficulty });
      expect(examples.length).toBeGreaterThan(0);
    }
  });
});
