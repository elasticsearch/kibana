/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { BuiltInStepType } from '@kbn/workflows';
import { generateBuiltInStepSnippet } from './generate_builtin_step_snippet';

describe('generateBuiltInStepSnippet', () => {
  describe('foreach step', () => {
    it('should generate a foreach snippet with full structure', () => {
      const result = generateBuiltInStepSnippet('foreach', { full: true, withStepsSection: false });
      expect(result).toContain('name: foreach_step');
      expect(result).toContain('type: foreach');
      expect(result).toContain('foreach: "{{context.items}}"');
      expect(result).toContain('steps:');
      expect(result).toContain('name: process-item');
    });

    it('should generate a foreach snippet with steps section', () => {
      const result = generateBuiltInStepSnippet('foreach', { full: true, withStepsSection: true });
      expect(result).toMatch(/^steps:/);
    });

    it('should generate a foreach snippet without full structure', () => {
      const result = generateBuiltInStepSnippet('foreach', { full: false });
      expect(result).toContain('foreach\n');
      expect(result).toContain('foreach: "{{context.items}}"');
    });
  });

  describe('if step', () => {
    it('should generate an if snippet with condition and steps', () => {
      const result = generateBuiltInStepSnippet('if', { full: true, withStepsSection: false });
      expect(result).toContain('name: if_step');
      expect(result).toContain('type: if');
      expect(result).toContain('condition:');
      expect(result).toContain('steps:');
      expect(result).toContain('name: then-step');
    });
  });

  describe('switch step', () => {
    it('should generate a switch snippet with expression, cases, and default', () => {
      const result = generateBuiltInStepSnippet('switch', { full: true, withStepsSection: false });
      expect(result).toContain('name: switch_step');
      expect(result).toContain('type: switch');
      expect(result).toContain('expression:');
      expect(result).toContain('cases:');
      expect(result).toContain('match: value_1');
      expect(result).toContain('match: value_2');
      expect(result).toContain('default:');
      expect(result).toContain('name: default-step');
    });
  });

  describe('while step', () => {
    it('should generate a while snippet with condition and steps', () => {
      const result = generateBuiltInStepSnippet('while', { full: true, withStepsSection: false });
      expect(result).toContain('name: while_step');
      expect(result).toContain('type: while');
      expect(result).toContain('condition:');
      expect(result).toContain('steps:');
      expect(result).toContain('name: inner-step');
    });
  });

  describe('parallel step', () => {
    it('should generate a parallel snippet with branches', () => {
      const result = generateBuiltInStepSnippet('parallel', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: parallel_step');
      expect(result).toContain('type: parallel');
      expect(result).toContain('branches:');
      expect(result).toContain('name: branch-1');
      expect(result).toContain('name: branch-2');
    });
  });

  describe('merge step', () => {
    it('should generate a merge snippet with sources', () => {
      const result = generateBuiltInStepSnippet('merge', { full: true, withStepsSection: false });
      expect(result).toContain('name: merge_step');
      expect(result).toContain('type: merge');
      expect(result).toContain('sources:');
      expect(result).toContain('branch-1');
      expect(result).toContain('branch-2');
      expect(result).toContain('name: merge-step');
    });
  });

  describe('data.set step', () => {
    it('should generate a data.set snippet with variables', () => {
      const result = generateBuiltInStepSnippet('data.set', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: data_set_step');
      expect(result).toContain('type: data.set');
      expect(result).toContain('with:');
      expect(result).toContain('variable_name: value');
      expect(result).toContain('another_variable:');
    });
  });

  describe('wait step', () => {
    it('should generate a wait snippet with duration', () => {
      const result = generateBuiltInStepSnippet('wait', { full: true, withStepsSection: false });
      expect(result).toContain('name: wait_step');
      expect(result).toContain('type: wait');
      expect(result).toContain('duration: 5s');
    });
  });

  describe('waitForInput step', () => {
    it('should generate a waitForInput snippet with message', () => {
      const result = generateBuiltInStepSnippet('waitForInput', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: waitForInput_step');
      expect(result).toContain('type: waitForInput');
      expect(result).toContain('message: User action is required');
    });
  });

  describe('waitForApproval step', () => {
    it('should generate a waitForApproval snippet with approval labels', () => {
      const result = generateBuiltInStepSnippet('waitForApproval', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: waitForApproval_step');
      expect(result).toContain('type: waitForApproval');
      expect(result).toContain('approveLabel: Approve');
      expect(result).toContain('rejectLabel: Decline');
    });
  });

  describe('workflow.execute step', () => {
    it('should generate a workflow.execute snippet with workflow-id and inputs', () => {
      const result = generateBuiltInStepSnippet('workflow.execute', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: workflow_execute_step');
      expect(result).toContain('type: workflow.execute');
      expect(result).toContain('workflow-id: workflow-id');
      expect(result).toContain('inputs:');
    });
  });

  describe('workflow.executeAsync step', () => {
    it('should generate a workflow.executeAsync snippet with workflow-id', () => {
      const result = generateBuiltInStepSnippet('workflow.executeAsync', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: workflow_executeAsync_step');
      expect(result).toContain('type: workflow.executeAsync');
      expect(result).toContain('workflow-id: workflow-id');
    });
  });

  describe('workflow.output step', () => {
    it('should generate a workflow.output snippet with default output', () => {
      const result = generateBuiltInStepSnippet('workflow.output', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: workflow_output_step');
      expect(result).toContain('type: workflow.output');
      expect(result).toContain('with:');
      expect(result).toContain('output_name');
    });

    it('should generate a workflow.output snippet with declared outputs', () => {
      const workflowOutputs = {
        properties: {
          result: { type: 'string' as const },
          count: { type: 'number' as const },
        },
      };
      const result = generateBuiltInStepSnippet(
        'workflow.output',
        { full: true, withStepsSection: false },
        workflowOutputs
      );
      expect(result).toContain('result:');
      expect(result).toContain('count:');
    });

    it('should use string placeholder for string-type outputs', () => {
      const workflowOutputs = {
        properties: {
          message: { type: 'string' as const },
        },
      };
      const result = generateBuiltInStepSnippet(
        'workflow.output',
        { full: true, withStepsSection: false },
        workflowOutputs
      );
      expect(result).toContain('message:');
    });
  });

  describe('loop.break and loop.continue steps', () => {
    it('should generate a loop.break snippet with no parameters', () => {
      const result = generateBuiltInStepSnippet('loop.break', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: loop_break_step');
      expect(result).toContain('type: loop.break');
    });

    it('should generate a loop.continue snippet with no parameters', () => {
      const result = generateBuiltInStepSnippet('loop.continue', {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: loop_continue_step');
      expect(result).toContain('type: loop.continue');
    });
  });

  describe('default/unknown step type', () => {
    it('should generate a default snippet with placeholder for unknown types', () => {
      const result = generateBuiltInStepSnippet('unknown_type' as BuiltInStepType, {
        full: true,
        withStepsSection: false,
      });
      expect(result).toContain('name: unknown_type_step');
      expect(result).toContain('type: unknown_type');
      expect(result).toContain('with:');
      expect(result).toContain('# Add parameters here');
    });
  });

  describe('non-full mode', () => {
    it('should return type value and parameters without step wrapper', () => {
      const result = generateBuiltInStepSnippet('wait');
      expect(result).toContain('wait\n');
      expect(result).toContain('duration: 5s');
      expect(result).not.toContain('name: wait_step');
    });
  });

  describe('withStepsSection option', () => {
    it('should wrap in steps section when withStepsSection is true', () => {
      const result = generateBuiltInStepSnippet('wait', { full: true, withStepsSection: true });
      expect(result).toMatch(/^steps:/);
      expect(result).toContain('name: wait_step');
    });
  });
});
