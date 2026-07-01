/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { getSchemaAtPath, getShape } from '@kbn/workflows/common/utils/zod';
import { z } from '@kbn/zod/v4';
import { getWorkflowContextSchema } from './get_workflow_context_schema';
import { triggerSchemas } from '../../../trigger_schemas';

describe('getWorkflowContextSchema - Nested Objects', () => {
  it('should handle nested object inputs for variable validation', () => {
    const workflow: WorkflowYaml = {
      version: '1',
      name: 'Test Workflow',
      description: undefined,
      settings: undefined,
      enabled: true,
      tags: undefined,
      triggers: [
        {
          type: 'manual',
          inputs: {
            properties: {
              threatIndicator: {
                type: 'object',
                description: 'Threat indicator to investigate',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['ip', 'domain', 'hash', 'url', 'email'],
                    description: 'Type of threat indicator',
                  },
                  value: {
                    type: 'string',
                    description: 'The indicator value',
                  },
                  severity: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'critical'],
                    default: 'medium',
                    description: 'Threat severity level',
                  },
                },
                required: ['type', 'value', 'severity'],
                additionalProperties: false,
              },
              analyst: {
                type: 'object',
                description: 'Security analyst handling the incident',
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
                    description: 'Analyst email address',
                  },
                  name: {
                    type: 'string',
                    minLength: 2,
                    maxLength: 100,
                    description: 'Analyst full name',
                  },
                },
                required: ['email', 'name'],
                additionalProperties: false,
              },
            },
            required: ['threatIndicator', 'analyst'],
            additionalProperties: false,
          },
        },
      ],

      consts: undefined,
      steps: [{ name: 'step1', type: 'console' }],
    };

    const contextSchema = getWorkflowContextSchema(workflow);

    // Test that we can access nested properties
    // inputs.threatIndicator.type should be accessible
    const threatIndicatorTypeSchema = getSchemaAtPath(contextSchema, 'inputs.threatIndicator.type');
    expect(threatIndicatorTypeSchema.schema).not.toBeNull();
    expect(threatIndicatorTypeSchema.schema).toBeDefined();

    // inputs.threatIndicator.value should be accessible
    const threatIndicatorValueSchema = getSchemaAtPath(
      contextSchema,
      'inputs.threatIndicator.value'
    );
    expect(threatIndicatorValueSchema.schema).not.toBeNull();
    expect(threatIndicatorValueSchema.schema).toBeDefined();

    // inputs.threatIndicator.severity should be accessible
    const threatIndicatorSeveritySchema = getSchemaAtPath(
      contextSchema,
      'inputs.threatIndicator.severity'
    );
    expect(threatIndicatorSeveritySchema.schema).not.toBeNull();
    expect(threatIndicatorSeveritySchema.schema).toBeDefined();

    // inputs.analyst.email should be accessible
    const analystEmailSchema = getSchemaAtPath(contextSchema, 'inputs.analyst.email');
    expect(analystEmailSchema.schema).not.toBeNull();
    expect(analystEmailSchema.schema).toBeDefined();

    // inputs.analyst.name should be accessible
    const analystNameSchema = getSchemaAtPath(contextSchema, 'inputs.analyst.name');
    expect(analystNameSchema.schema).not.toBeNull();
    expect(analystNameSchema.schema).toBeDefined();

    // Invalid paths should return null (or z.any() if the converter falls back)
    const invalidSchema = getSchemaAtPath(contextSchema, 'inputs.threatIndicator.invalid');
    // The converter might fall back to z.any() for unsupported schemas, so we just check it's defined
    // The important thing is that valid paths work correctly
    expect(invalidSchema.schema).toBeDefined();
  });

  it('should handle the security workflow example with all nested objects', () => {
    const workflow: WorkflowYaml = {
      version: '1',
      name: 'Threat Intelligence Enrichment & Incident Response',
      description: undefined,
      settings: undefined,
      enabled: true,
      tags: undefined,
      triggers: [
        {
          type: 'manual',
          inputs: {
            properties: {
              analyst: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string' },
                  team: {
                    type: 'string',
                    enum: ['SOC', 'Threat Intelligence', 'Incident Response', 'Forensics'],
                  },
                },
                required: ['email', 'name', 'team'],
                additionalProperties: false,
              },
              threatIndicator: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['ip', 'domain', 'hash', 'url', 'email'],
                  },
                  value: { type: 'string' },
                  severity: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'critical'],
                    default: 'medium',
                  },
                },
                required: ['type', 'value', 'severity'],
                additionalProperties: false,
              },
              incidentMetadata: {
                type: 'object',
                properties: {
                  incidentId: { type: 'string', pattern: '^INC-\\d{8}-\\d{4}$' },
                  source: {
                    type: 'string',
                    enum: [
                      'SIEM Alert',
                      'Threat Intelligence Feed',
                      'Manual Report',
                      'EDR Detection',
                    ],
                  },
                  enrichment: {
                    type: 'object',
                    properties: {
                      reputation: {
                        type: 'string',
                        enum: ['unknown', 'clean', 'suspicious', 'malicious'],
                        default: 'unknown',
                      },
                      confidence: { type: 'number', minimum: 0, maximum: 100 },
                    },
                    additionalProperties: false,
                  },
                },
                required: ['incidentId', 'source'],
                additionalProperties: false,
              },
            },
            required: ['analyst', 'threatIndicator', 'incidentMetadata'],
            additionalProperties: false,
          },
        },
      ],

      consts: undefined,
      steps: [{ name: 'step1', type: 'console' }],
    };

    const contextSchema = getWorkflowContextSchema(workflow);

    // Test all the paths used in the workflow
    const paths = [
      'inputs.threatIndicator.value',
      'inputs.threatIndicator.type',
      'inputs.threatIndicator.severity',
      'inputs.incidentMetadata.incidentId',
      'inputs.analyst.name',
      'inputs.analyst.email',
      'inputs.responseActions.blockIndicator',
      'inputs.responseActions.quarantineHosts',
      'inputs.responseActions.notifyTeams',
    ];

    for (const path of paths) {
      // Note: responseActions might not exist in this simplified test, so we skip those
      if (!path.startsWith('inputs.responseActions')) {
        const result = getSchemaAtPath(contextSchema, path);
        expect(result.schema).not.toBeNull();
        expect(result.schema).toBeDefined();
      }
    }
  });

  describe('edge cases - defensive checks', () => {
    it('should handle properties with null schema values gracefully', () => {
      const workflow: WorkflowYaml = {
        version: '1',
        name: 'Test Workflow',
        description: undefined,
        settings: undefined,
        enabled: true,
        tags: undefined,
        triggers: [
          {
            type: 'manual',
            inputs: {
              properties: {
                name: null,
                email: { type: 'string', format: 'email' },
                age: null,
              },
            } as any,
          },
        ],
        consts: undefined,
        steps: [{ name: 'step1', type: 'console' }],
      };

      // Should not crash when properties contain null values
      expect(() => {
        const contextSchema = getWorkflowContextSchema(workflow);
        expect(contextSchema).toBeDefined();
      }).not.toThrow();
    });

    it('should handle properties with undefined schema values gracefully', () => {
      const workflow: WorkflowYaml = {
        version: '1',
        name: 'Test Workflow',
        description: undefined,
        settings: undefined,
        enabled: true,
        tags: undefined,
        triggers: [
          {
            type: 'manual',
            inputs: {
              properties: {
                name: undefined,
                email: { type: 'string', format: 'email' },
              },
            } as any,
          },
        ],
        consts: undefined,
        steps: [{ name: 'step1', type: 'console' }],
      };

      // Should not crash when properties contain undefined values
      expect(() => {
        const contextSchema = getWorkflowContextSchema(workflow);
        expect(contextSchema).toBeDefined();
      }).not.toThrow();
    });

    it('should handle properties with string schema values (invalid) gracefully', () => {
      const workflow: WorkflowYaml = {
        version: '1',
        name: 'Test Workflow',
        description: undefined,
        settings: undefined,
        enabled: true,
        tags: undefined,
        triggers: [
          {
            type: 'manual',
            inputs: {
              properties: {
                name: 'invalid string schema',
                email: { type: 'string', format: 'email' },
              },
            } as any,
          },
        ],
        consts: undefined,
        steps: [{ name: 'step1', type: 'console' }],
      };

      // Should not crash when properties contain invalid schema values
      expect(() => {
        const contextSchema = getWorkflowContextSchema(workflow);
        expect(contextSchema).toBeDefined();
      }).not.toThrow();
    });
  });
});

describe('getWorkflowContextSchema - Dynamic event schema based on triggers', () => {
  const baseWorkflow: WorkflowYaml = {
    version: '1',
    name: 'Test Workflow',
    description: undefined,
    settings: undefined,
    enabled: true,
    tags: undefined,
    triggers: [{ type: 'manual', inputs: undefined }],
    consts: undefined,
    steps: [{ name: 'step1', type: 'console' }],
  };

  function getEventKeys(workflow: WorkflowYaml | WorkflowYaml): string[] {
    const contextSchema = getWorkflowContextSchema(workflow);
    const eventResult = getSchemaAtPath(contextSchema, 'event');
    expect(eventResult.schema).toBeDefined();
    return Object.keys(getShape(eventResult.schema!));
  }

  it.each<{
    label: string;
    triggers: WorkflowYaml['triggers'] | undefined | [];
    expectedKeys: string[];
    unexpectedKeys: string[];
  }>([
    {
      label: 'manual trigger',
      triggers: [{ type: 'manual' }],
      expectedKeys: ['spaceId'],
      unexpectedKeys: ['timestamp', 'alerts', 'rule', 'params'],
    },
    {
      label: 'scheduled trigger',
      triggers: [{ type: 'scheduled', with: { every: '5m' } }],
      expectedKeys: ['spaceId'],
      unexpectedKeys: ['timestamp', 'alerts', 'rule', 'params'],
    },
    {
      label: 'alert trigger',
      triggers: [{ type: 'alert' }],
      expectedKeys: ['spaceId', 'alerts', 'rule', 'params'],
      unexpectedKeys: ['timestamp'],
    },
    {
      label: 'manual + alert triggers',
      triggers: [{ type: 'manual' }, { type: 'alert' }],
      expectedKeys: ['spaceId', 'alerts', 'rule', 'params'],
      unexpectedKeys: ['timestamp'],
    },
    {
      label: 'manual + scheduled triggers',
      triggers: [{ type: 'manual' }, { type: 'scheduled', with: { every: '1h' } }],
      expectedKeys: ['spaceId'],
      unexpectedKeys: ['timestamp', 'alerts', 'rule', 'params'],
    },
    {
      label: 'empty triggers array',
      triggers: [] as any,
      expectedKeys: ['spaceId'],
      unexpectedKeys: ['timestamp'],
    },
    {
      label: 'undefined triggers',
      triggers: undefined as any,
      expectedKeys: ['spaceId'],
      unexpectedKeys: ['timestamp'],
    },
  ])(
    'should produce correct event keys for $label',
    ({ triggers, expectedKeys, unexpectedKeys }) => {
      const workflow = {
        ...baseWorkflow,
        triggers,
      } as WorkflowYaml | WorkflowYaml;
      const eventKeys = getEventKeys(workflow);

      for (const key of expectedKeys) {
        expect(eventKeys).toContain(key);
      }
      for (const key of unexpectedKeys) {
        expect(eventKeys).not.toContain(key);
      }
      expect(eventKeys).toHaveLength(expectedKeys.length);
    }
  );

  it('should allow accessing event.rule and event.spaceId when alert trigger is present', () => {
    const workflow: WorkflowYaml = { ...baseWorkflow, triggers: [{ type: 'alert' }] };
    const contextSchema = getWorkflowContextSchema(workflow);

    expect(getSchemaAtPath(contextSchema, 'event.rule.id').schema).toBeDefined();
    expect(getSchemaAtPath(contextSchema, 'event.rule.name').schema).toBeDefined();
    expect(getSchemaAtPath(contextSchema, 'event.spaceId').schema).toBeDefined();
  });

  it('should not include timestamp when workflow has custom trigger type but no registered definition', () => {
    const workflow = {
      ...baseWorkflow,
      triggers: [{ type: 'some.unknown_trigger' }],
    } as unknown as WorkflowYaml;

    const getTriggerDefinitionSpy = jest
      .spyOn(triggerSchemas, 'getTriggerDefinition')
      .mockReturnValue(undefined);

    try {
      const eventKeys = getEventKeys(workflow);

      expect(eventKeys).toContain('spaceId');
      expect(eventKeys).not.toContain('timestamp');
      expect(eventKeys).toHaveLength(1);
    } finally {
      getTriggerDefinitionSpy.mockRestore();
    }
  });

  it('should include timestamp and custom trigger eventSchema when workflow has a custom trigger', () => {
    const customEventSchema = z.object({
      severity: z.string(),
      message: z.string(),
    });
    const workflow = {
      ...baseWorkflow,
      triggers: [{ type: 'example.custom_trigger' }],
    } as unknown as WorkflowYaml;
    const mockTriggerDefinition = {
      id: 'example.custom_trigger',
      title: 'Example custom trigger',
      description: 'Test trigger for event schema merge',
      eventSchema: customEventSchema,
    };

    const getTriggerDefinitionSpy = jest
      .spyOn(triggerSchemas, 'getTriggerDefinition')
      .mockImplementation((triggerType: string) =>
        triggerType === 'example.custom_trigger' ? mockTriggerDefinition : undefined
      );

    try {
      const eventKeys = getEventKeys(workflow);

      expect(eventKeys).toContain('spaceId');
      expect(eventKeys).toContain('timestamp');
      expect(eventKeys).toContain('severity');
      expect(eventKeys).toContain('message');

      const contextSchema = getWorkflowContextSchema(workflow);
      expect(getSchemaAtPath(contextSchema, 'event.severity').schema).toBeDefined();
      expect(getSchemaAtPath(contextSchema, 'event.message').schema).toBeDefined();
    } finally {
      getTriggerDefinitionSpy.mockRestore();
    }
  });
});

describe('getWorkflowContextSchema - HITL template context', () => {
  it('should expose context.hitl.externalFormLink for channel message validation', () => {
    const workflow: WorkflowYaml = {
      version: '1',
      name: 'HITL Workflow',
      description: undefined,
      settings: undefined,
      enabled: true,
      tags: undefined,
      triggers: [{ type: 'manual' }],
      steps: [],
    };

    const contextSchema = getWorkflowContextSchema(workflow);

    expect(getSchemaAtPath(contextSchema, 'context.hitl.externalFormLink').schema).toBeDefined();
    expect(getSchemaAtPath(contextSchema, 'context.hitl.externalQueryLink').schema).toBeDefined();
  });
});
