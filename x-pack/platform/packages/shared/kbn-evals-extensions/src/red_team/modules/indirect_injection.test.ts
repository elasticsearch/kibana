/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createIndirectInjectionModule } from './indirect_injection';

describe('indirect_injection module', () => {
  const module = createIndirectInjectionModule();

  it('has correct metadata', () => {
    expect(module.name).toBe('indirect_injection');
    expect(module.owaspCategory).toBe('LLM02');
    expect(module.description).toBeTruthy();
  });

  it('has default evaluators', () => {
    expect(module.defaultEvaluators).toContain('prompt-leak-detection');
    expect(module.defaultEvaluators).toContain('attack-success-judge');
  });

  it('generates the requested count of examples', async () => {
    const examples = await module.generate({ count: 5, difficulty: 'basic' });
    expect(examples).toHaveLength(5);
  });

  it('each example input contains injection content', async () => {
    const examples = await module.generate({ count: 5, difficulty: 'basic' });
    for (const example of examples) {
      expect(example.input).toHaveProperty('prompt');
      const prompt = (example.input as Record<string, unknown>).prompt as string;
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    }
  });

  it('includes context: "indirect" in each example', async () => {
    const examples = await module.generate({ count: 3, difficulty: 'basic' });
    for (const example of examples) {
      expect((example.input as Record<string, unknown>).context).toBe('indirect');
    }
  });

  it('works in templateOnly mode', async () => {
    const examples = await module.generate({
      count: 3,
      difficulty: 'basic',
      templateOnly: true,
    });
    expect(examples).toHaveLength(3);
  });

  it('generates examples for each difficulty', async () => {
    for (const difficulty of ['basic', 'moderate', 'advanced'] as const) {
      const examples = await module.generate({ count: 2, difficulty });
      expect(examples.length).toBeGreaterThan(0);
    }
  });

  it('substitutes the {goal} placeholder in prompts', async () => {
    const examples = await module.generate({ count: 6, difficulty: 'basic' });
    for (const example of examples) {
      const prompt = (example.input as Record<string, unknown>).prompt as string;
      expect(prompt).not.toContain('{goal}');
    }
  });
});
