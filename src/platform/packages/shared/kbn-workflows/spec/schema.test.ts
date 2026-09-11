/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CollisionStrategy, ConcurrencySettings } from './schema';
import {
  CollisionStrategySchema,
  ConcurrencySettingsSchema,
  DataSetStepSchema,
  DEFAULT_PARALLEL_MAX_CONCURRENCY,
  ElasticsearchStepSchema,
  EventTimestampSchema,
  IfStepSchema,
  KibanaStepSchema,
  LIQUID_MEMORY_LIMIT_MAX,
  LIQUID_PARSE_LIMIT_MAX,
  LIQUID_RENDER_LIMIT_MAX,
  MergeStepSchema,
  PARALLEL_BRANCH_NAMES_UNIQUE_MESSAGE,
  PARALLEL_MODE_REFINEMENT_MESSAGE,
  ParallelStepSchema,
  WaitForApprovalStepSchema,
  WaitForInputStepSchema,
  WaitStepSchema,
  WorkflowExecuteAsyncStepSchema,
  WorkflowExecuteStepSchema,
  WorkflowOutputStepSchema,
  WorkflowSchema,
  WorkflowSchemaForAutocomplete,
  WorkflowSettingsSchema,
} from './schema';
import { BaseEventSchema } from './schema/common/base_event';
import { JsonModelSchema } from './schema/common/json_model_schema';
import { isManualTrigger } from './schema/triggers/manual_trigger_schema';
import { IF_CONDITION_MAX_LENGTH } from '../common/constants';
import { getShape } from '../common/utils/zod';

describe('WorkflowSchemaForAutocomplete', () => {
  it('should allow empty "with" block', () => {
    expect(
      WorkflowSchemaForAutocomplete.safeParse({
        name: 'test',
        steps: [
          {
            name: 'step1',
            type: 'console',
            with: {},
          },
        ],
      }).data
    ).toEqual({
      version: '1',
      name: 'test',
      enabled: true,
      triggers: [],
      steps: [
        {
          name: 'step1',
          type: 'console',
          with: {},
        },
      ],
    });
  });

  it('should allow steps with just type', () => {
    expect(
      WorkflowSchemaForAutocomplete.safeParse({
        steps: [
          {
            type: 'console',
          },
        ],
      }).data
    ).toEqual({
      version: '1',
      enabled: true,
      triggers: [],
      steps: [
        {
          name: '',
          type: 'console',
        },
      ],
    });
  });

  it('should allow triggers with just type', () => {
    expect(
      WorkflowSchemaForAutocomplete.safeParse({
        triggers: [
          {
            type: 'manual',
          },
        ],
      }).data
    ).toEqual({
      version: '1',
      enabled: true,
      triggers: [
        {
          type: 'manual',
        },
      ],
      steps: [],
    });
  });

  it('should catch null type for steps and triggers and return empty string for name and type', () => {
    expect(
      WorkflowSchemaForAutocomplete.safeParse({
        steps: [
          {
            type: null,
          },
        ],
      }).data
    ).toEqual({
      version: '1',
      enabled: true,
      triggers: [],
      steps: [
        {
          name: '',
          type: '',
        },
      ],
    });
    expect(
      WorkflowSchemaForAutocomplete.safeParse({
        triggers: [
          {
            type: null,
          },
        ],
      }).data
    ).toEqual({
      version: '1',
      enabled: true,
      triggers: [
        {
          type: '',
        },
      ],
      steps: [],
    });
  });

  it('should catch non-array steps and triggers and return empty array for steps and triggers', () => {
    expect(
      WorkflowSchemaForAutocomplete.safeParse({
        steps: 'console',
      }).data
    ).toEqual({
      version: '1',
      enabled: true,
      steps: [],
      triggers: [],
    });
  });
});

describe('WorkflowOutputStepSchema', () => {
  it('should validate a basic workflow.output step', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'emit_output',
      type: 'workflow.output',
      with: {
        result: 'success',
        count: 42,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: 'emit_output',
        type: 'workflow.output',
        status: 'completed', // default status
        with: {
          result: 'success',
          count: 42,
        },
      });
    }
  });

  it('should apply default status of "completed"', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'emit_output',
      type: 'workflow.output',
      with: { data: 'test' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('completed');
    }
  });

  it('should accept status: completed', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'emit_output',
      type: 'workflow.output',
      status: 'completed',
      with: { data: 'test' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('completed');
    }
  });

  it('should accept status: cancelled', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'emit_output',
      type: 'workflow.output',
      status: 'cancelled',
      with: { data: 'test' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('cancelled');
    }
  });

  it('should accept status: failed', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'emit_output',
      type: 'workflow.output',
      status: 'failed',
      with: { error: 'Something went wrong' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
    }
  });

  it('should reject invalid status values', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'emit_output',
      type: 'workflow.output',
      status: 'pending', // invalid
      with: { data: 'test' },
    });

    expect(result.success).toBe(false);
  });

  it('should accept complex output values', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'emit_output',
      type: 'workflow.output',
      with: {
        stringField: 'test',
        numberField: 123,
        booleanField: true,
        arrayField: [1, 2, 3],
        objectField: { nested: 'value' },
        expressionField: '{{ steps.previous.output }}',
      },
    });

    expect(result.success).toBe(true);
  });

  it('should support if conditions', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'conditional_output',
      type: 'workflow.output',
      if: '{{ steps.check.output.shouldEmit }}',
      with: { result: 'success' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.if).toBe('{{ steps.check.output.shouldEmit }}');
    }
  });

  it('should require name field', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      type: 'workflow.output',
      with: { data: 'test' },
    });

    expect(result.success).toBe(false);
  });

  it('should require with field', () => {
    const result = WorkflowOutputStepSchema.safeParse({
      name: 'emit_output',
      type: 'workflow.output',
    });

    expect(result.success).toBe(false);
  });
});

describe('WorkflowSchema with workflow.output', () => {
  it('should accept a workflow with workflow.output step', () => {
    const result = WorkflowSchema.safeParse({
      name: 'test-workflow',
      triggers: [{ type: 'manual' }],
      outputs: [
        { name: 'result', type: 'string', required: true },
        { name: 'count', type: 'number', required: true },
      ],
      steps: [
        {
          name: 'process',
          type: 'http',
          with: { url: 'https://api.example.com' },
        },
        {
          name: 'emit_result',
          type: 'workflow.output',
          status: 'completed',
          with: {
            result: '{{ steps.process.output.data }}',
            count: 42,
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('should accept workflow.output as the only step', () => {
    const result = WorkflowSchema.safeParse({
      name: 'test-workflow',
      triggers: [{ type: 'manual' }],
      outputs: [{ name: 'message', type: 'string' }],
      steps: [
        {
          name: 'emit_immediately',
          type: 'workflow.output',
          with: { message: 'Hello, World!' },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('should accept workflow with outputs but no workflow.output step', () => {
    const result = WorkflowSchema.safeParse({
      name: 'test-workflow',
      triggers: [{ type: 'manual' }],
      outputs: [{ name: 'result', type: 'string' }],
      steps: [
        {
          name: 'process',
          type: 'http',
          with: { url: 'https://api.example.com' },
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe('ConcurrencySettingsSchema', () => {
  describe('key', () => {
    it('should accept valid key string', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        key: 'server-1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe('server-1');
      }
    });

    it('should accept template expression key', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        key: '{{ event.host.name }}',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe('{{ event.host.name }}');
      }
    });

    it('should accept empty key', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        key: '',
      });
      expect(result.success).toBe(true);
    });

    it('should allow key to be optional', () => {
      const result = ConcurrencySettingsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBeUndefined();
      }
    });
  });

  describe('strategy', () => {
    it('should accept valid strategy values', () => {
      const strategies = ['cancel-in-progress', 'drop', 'queue'] as const;
      strategies.forEach((strategy) => {
        const result = ConcurrencySettingsSchema.safeParse({
          strategy,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.strategy).toBe(strategy);
        }
      });
    });

    it('should reject invalid strategy values', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        strategy: 'invalid-strategy',
      });
      expect(result.success).toBe(false);
    });

    it('should allow strategy to be omitted', () => {
      const result = ConcurrencySettingsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strategy).toBeUndefined();
      }
    });
  });

  describe('max', () => {
    it('should accept valid positive integer values', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        max: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.max).toBe(5);
      }
    });

    it('should accept minimum value of 1', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        max: 1,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.max).toBe(1);
      }
    });

    it('should reject values less than 1', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        max: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative values', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        max: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer values', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        max: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it('should allow max to be omitted', () => {
      const result = ConcurrencySettingsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.max).toBeUndefined();
      }
    });
  });

  describe('queue-size', () => {
    it('should accept optional queue-size when strategy is queue', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        strategy: 'queue',
        'queue-size': 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data['queue-size']).toBe(10);
      }
    });

    it('should allow queue-size to be omitted', () => {
      const result = ConcurrencySettingsSchema.safeParse({ strategy: 'queue' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data['queue-size']).toBeUndefined();
      }
    });

    it('should reject queue-size less than 1', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        strategy: 'queue',
        'queue-size': 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('queue-ttl', () => {
    it('should accept optional queue-ttl duration', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        strategy: 'queue',
        'queue-ttl': '24h',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data['queue-ttl']).toBe('24h');
      }
    });

    it('should reject invalid queue-ttl format', () => {
      const result = ConcurrencySettingsSchema.safeParse({
        strategy: 'queue',
        'queue-ttl': 'not-a-duration',
      });
      expect(result.success).toBe(false);
    });
  });

  it('should export ConcurrencySettings type that matches schema inference', () => {
    // Verify the type can be used and matches the schema inference
    const testSettings: ConcurrencySettings = {
      key: '{{ event.host.name }}',
      strategy: 'drop',
      max: 3,
    };
    const result = ConcurrencySettingsSchema.safeParse(testSettings);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe(testSettings.key);
      expect(result.data.strategy).toBe(testSettings.strategy);
      expect(result.data.max).toBe(testSettings.max);
    }
  });
});

describe('WorkflowSettingsSchema', () => {
  describe('concurrency', () => {
    it('should accept valid concurrency settings', () => {
      const result = WorkflowSettingsSchema.safeParse({
        concurrency: {
          key: '{{ event.host.name }}',
          strategy: 'cancel-in-progress',
          max: 3,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.concurrency?.key).toBe('{{ event.host.name }}');
        expect(result.data.concurrency?.strategy).toBe('cancel-in-progress');
        expect(result.data.concurrency?.max).toBe(3);
      }
    });

    it('should accept partial concurrency settings', () => {
      const result = WorkflowSettingsSchema.safeParse({
        concurrency: {
          key: 'server-1',
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.concurrency?.key).toBe('server-1');
        expect(result.data.concurrency?.strategy).toBeUndefined();
        expect(result.data.concurrency?.max).toBeUndefined();
      }
    });

    it('should allow concurrency to be omitted', () => {
      const result = WorkflowSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.concurrency).toBeUndefined();
      }
    });

    it('should validate nested concurrency fields', () => {
      const result = WorkflowSettingsSchema.safeParse({
        concurrency: {
          strategy: 'invalid-strategy',
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('liquid', () => {
    const validLiquidSettings = {
      parseLimit: 200_000,
      renderLimit: 2_000,
      memoryLimit: 30_000_000,
    };

    it('should accept valid liquid limit settings', () => {
      const result = WorkflowSettingsSchema.safeParse({
        liquid: validLiquidSettings,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.liquid).toEqual(validLiquidSettings);
      }
    });

    it.each([
      ['parseLimit below minimum', { ...validLiquidSettings, parseLimit: 0 }],
      ['parseLimit not integer', { ...validLiquidSettings, parseLimit: 1.5 }],
      [
        'parseLimit above maximum',
        { ...validLiquidSettings, parseLimit: LIQUID_PARSE_LIMIT_MAX + 1 },
      ],
      ['renderLimit below minimum', { ...validLiquidSettings, renderLimit: 0 }],
      ['renderLimit not integer', { ...validLiquidSettings, renderLimit: 1.5 }],
      [
        'renderLimit above maximum',
        { ...validLiquidSettings, renderLimit: LIQUID_RENDER_LIMIT_MAX + 1 },
      ],
      ['memoryLimit below minimum', { ...validLiquidSettings, memoryLimit: 0 }],
      ['memoryLimit not integer', { ...validLiquidSettings, memoryLimit: 1.5 }],
      [
        'memoryLimit above maximum',
        { ...validLiquidSettings, memoryLimit: LIQUID_MEMORY_LIMIT_MAX + 1 },
      ],
    ])('should reject liquid settings with %s', (_, liquid) => {
      const result = WorkflowSettingsSchema.safeParse({
        liquid,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('CollisionStrategySchema', () => {
    it('should accept all valid strategy values', () => {
      expect(CollisionStrategySchema.safeParse('cancel-in-progress').success).toBe(true);
      expect(CollisionStrategySchema.safeParse('drop').success).toBe(true);
      expect(CollisionStrategySchema.safeParse('queue').success).toBe(true);
    });

    it('should reject invalid strategy values', () => {
      expect(CollisionStrategySchema.safeParse('invalid').success).toBe(false);
      expect(CollisionStrategySchema.safeParse('').success).toBe(false);
      expect(CollisionStrategySchema.safeParse(null).success).toBe(false);
    });

    it('should export CollisionStrategy type that matches valid values', () => {
      // Verify the type can be used and matches the schema values
      const validStrategies: CollisionStrategy[] = ['cancel-in-progress', 'drop', 'queue'];
      validStrategies.forEach((strategy) => {
        const result = CollisionStrategySchema.safeParse(strategy);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(strategy);
        }
      });
    });
  });
});

describe('JsonModelSchema', () => {
  it('should validate a simple JSON Schema inputs object', () => {
    const inputs = {
      properties: {
        username: {
          type: 'string',
          description: "User's username",
        },
        age: {
          type: 'number',
          description: "User's age",
          default: 18,
        },
      },
      required: ['username'],
      additionalProperties: false,
    };
    const result = JsonModelSchema.safeParse(inputs);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.properties?.username).toEqual({
        type: 'string',
        description: "User's username",
      });
      expect(result.data.required).toEqual(['username']);
    }
  });

  it('should accept additionalProperties as a value schema (typed map)', () => {
    const inputs = {
      properties: {
        rules: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
    };
    const result = JsonModelSchema.safeParse(inputs);
    expect(result.success).toBe(true);
  });

  it('should validate a nested JSON Schema inputs object', () => {
    const inputs = {
      properties: {
        customer: {
          type: 'object',
          description: 'Customer information',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                zipCode: { type: 'string', pattern: '^\\d{5}(-\\d{4})?$' },
              },
              required: ['street', 'city'],
              additionalProperties: false,
            },
          },
          required: ['name', 'email'],
          additionalProperties: false,
        },
      },
      required: ['customer'],
      additionalProperties: false,
    };
    const result = JsonModelSchema.safeParse(inputs);
    expect(result.success).toBe(true);
  });

  it('should reject invalid JSON Schema in properties', () => {
    const inputs = {
      properties: {
        invalid: {
          type: 'invalid-type',
        },
      },
    };
    const result = JsonModelSchema.safeParse(inputs);
    expect(result.success).toBe(false);
  });

  it('should reject if required field does not exist in properties', () => {
    const inputs = {
      properties: {
        username: { type: 'string' },
      },
      required: ['username', 'nonexistent'],
    };
    const result = JsonModelSchema.safeParse(inputs);
    expect(result.success).toBe(false);
  });

  it('should accept new JSON Schema object format for inputs', () => {
    const workflow = {
      version: '1',
      name: 'test',
      triggers: [
        {
          type: 'manual',
          inputs: {
            properties: {
              username: {
                type: 'string',
                description: "User's username",
              },
              age: {
                type: 'number',
                description: "User's age",
                default: 18,
              },
            },
            required: ['username'],
            additionalProperties: false,
          },
        },
      ],
      steps: [{ name: 'step1', type: 'console' }],
    };
    const result = WorkflowSchema.safeParse(workflow);
    expect(result.success).toBe(true);
    if (result.success) {
      const manualTrigger = result.data.triggers?.find((trigger) => isManualTrigger(trigger));
      if (!manualTrigger) {
        fail('Manual trigger should be defined');
      }
      const inputs = manualTrigger.inputs;
      const jsonSchemaInputs = JsonModelSchema.parse(inputs);
      expect(jsonSchemaInputs?.properties?.username).toEqual({
        type: 'string',
        description: "User's username",
      });
      expect(jsonSchemaInputs?.required).toEqual(['username']);
    }
  });

  it('should accept nested object example from requirements', () => {
    const workflow = {
      version: '1',
      name: 'test',
      triggers: [{ type: 'manual' }],
      steps: [{ name: 'step1', type: 'console' }],
      inputs: {
        properties: {
          customer: {
            type: 'object',
            description: 'Customer information',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
              address: {
                type: 'object',
                properties: {
                  street: { type: 'string' },
                  city: { type: 'string' },
                  zipCode: { type: 'string', pattern: '^\\d{5}(-\\d{4})?$' },
                },
                required: ['street', 'city'],
                additionalProperties: false,
              },
            },
            required: ['name', 'email'],
            additionalProperties: false,
          },
        },
        required: ['customer'],
        additionalProperties: false,
      },
    };
    const result = WorkflowSchema.safeParse(workflow);
    expect(result.success).toBe(true);
  });

  it('should accept JSON Schema inputs in WorkflowSchemaForAutocomplete (new format)', () => {
    const workflow = {
      name: 'New workflow',
      enabled: false,
      triggers: [
        {
          type: 'manual',
          inputs: {
            properties: {
              fields: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  name: { type: 'string' },
                },
                required: ['email', 'name'],
              },
            },
            required: ['fields'],
            additionalProperties: false,
          },
        },
      ],
      steps: [
        {
          name: 'first-step',
          type: 'console',
          with: {
            message: '{{ inputs }}',
          },
        },
      ],
    };
    const result = WorkflowSchemaForAutocomplete.safeParse(workflow);
    expect(result.success).toBe(true);
    if (result.success) {
      const manualTrigger = result.data.triggers?.find((trigger) => isManualTrigger(trigger));
      if (!manualTrigger) {
        fail('Manual trigger should be defined');
      }
      const inputs = manualTrigger.inputs;
      const jsonSchemaInputs = JsonModelSchema.parse(inputs);
      expect(jsonSchemaInputs?.properties?.fields).toBeDefined();
      expect(jsonSchemaInputs?.required).toEqual(['fields']);
    }
  });

  it('should accept legacy array format in WorkflowSchemaForAutocomplete (backward compatibility)', () => {
    const workflow = {
      name: 'Legacy workflow',
      triggers: [
        {
          type: 'manual',
          inputs: [
            {
              name: 'username',
              type: 'string',
              required: true,
            },
          ],
        },
      ],
      steps: [{ name: 'step1', type: 'console' }],
    };
    const result = WorkflowSchemaForAutocomplete.safeParse(workflow);
    expect(result.success).toBe(true);
  });
});

describe('BaseEventSchema', () => {
  it('should have only spaceId (no timestamp)', () => {
    const shape = BaseEventSchema.shape;
    expect(Object.keys(shape)).toEqual(['spaceId']);
    expect(shape).not.toHaveProperty('timestamp');
  });

  it('should accept valid event with spaceId', () => {
    const result = BaseEventSchema.safeParse({ spaceId: 'default' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ spaceId: 'default' });
    }
  });

  it('should reject event without spaceId', () => {
    const result = BaseEventSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('EventTimestampSchema', () => {
  it('should have timestamp field', () => {
    const shape = EventTimestampSchema.shape;
    expect(Object.keys(shape)).toEqual(['timestamp']);
    expect(shape.timestamp).toBeDefined();
  });

  it('should accept valid ISO 8601 timestamp string', () => {
    const result = EventTimestampSchema.safeParse({
      timestamp: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timestamp).toBe('2025-01-01T00:00:00.000Z');
    }
  });

  it('should reject missing timestamp', () => {
    const result = EventTimestampSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('ParallelStepSchema', () => {
  const baseParallel = {
    name: 'fan-out',
    type: 'parallel',
    foreach: '{{ steps.list.output }}',
    steps: [{ name: 'inner', type: 'console', with: { message: 'hi' } }],
  };

  it('accepts a dynamic parallel step with a foreach and single branch step', () => {
    expect(ParallelStepSchema.safeParse(baseParallel).success).toBe(true);
  });

  it('accepts a bare-number concurrency shorthand within the ceiling', () => {
    const result = ParallelStepSchema.safeParse({ ...baseParallel, concurrency: 3 });
    expect(result.success).toBe(true);
  });

  it('accepts a concurrency object with max and count-waiting', () => {
    const result = ParallelStepSchema.safeParse({
      ...baseParallel,
      concurrency: { max: 4, 'count-waiting': false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a bare-number concurrency above the ceiling', () => {
    const result = ParallelStepSchema.safeParse({
      ...baseParallel,
      concurrency: DEFAULT_PARALLEL_MAX_CONCURRENCY + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a concurrency.max above the ceiling', () => {
    const result = ParallelStepSchema.safeParse({
      ...baseParallel,
      concurrency: { max: DEFAULT_PARALLEL_MAX_CONCURRENCY + 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty branch body', () => {
    const result = ParallelStepSchema.safeParse({ ...baseParallel, steps: [] });
    expect(result.success).toBe(false);
  });

  it('accepts fail-fast and settled modes and rejects others', () => {
    expect(ParallelStepSchema.safeParse({ ...baseParallel, mode: 'fail-fast' }).success).toBe(true);
    expect(ParallelStepSchema.safeParse({ ...baseParallel, mode: 'settled' }).success).toBe(true);
    expect(ParallelStepSchema.safeParse({ ...baseParallel, mode: 'whatever' }).success).toBe(false);
  });

  it('accepts overall and per-branch timeouts in duration format', () => {
    const result = ParallelStepSchema.safeParse({
      ...baseParallel,
      timeout: '5m',
      'branch-timeout': '30s',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid branch-timeout duration', () => {
    const result = ParallelStepSchema.safeParse({ ...baseParallel, 'branch-timeout': 'soon' });
    expect(result.success).toBe(false);
  });

  const staticParallel = {
    name: 'fan-out',
    type: 'parallel',
    branches: [
      { name: 'a', steps: [{ name: 'sa', type: 'console', with: { message: 'a' } }] },
      { name: 'b', steps: [{ name: 'sb', type: 'console', with: { message: 'b' } }] },
    ],
  };

  it('accepts a static parallel step with named branches', () => {
    expect(ParallelStepSchema.safeParse(staticParallel).success).toBe(true);
  });

  it('rejects a static branch with an empty body', () => {
    const result = ParallelStepSchema.safeParse({
      ...staticParallel,
      branches: [
        { name: 'a', steps: [] },
        { name: 'b', steps: [{ name: 'sb', type: 'console', with: { message: 'b' } }] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a static parallel with a single branch (requires >= 2)', () => {
    const result = ParallelStepSchema.safeParse({
      name: 'fan-out',
      type: 'parallel',
      branches: [{ name: 'only', steps: [{ name: 's', type: 'console', with: { message: 'x' } }] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate static branch names (name doubles as the aggregate key)', () => {
    const result = ParallelStepSchema.safeParse({
      ...staticParallel,
      branches: [
        { name: 'dup', steps: [{ name: 's1', type: 'console', with: { message: '1' } }] },
        { name: 'dup', steps: [{ name: 's2', type: 'console', with: { message: '2' } }] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts distinct static branch names', () => {
    expect(ParallelStepSchema.safeParse(staticParallel).success).toBe(true);
  });

  // Returns true when the parse failed specifically on the mode refinement,
  // so we don't accidentally accept a rejection that fired for another reason.
  const failedWithModeMessage = (value: unknown): boolean => {
    const result = ParallelStepSchema.safeParse(value);
    return (
      !result.success &&
      result.error.issues.some((issue) => issue.message === PARALLEL_MODE_REFINEMENT_MESSAGE)
    );
  };

  it('rejects mixing foreach and branches (with steps) via the mode refinement', () => {
    expect(
      failedWithModeMessage({
        name: 'fan-out',
        type: 'parallel',
        foreach: '{{ steps.list.output }}',
        steps: [{ name: 'inner', type: 'console', with: { message: 'hi' } }],
        branches: staticParallel.branches,
      })
    ).toBe(true);
  });

  it('rejects mixing foreach and branches even when no top-level steps are given', () => {
    expect(
      failedWithModeMessage({
        name: 'fan-out',
        type: 'parallel',
        foreach: '{{ steps.list.output }}',
        branches: staticParallel.branches,
      })
    ).toBe(true);
  });

  it('rejects mixing foreach (with empty steps) and branches', () => {
    expect(
      failedWithModeMessage({
        name: 'fan-out',
        type: 'parallel',
        foreach: '{{ steps.list.output }}',
        steps: [],
        branches: staticParallel.branches,
      })
    ).toBe(true);
  });

  it('rejects a step with neither foreach nor branches via the mode refinement', () => {
    expect(failedWithModeMessage({ name: 'fan-out', type: 'parallel' })).toBe(true);
  });

  it('rejects foreach without steps via the mode refinement', () => {
    expect(
      failedWithModeMessage({
        name: 'fan-out',
        type: 'parallel',
        foreach: '{{ steps.list.output }}',
      })
    ).toBe(true);
  });

  it('rejects top-level steps alongside branches (static mode must omit steps)', () => {
    expect(
      failedWithModeMessage({
        ...staticParallel,
        steps: [{ name: 'inner', type: 'console', with: { message: 'hi' } }],
      })
    ).toBe(true);
  });

  it('reports duplicate static branch names via the branch-names refinement', () => {
    const result = ParallelStepSchema.safeParse({
      name: 'fan-out',
      type: 'parallel',
      branches: [
        { name: 'dup', steps: [{ name: 'a', type: 'console', with: { message: 'x' } }] },
        { name: 'dup', steps: [{ name: 'b', type: 'console', with: { message: 'y' } }] },
      ],
    });
    expect(result.success).toBe(false);
    expect(
      !result.success &&
        result.error.issues.some((issue) => issue.message === PARALLEL_BRANCH_NAMES_UNIQUE_MESSAGE)
    ).toBe(true);
  });
});

describe('`if` condition on step schemas', () => {
  // `if` comes from `BaseStepSchema`, but a schema can drop it by overriding the key.
  const cases = [
    {
      name: 'wait',
      schema: WaitStepSchema,
      step: { name: 's', type: 'wait', with: { duration: '5s' } },
    },
    {
      name: 'waitForInput',
      schema: WaitForInputStepSchema,
      step: { name: 's', type: 'waitForInput', with: { message: 'input?' } },
    },
    {
      name: 'waitForApproval',
      schema: WaitForApprovalStepSchema,
      step: { name: 's', type: 'waitForApproval', with: { message: 'approve?' } },
    },
    {
      name: 'data.set',
      schema: DataSetStepSchema,
      step: { name: 's', type: 'data.set', with: { key: 'value' } },
    },
    {
      name: 'elasticsearch.*',
      schema: ElasticsearchStepSchema,
      step: { name: 's', type: 'elasticsearch.search', with: { index: 'x' } },
    },
    {
      name: 'kibana.*',
      schema: KibanaStepSchema,
      step: {
        name: 's',
        type: 'kibana.request',
        with: { request: { method: 'GET', path: '/api/status' } },
      },
    },
    {
      name: 'parallel',
      // The refined export, not the object schema, so this matches what callers use.
      schema: ParallelStepSchema,
      step: {
        name: 's',
        type: 'parallel',
        foreach: '{{ items }}',
        steps: [{ name: 'inner', type: 'console', with: { message: 'hi' } }],
      },
    },
    {
      name: 'merge',
      schema: MergeStepSchema,
      step: {
        name: 's',
        type: 'merge',
        sources: ['a', 'b'],
        steps: [{ name: 'after', type: 'console', with: { message: 'hi' } }],
      },
    },
    {
      name: 'workflow.execute',
      schema: WorkflowExecuteStepSchema,
      step: { name: 's', type: 'workflow.execute', with: { 'workflow-id': 'child' } },
    },
    {
      name: 'workflow.executeAsync',
      schema: WorkflowExecuteAsyncStepSchema,
      step: { name: 's', type: 'workflow.executeAsync', with: { 'workflow-id': 'child' } },
    },
  ];

  it.each(cases)('accepts an `if` condition on the $name step', ({ schema, step }) => {
    expect(getShape(schema)).toHaveProperty('if');
    expect(schema.parse({ ...step, if: '{{ inputs.enabled }}' }).if).toBe('{{ inputs.enabled }}');
  });

  it('rejects a step-level `if` on the `if` step, which gates on `condition`', () => {
    const ifStep = {
      name: 's',
      type: 'if',
      condition: 'inputs.enabled : true',
      steps: [{ name: 'inner', type: 'console', with: { message: 'hi' } }],
    };

    expect(IfStepSchema.safeParse(ifStep).success).toBe(true);

    const result = IfStepSchema.safeParse({ ...ifStep, if: '{{ inputs.enabled }}' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['if']);
  });

  it("bounds the condition length on both `if` and the `if` step's `condition`", () => {
    const atLimit = 'a'.repeat(IF_CONDITION_MAX_LENGTH);
    const overLimit = 'a'.repeat(IF_CONDITION_MAX_LENGTH + 1);
    const waitStep = { name: 's', type: 'wait', with: { duration: '5s' } };
    const ifStep = {
      name: 's',
      type: 'if',
      steps: [{ name: 'inner', type: 'console', with: { message: 'hi' } }],
    };

    expect(WaitStepSchema.safeParse({ ...waitStep, if: atLimit }).success).toBe(true);
    expect(WaitStepSchema.safeParse({ ...waitStep, if: overLimit }).success).toBe(false);

    expect(IfStepSchema.safeParse({ ...ifStep, condition: atLimit }).success).toBe(true);
    expect(IfStepSchema.safeParse({ ...ifStep, condition: overLimit }).success).toBe(false);
  });
});
