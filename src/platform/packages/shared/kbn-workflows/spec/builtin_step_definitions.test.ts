/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { builtInStepDefinitions, getBuiltInStepDefinition } from './builtin_step_definitions';
import { StepCategories, StepCategory } from './step_definition_types';

const EXPECTED_BUILT_IN_IDS = [
  'console',
  'if',
  'foreach',
  'while',
  'loop.break',
  'loop.continue',
  'switch',
  'wait',
  'waitForInput',
  'waitForApproval',
  'data.set',
  'workflow.execute',
  'workflow.executeAsync',
];

describe('builtInStepDefinitions', () => {
  it('covers all expected built-in step types', () => {
    const ids = builtInStepDefinitions.map((d) => d.id);
    expect(ids.sort()).toEqual([...EXPECTED_BUILT_IN_IDS].sort());
  });

  it.each(EXPECTED_BUILT_IN_IDS)('"%s" has a non-empty description', (id) => {
    const def = builtInStepDefinitions.find((d) => d.id === id);
    expect(def).toBeDefined();
    expect(def!.description.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_BUILT_IN_IDS)('"%s" has a valid category', (id) => {
    const def = builtInStepDefinitions.find((d) => d.id === id);
    expect(def).toBeDefined();
    expect(StepCategories).toContain(def!.category);
  });

  it.each(EXPECTED_BUILT_IN_IDS)('"%s" has an inputSchema with parse()', (id) => {
    const def = builtInStepDefinitions.find((d) => d.id === id);
    expect(def).toBeDefined();
    expect(typeof def!.inputSchema.parse).toBe('function');
  });

  it.each(EXPECTED_BUILT_IN_IDS)('"%s" has an outputSchema with parse()', (id) => {
    const def = builtInStepDefinitions.find((d) => d.id === id);
    expect(def).toBeDefined();
    expect(typeof def!.outputSchema.parse).toBe('function');
  });

  it.each(EXPECTED_BUILT_IN_IDS)('"%s" has non-empty documentation examples', (id) => {
    const def = builtInStepDefinitions.find((d) => d.id === id);
    expect(def).toBeDefined();
    expect(def!.documentation?.examples?.length).toBeGreaterThan(0);
    expect(def!.documentation!.examples![0].length).toBeGreaterThan(0);
  });
});

describe('getBuiltInStepDefinition', () => {
  it('returns the definition for a known id', () => {
    const def = getBuiltInStepDefinition('if');
    expect(def).toBeDefined();
    expect(def!.id).toBe('if');
  });

  it('returns the correct definition for data.set', () => {
    const def = getBuiltInStepDefinition('data.set');
    expect(def).toBeDefined();
    expect(def!.id).toBe('data.set');
    expect(def!.category).toBe(StepCategory.Data);
  });

  it('returns the correct definition for workflow.executeAsync', () => {
    const def = getBuiltInStepDefinition('workflow.executeAsync');
    expect(def).toBeDefined();
    expect(def!.id).toBe('workflow.executeAsync');
    expect(def!.category).toBe(StepCategory.FlowControl);
  });

  it('returns undefined for an unknown id', () => {
    expect(getBuiltInStepDefinition('nonexistent')).toBeUndefined();
  });
});
