/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isStep } from './types';
import type { Step } from './types';
import type { WorkflowYaml } from '../spec/schema';

/**
 * Returns a stable string capturing the workflow's *structure* (trigger types
 * + recursive step `name:type` walk). Used as a memoization key for the graph
 * transform + dagre layout.
 *
 * Edits that do NOT change the fingerprint (e.g. tweaking a step's
 * `description`, `params`, or branch expression) will not retrigger layout.
 *
 * The fingerprint encodes branch *slot* (`then`, `else`, `branch[n]`,
 * `case[n]`, `default`) so moving a step from one branch to another always
 * produces a distinct key even when step names and depths are unchanged.
 */
export function computeTopologyFingerprint(workflow: WorkflowYaml | undefined): string {
  if (!workflow) return '';
  const parts: string[] = [];
  for (const trigger of workflow.triggers ?? []) {
    parts.push(`t:${trigger.type}`);
  }
  walkStepsWithSlot(workflow.steps ?? [], parts, 'steps', 0);
  return parts.join('\n');
}

function walkStepsWithSlot(
  steps: ReadonlyArray<Step>,
  parts: string[],
  slotPrefix: string,
  depth: number
): void {
  const indent = '  '.repeat(depth);
  for (const step of steps) {
    parts.push(`${indent}${slotPrefix}>${step.name}:${step.type}`);
    const record = step as Record<string, unknown>;

    if ('steps' in record && Array.isArray(record.steps)) {
      walkStepsWithSlot((record.steps as unknown[]).filter(isStep), parts, 'steps', depth + 1);
    }
    if ('else' in record && Array.isArray(record.else)) {
      walkStepsWithSlot((record.else as unknown[]).filter(isStep), parts, 'else', depth + 1);
    }
    if ('branches' in record && Array.isArray(record.branches)) {
      const branches = record.branches as Array<{ steps?: unknown[] }>;
      for (let i = 0; i < branches.length; i++) {
        const branch = branches[i];
        if (Array.isArray(branch.steps)) {
          walkStepsWithSlot(branch.steps.filter(isStep), parts, `branch[${i}]`, depth + 1);
        }
      }
    }
    if ('cases' in record && Array.isArray(record.cases)) {
      const cases = record.cases as Array<{ steps?: unknown[] }>;
      for (let i = 0; i < cases.length; i++) {
        const caseItem = cases[i];
        if (Array.isArray(caseItem.steps)) {
          walkStepsWithSlot(caseItem.steps.filter(isStep), parts, `case[${i}]`, depth + 1);
        }
      }
    }
    if ('default' in record && Array.isArray(record.default)) {
      walkStepsWithSlot((record.default as unknown[]).filter(isStep), parts, 'default', depth + 1);
    }
  }
}
