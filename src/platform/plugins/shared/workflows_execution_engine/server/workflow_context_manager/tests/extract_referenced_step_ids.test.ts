/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { GraphNodeUnion } from '@kbn/workflows/graph';
import { extractReferencedStepIds } from '../extract_referenced_step_ids';

const makeAtomicNode = (configuration: Record<string, unknown>): GraphNodeUnion =>
  ({
    id: 'test-node',
    type: 'atomic',
    stepId: 'test_step',
    stepType: 'connector',
    configuration,
  } as unknown as GraphNodeUnion);

const makeIfNode = (condition: string): GraphNodeUnion =>
  ({
    id: 'test-if',
    type: 'enter-if',
    stepId: 'test_if',
    stepType: 'if',
    exitNodeId: 'exit-if',
    configuration: { condition },
  } as unknown as GraphNodeUnion);

const makeForeachNode = (foreachExpr: string): GraphNodeUnion =>
  ({
    id: 'test-foreach',
    type: 'enter-foreach',
    stepId: 'test_foreach',
    stepType: 'foreach',
    exitNodeId: 'exit-foreach',
    configuration: { foreach: foreachExpr },
  } as unknown as GraphNodeUnion);

describe('extractReferencedStepIds', () => {
  it('should extract a single step ID from a connector step with template', () => {
    const node = makeAtomicNode({
      with: { message: '{{steps.step_a.output}}' },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set(['step_a']));
  });

  it('should extract multiple step IDs from different template expressions', () => {
    const node = makeAtomicNode({
      with: {
        first: '{{steps.s1.output.name}}',
        second: '{{steps.s2.output.value}}',
      },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set(['s1', 's2']));
  });

  it('should extract step IDs from nested object values', () => {
    const node = makeAtomicNode({
      with: {
        config: {
          deeply: {
            nested: '{{steps.deep_step.output}}',
          },
        },
      },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set(['deep_step']));
  });

  it('should extract step IDs from array values', () => {
    const node = makeAtomicNode({
      with: {
        items: ['{{steps.arr_step.output.a}}', '{{steps.arr_step2.output.b}}'],
      },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set(['arr_step', 'arr_step2']));
  });

  it('should extract step ID from an enter-if node KQL condition', () => {
    const node = makeIfNode('steps.check.output.value: true');
    expect(extractReferencedStepIds(node)).toEqual(new Set(['check']));
  });

  it('should extract step ID from an enter-if node with template condition', () => {
    const node = makeIfNode('{{steps.check.output.value}} > 5');
    const result = extractReferencedStepIds(node);
    expect(result).toContain('check');
  });

  it('should extract step ID from a foreach node expression', () => {
    const node = makeForeachNode('{{steps.fetch_all.output.items}}');
    expect(extractReferencedStepIds(node)).toEqual(new Set(['fetch_all']));
  });

  it('should return null for dynamic bracket access (steps[variables.name])', () => {
    const node = makeAtomicNode({
      with: { message: '{{steps[variables.step_name].output}}' },
    });
    expect(extractReferencedStepIds(node)).toBeNull();
  });

  it('should return empty set when no template expressions are present', () => {
    const node = makeAtomicNode({
      with: { message: 'static text', count: 42 },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set());
  });

  it('should return empty set when only non-step variables are referenced', () => {
    const node = makeAtomicNode({
      with: {
        message: '{{variables.counter}}',
        item: '{{foreach.item}}',
        id: '{{workflow.id}}',
      },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set());
  });

  it('should extract only step references from mixed variable references', () => {
    const node = makeAtomicNode({
      with: {
        message: '{{variables.prefix}}: {{steps.data_step.output.name}}',
        item: '{{foreach.item}}',
      },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set(['data_step']));
  });

  it('should deduplicate step IDs referenced multiple times', () => {
    const node = makeAtomicNode({
      with: {
        a: '{{steps.same_step.output.field1}}',
        b: '{{steps.same_step.output.field2}}',
      },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set(['same_step']));
  });

  it('should handle nodes without configuration gracefully', () => {
    const node = {
      id: 'exit-node',
      type: 'exit-if',
      stepId: 'test',
      stepType: 'if',
      startNodeId: 'start',
    } as unknown as GraphNodeUnion;
    expect(extractReferencedStepIds(node)).toEqual(new Set());
  });

  it('should extract step ID when dynamic access is within a known step output (steps.X[dynamic])', () => {
    // steps.myStep[variables.key] truncates to steps.myStep — the step ID IS known
    const node = makeAtomicNode({
      with: { value: '{{steps.my_step[variables.field_name].value}}' },
    });
    expect(extractReferencedStepIds(node)).toEqual(new Set(['my_step']));
  });

  it('should extract step ID from an enter-while node condition', () => {
    const node = {
      id: 'test-while',
      type: 'enter-while',
      stepId: 'test_while',
      stepType: 'while',
      exitNodeId: 'exit-while',
      configuration: { condition: '{{steps.check.output.done}}' },
    } as unknown as GraphNodeUnion;
    expect(extractReferencedStepIds(node)).toEqual(new Set(['check']));
  });

  it('should extract step ID from an exit-while node condition', () => {
    const node = {
      id: 'exit-while',
      type: 'exit-while',
      stepId: 'test_while',
      stepType: 'while',
      startNodeId: 'enter-while',
      condition: '{{steps.check.output.done}}',
    } as unknown as GraphNodeUnion;
    expect(extractReferencedStepIds(node)).toEqual(new Set(['check']));
  });

  it('should extract step ID from an enter-while node with a bare KQL condition', () => {
    // Authoring a while condition as KQL (no {{ }}) is fully supported by
    // evaluateCondition, but the referenced step must still be discovered so it
    // can be rehydrated if its output was evicted. Mirrors the enter-if KQL case.
    const node = {
      id: 'test-while',
      type: 'enter-while',
      stepId: 'test_while',
      stepType: 'while',
      exitNodeId: 'exit-while',
      configuration: { condition: 'steps.check.output.done: false' },
    } as unknown as GraphNodeUnion;
    expect(extractReferencedStepIds(node)).toEqual(new Set(['check']));
  });

  it('should extract step ID from an exit-while node with a bare KQL condition', () => {
    // The exit-while node re-evaluates this condition on every iteration. If the
    // referenced step is not discovered here, prepareForRead never rehydrates it,
    // so an evicted source renders blank and the loop exits prematurely.
    const node = {
      id: 'exit-while',
      type: 'exit-while',
      stepId: 'test_while',
      stepType: 'while',
      startNodeId: 'enter-while',
      condition: 'steps.check.output.status: "running"',
    } as unknown as GraphNodeUnion;
    expect(extractReferencedStepIds(node)).toEqual(new Set(['check']));
  });

  it('should extract step IDs from node template dependencies', () => {
    const node = {
      id: 'test-switch',
      type: 'enter-switch',
      stepId: 'test_switch',
      stepType: 'switch',
      exitNodeId: 'exit-switch',
      configuration: { expression: '{{steps.expression_source.output}}' },
      templateDependencies: ['{{steps.match_source.output}}'],
    } as unknown as GraphNodeUnion;
    expect(extractReferencedStepIds(node)).toEqual(new Set(['expression_source', 'match_source']));
  });

  it('should extract step ID from an enter-continue node condition', () => {
    const node = {
      id: 'test-continue',
      type: 'enter-continue',
      stepId: 'test_continue',
      stepType: 'continue',
      exitNodeId: 'exit-continue',
      configuration: { condition: '{{steps.failed_step.error}}' },
    } as unknown as GraphNodeUnion;
    expect(extractReferencedStepIds(node)).toEqual(new Set(['failed_step']));
  });

  it('should return null when mixing static and dynamic step access', () => {
    // steps.known is fine, but steps[variables.x] forces fallback
    const node = makeAtomicNode({
      with: {
        a: '{{steps.known_step.output}}',
        b: '{{steps[variables.dynamic_name].output}}',
      },
    });
    expect(extractReferencedStepIds(node)).toBeNull();
  });
});
