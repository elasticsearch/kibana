/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowExecution, ExecutionStatus } from '@kbn/workflows';
import { getInputsFromDefinition } from '@kbn/workflows/spec/lib/field_conversion';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { mockContextDependencies } from '../../execution_functions/__mock__/context_dependencies';
import { buildWorkflowContext } from '../build_workflow_context';

jest.mock('../../utils', () => ({
  getKibanaUrl: jest.fn().mockReturnValue('http://localhost:5601'),
  buildWorkflowExecutionUrl: jest
    .fn()
    .mockImplementation((kibanaUrl, spaceId, workflowId, executionId) => {
      const spacePrefix = spaceId === 'default' ? '' : `/s/${spaceId}`;
      return `${kibanaUrl}${spacePrefix}/app/workflows/${workflowId}?executionId=${executionId}`;
    }),
}));

jest.mock('@kbn/workflows/spec/lib/field_conversion', () => ({
  ...jest.requireActual('@kbn/workflows/spec/lib/field_conversion'),
  getInputsFromDefinition: jest.fn(),
}));

const mockGetInputsFromDefinition = getInputsFromDefinition as jest.MockedFunction<
  typeof getInputsFromDefinition
>;

describe('buildWorkflowContext', () => {
  const dependencies = mockContextDependencies();

  // Format-shape coverage of `inputs` is owned by `getInputsFromDefinition` unit tests
  // in `field_conversion.test.ts`. Tests here mock that helper so the workflow definition
  // can stay shape-agnostic and we only verify how `buildWorkflowContext` consumes the
  // normalized schema.
  const baseExecution: EsWorkflowExecution = {
    id: 'test-execution-id',
    workflowId: 'test-workflow-id',
    spaceId: 'default',
    isTestRun: false,
    status: 'running' as ExecutionStatus,
    context: {},
    workflowDefinition: {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      consts: {},
      triggers: [{ type: 'manual' }],
      steps: [],
    },
    yaml: '',
    scopeStack: [],
    createdAt: '2023-01-01T00:00:00.000Z',
    startedAt: '2023-01-01T00:00:00.000Z',
    finishedAt: '2023-01-01T00:00:00.000Z',
    createdBy: 'test-user',
    duration: 0,
    error: null,
    cancelRequested: false,
  };

  const setInputsSchema = (schema: JsonModelSchemaType | undefined) => {
    mockGetInputsFromDefinition.mockReturnValue(schema);
  };

  beforeEach(() => {
    mockGetInputsFromDefinition.mockReset();
    mockGetInputsFromDefinition.mockReturnValue(undefined);
  });

  describe('execution context', () => {
    it('should include executedBy and triggeredBy in execution context', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        createdBy: 'user@example.com',
        executedBy: 'user@example.com',
        triggeredBy: 'manual',
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.execution.executedBy).toBe('user@example.com');
      expect(context.execution.triggeredBy).toBe('manual');
    });

    it('should default to unknown when executedBy is undefined', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        createdBy: 'legacy-user',
        executedBy: undefined,
        triggeredBy: 'manual',
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.execution.executedBy).toBe('unknown');
      expect(context.execution.triggeredBy).toBe('manual');
    });

    it('should handle undefined executedBy and triggeredBy', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        createdBy: 'system',
        executedBy: undefined,
        triggeredBy: undefined,
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.execution.executedBy).toBe('unknown');
      expect(context.execution.triggeredBy).toBeUndefined();
    });

    it('should include triggeredBy as scheduled for automated executions', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        createdBy: 'system',
        executedBy: 'system',
        triggeredBy: 'scheduled',
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.execution.executedBy).toBe('system');
      expect(context.execution.triggeredBy).toBe('scheduled');
    });

    it('should expose accumulated token usage so it is queryable via {{ execution.usage }}', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        usage: { inputTokens: 45305, outputTokens: 289, totalTokens: 45594 },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.execution.usage).toEqual({
        inputTokens: 45305,
        outputTokens: 289,
        totalTokens: 45594,
      });
    });

    it('should leave execution.usage undefined when no step reported usage', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        usage: undefined,
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.execution.usage).toBeUndefined();
    });
  });

  describe('input default values', () => {
    it('should merge default input values when inputs are not provided', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string', default: 'defaultValue' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          inputs: {},
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.inputs).toEqual({
        inputWithDefault: 'defaultValue',
      });
    });

    it('should leave templated default input values raw when inputs are not provided', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string', default: '{{ consts.default_input }}' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        workflowDefinition: {
          ...baseExecution.workflowDefinition,
          consts: {
            default_input: 'renderedValue',
          },
        },
        context: {
          inputs: {},
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.inputs).toEqual({
        inputWithDefault: '{{ consts.default_input }}',
      });
    });

    it('should leave provided templated input values raw', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string', default: 'defaultValue' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        workflowDefinition: {
          ...baseExecution.workflowDefinition,
          consts: {
            default_input: 'renderedValue',
          },
        },
        context: {
          inputs: {
            inputWithDefault: '{{ consts.default_input }}',
          },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.inputs).toEqual({
        inputWithDefault: '{{ consts.default_input }}',
      });
    });

    it('should override default values with provided inputs', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string', default: 'defaultValue' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          inputs: {
            inputWithDefault: 'customValue',
          },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.inputs).toEqual({
        inputWithDefault: 'customValue',
      });
    });

    it('should apply defaults for missing inputs while preserving provided ones', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string', default: 'defaultValue' },
          anotherInput: { type: 'string', default: 'anotherDefault' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          inputs: {
            inputWithDefault: 'customValue',
            // anotherInput is not provided, should use default
          },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.inputs).toEqual({
        inputWithDefault: 'customValue',
        anotherInput: 'anotherDefault',
      });
    });

    it('should handle workflows without input defaults', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          inputs: {
            inputWithDefault: 'providedValue',
          },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.inputs).toEqual({
        inputWithDefault: 'providedValue',
      });
    });

    it('should return undefined inputs when there are no defaults and no provided inputs (backwards compatible)', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          // inputs is undefined
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      // Backwards compatible: should return undefined when no defaults and no provided inputs
      expect(context.inputs).toBeUndefined();
    });

    it('should handle empty inputs context', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string', default: 'defaultValue' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          // inputs is undefined
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.inputs).toEqual({
        inputWithDefault: 'defaultValue',
      });
    });

    it('should handle different input types with defaults', () => {
      setInputsSchema({
        properties: {
          count: { type: 'number', default: 42 },
          enabled: { type: 'boolean', default: true },
          tags: { type: 'array', default: ['tag1', 'tag2'] },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          inputs: {},
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.inputs).toEqual({
        count: 42,
        enabled: true,
        tags: ['tag1', 'tag2'],
      });
    });

    it('should handle empty provided inputs object (not undefined)', () => {
      setInputsSchema({
        properties: {
          inputWithDefault: { type: 'string', default: 'defaultValue' },
        },
      });

      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          inputs: {}, // Empty object, not undefined
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      // Should still apply defaults when providedInputs is empty object
      expect(context.inputs).toEqual({
        inputWithDefault: 'defaultValue',
      });
    });

    it('should handle workflow definition with undefined name and enabled', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        workflowDefinition: {
          ...baseExecution.workflowDefinition,
          name: undefined as any,
          enabled: undefined as any,
        },
        context: {},
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      // Should use default values for undefined name and enabled
      expect(context.workflow.name).toBe('');
      expect(context.workflow.enabled).toBe(false);
    });

    it('should handle workflow definition with undefined consts', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        workflowDefinition: {
          ...baseExecution.workflowDefinition,
          consts: undefined as any,
        },
        context: {},
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      // Should use empty object for undefined consts
      expect(context.consts).toEqual({});
    });
  });

  describe('event context shape', () => {
    it('should pass through event with spaceId for manual trigger executions', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        workflowDefinition: {
          ...baseExecution.workflowDefinition,
          triggers: [{ type: 'manual' }],
        },
        context: {
          event: {
            spaceId: 'default',
          },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.event).toBeDefined();
      expect(context.event?.spaceId).toBe('default');
      // Manual trigger should not have alert-specific properties
      expect(context.event).not.toHaveProperty('alerts');
      expect(context.event).not.toHaveProperty('rule');
    });

    it('should pass through event with alerts, rule, and spaceId for alert trigger executions', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        workflowDefinition: {
          ...baseExecution.workflowDefinition,
          triggers: [{ type: 'alert' }],
        },
        context: {
          event: {
            spaceId: 'default',
            alerts: [
              {
                _id: 'alert-1',
                _index: '.alerts-default',
                kibana: { alert: { status: 'active' } },
                '@timestamp': '2026-02-17T00:00:00.000Z',
              },
            ],
            rule: {
              id: 'rule-1',
              name: 'Test Rule',
              tags: ['security'],
              consumer: 'siem',
              producer: 'siem',
              ruleTypeId: 'siem.queryRule',
            },
            params: { threshold: 10 },
          },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.event).toBeDefined();
      expect(context.event?.spaceId).toBe('default');
      expect(context.event?.alerts).toHaveLength(1);
      expect((context.event?.alerts?.[0] as { _id: string })._id).toBe('alert-1');
      expect(context.event?.rule?.name).toBe('Test Rule');
      expect(context.event?.params).toEqual({ threshold: 10 });
    });

    it('should pass through event with type, timestamp, and source for scheduled trigger executions', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        workflowDefinition: {
          ...baseExecution.workflowDefinition,
          triggers: [{ type: 'scheduled', with: { every: '5m' } }],
        },
        context: {
          event: {
            type: 'scheduled',
            timestamp: '2025-01-15T10:00:00.000Z',
            source: 'task-manager',
            spaceId: 'default',
          },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.event).toBeDefined();
      expect(context.event).toMatchObject({
        type: 'scheduled',
        timestamp: '2025-01-15T10:00:00.000Z',
        source: 'task-manager',
        spaceId: 'default',
      });
    });

    it('should handle undefined event context gracefully', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {},
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.event).toBeUndefined();
    });

    it('should handle when workflowInputs parameter is undefined (uses default)', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          inputs: {
            customInput: 'value',
          },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      // Should pass provided inputs through when no schema is defined
      expect(context.inputs).toEqual({
        customInput: 'value',
      });
    });
  });

  describe('metadata context', () => {
    it('should include metadata from execution document when present', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        metadata: { agent_id: 'agent-abc', source: 'agent-builder' },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.metadata).toEqual({ agent_id: 'agent-abc', source: 'agent-builder' });
    });

    it('should fall back to context.metadata when execution.metadata is not set', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {
          metadata: { agent_id: 'agent-from-context' },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.metadata).toEqual({ agent_id: 'agent-from-context' });
    });

    it('should return undefined metadata when neither execution.metadata nor context.metadata is set', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        context: {},
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.metadata).toBeUndefined();
    });

    it('should prefer execution.metadata over context.metadata', () => {
      const execution: EsWorkflowExecution = {
        ...baseExecution,
        metadata: { agent_id: 'from-execution' },
        context: {
          metadata: { agent_id: 'from-context' },
        },
      };

      const context = buildWorkflowContext(execution, undefined, dependencies);

      expect(context.metadata).toEqual({ agent_id: 'from-execution' });
    });
  });
});
