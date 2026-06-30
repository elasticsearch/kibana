/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Step, WorkflowYaml } from '../spec/schema';
import {
  isForeachStep,
  isIfStep,
  isMergeStep,
  isParallelStep,
  isSwitchStep,
  isWhileStep,
} from '../types/utils';

/**
 * IMPORTANT: This file is used to collect all steps from a workflow definition.
 * This implementation is replicated in `elastic/workflows/build-catalog.mjs`, and must be kept in sync.
 * Any changes to this file must be reflected in the `build-catalog.mjs` file on the `elastic/workflows` repository.
 */
const getChildStepArrays = (step: Step): ReadonlyArray<WorkflowYaml['steps']> => {
  if (isForeachStep(step) && Array.isArray(step.steps)) {
    return [step.steps];
  }
  if (isWhileStep(step) && Array.isArray(step.steps)) {
    return [step.steps];
  }
  if (isIfStep(step)) {
    const arrays: Array<WorkflowYaml['steps']> = [];
    if (Array.isArray(step.steps)) arrays.push(step.steps);
    if (Array.isArray(step.else)) arrays.push(step.else);
    return arrays;
  }
  if (isSwitchStep(step)) {
    const arrays: Array<WorkflowYaml['steps']> = step.cases.map((c) => c.steps);
    if (Array.isArray(step.default)) arrays.push(step.default);
    return arrays;
  }
  if (isParallelStep(step) && Array.isArray(step.branches)) {
    return step.branches.map((b) => b.steps);
  }
  if (isMergeStep(step) && Array.isArray(step.steps)) {
    return [step.steps];
  }
  return [];
};

export const collectAllSteps = (steps: WorkflowYaml['steps']): Step[] => {
  const result: Step[] = [];
  for (const step of steps) {
    result.push(step);
    for (const childSteps of getChildStepArrays(step)) {
      result.push(...collectAllSteps(childSteps));
    }
  }
  return result;
};

export function getStepByNameFromNestedSteps(
  steps: WorkflowYaml['steps'],
  stepName: string
): Step | null {
  for (const step of steps) {
    if (step.name === stepName) {
      return step;
    }
    for (const childSteps of getChildStepArrays(step)) {
      const result = getStepByNameFromNestedSteps(childSteps, stepName);
      if (result) {
        return result;
      }
    }
  }
  return null;
}
