/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
import { buildFieldsZodValidator } from './build_fields_zod_validator';
import {
  applyInputDefaults,
  convertLegacyFieldsToJsonSchema,
  extractNormalizedInputsFromYaml,
  getInputsFromDefinition,
  normalizeFieldsToJsonSchema,
  resolveRef,
} from './field_conversion';
import { builtinWorkflowInputDefinitions } from '../builtin_workflow_input_definitions';
import type { WorkflowYaml } from '../schema';
import type { JsonModelSchemaType } from '../schema/common/json_model_schema';
import type { LegacyWorkflowInputSchema } from '../schema/triggers/manual_trigger_schema';

describe('convertLegacyFieldsToJsonSchema', () => {
  it('should convert array of legacy inputs to JSON Schema object format', () => {
    const legacyInputs = [
      {
        name: 'username',
        type: 'string' as const,
        description: 'User name',
        required: true,
        default: 'john',
      },
      {
        name: 'age',
        type: 'number' as const,
        default: 25,
      },
    ];

    const result = convertLegacyFieldsToJsonSchema(
      legacyInputs as Array<z.infer<typeof LegacyWorkflowInputSchema>>
    );

    expect(result).toEqual({
      properties: {
        username: {
          type: 'string',
          description: 'User name',
          default: 'john',
        },
        age: {
          type: 'number',
          default: 25,
        },
      },
      required: ['username'],
    });
  });

  it('should convert choice input to enum', () => {
    const legacyInputs = [
      {
        name: 'status',
        type: 'choice' as const,
        options: ['active', 'inactive'],
        required: true,
      },
    ];

    const result = convertLegacyFieldsToJsonSchema(
      legacyInputs as Array<z.infer<typeof LegacyWorkflowInputSchema>>
    );

    expect(result.properties?.status).toEqual({
      type: 'string',
      enum: ['active', 'inactive'],
    });
    expect(result.required).toEqual(['status']);
  });

  it('should convert array input with constraints', () => {
    const legacyInputs = [
      {
        name: 'tags',
        type: 'array' as const,
        minItems: 1,
        maxItems: 10,
      },
    ];

    const result = convertLegacyFieldsToJsonSchema(
      legacyInputs as Array<z.infer<typeof LegacyWorkflowInputSchema>>
    );

    expect(result.properties?.tags).toEqual({
      type: 'array',
      items: {
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      },
      minItems: 1,
      maxItems: 10,
    });
  });

  it('should handle empty array', () => {
    const result = convertLegacyFieldsToJsonSchema([]);
    expect(result).toEqual({
      properties: {},
    });
  });

  it('should not include required array if no inputs are required', () => {
    const legacyInputs = [
      {
        name: 'optional',
        type: 'string' as const,
        required: false,
      },
    ];

    const result = convertLegacyFieldsToJsonSchema(
      legacyInputs as Array<z.infer<typeof LegacyWorkflowInputSchema>>
    );

    expect(result.required).toBeUndefined();
  });

  it('should handle array with null items (partial YAML parsing)', () => {
    const legacyInputs = [
      {
        name: 'username',
        type: 'string' as const,
        required: true,
      },
      null,
      undefined,
      {
        name: 'age',
        type: 'number' as const,
      },
    ];

    const result = convertLegacyFieldsToJsonSchema(legacyInputs as any);

    expect(result.properties?.username).toEqual({ type: 'string' });
    expect(result.properties?.age).toEqual({ type: 'number' });
    expect(result.required).toEqual(['username']);
    // Should not crash and should only process valid inputs
    expect(Object.keys(result.properties || {})).toEqual(['username', 'age']);
  });
});

describe('normalizeFieldsToJsonSchema', () => {
  it('should return new format inputs as-is', () => {
    const inputs: JsonModelSchemaType = {
      properties: {
        username: {
          type: 'string',
          description: 'User name',
        },
      },
      required: ['username'],
      additionalProperties: false,
    };

    const result = normalizeFieldsToJsonSchema(inputs);
    expect(result).toEqual(inputs);
  });

  it('should convert legacy array format to new format', () => {
    const legacyInputs = [
      {
        name: 'username',
        type: 'string' as const,
        required: true,
      },
    ];

    const result = normalizeFieldsToJsonSchema(legacyInputs as any);

    expect(result?.properties?.username).toEqual({
      type: 'string',
    });
    expect(result?.required).toEqual(['username']);
  });

  it('should return undefined for undefined input', () => {
    const result = normalizeFieldsToJsonSchema(undefined);
    expect(result).toBeUndefined();
  });

  describe('edge cases - partially parsed YAML (defensive checks)', () => {
    it('should handle string input (partially typed "properties")', () => {
      // Simulates user typing "properties:" in YAML editor
      const result = normalizeFieldsToJsonSchema('properties' as any);
      expect(result).toBeUndefined();
    });

    it('should handle number input', () => {
      const result = normalizeFieldsToJsonSchema(123 as any);
      expect(result).toBeUndefined();
    });

    it('should handle boolean input', () => {
      const result = normalizeFieldsToJsonSchema(true as any);
      expect(result).toBeUndefined();
    });

    it('should handle null input', () => {
      const result = normalizeFieldsToJsonSchema(null as any);
      expect(result).toBeUndefined();
    });

    it('should handle empty string input', () => {
      const result = normalizeFieldsToJsonSchema('' as any);
      expect(result).toBeUndefined();
    });

    it('should handle object without properties key', () => {
      const result = normalizeFieldsToJsonSchema({ foo: 'bar' } as any);
      expect(result).toBeUndefined();
    });

    it('should handle object with null properties', () => {
      const result = normalizeFieldsToJsonSchema({ properties: null } as any);
      expect(result).toBeUndefined();
    });

    it('should handle object with string properties', () => {
      const result = normalizeFieldsToJsonSchema({ properties: 'invalid' } as any);
      expect(result).toBeUndefined();
    });

    it('should handle object with array properties (invalid)', () => {
      const result = normalizeFieldsToJsonSchema({ properties: [] } as any);
      // Should return undefined or handle gracefully (array is not valid properties)
      expect(result).toBeUndefined();
    });

    it('should handle object with properties containing null values', () => {
      const result = normalizeFieldsToJsonSchema({
        properties: {
          name: null,
          age: { type: 'number' },
        },
      } as any);
      // Should not crash, but may return undefined or handle gracefully
      expect(result).toBeDefined();
      expect(result?.properties?.age).toEqual({ type: 'number' });
    });

    it('should handle object with properties containing string values (invalid schema)', () => {
      const result = normalizeFieldsToJsonSchema({
        properties: {
          name: 'invalid string schema',
          age: { type: 'number' },
        },
      } as any);
      // Should not crash
      expect(result).toBeDefined();
    });

    it('should handle deeply nested null values', () => {
      const result = normalizeFieldsToJsonSchema({
        properties: {
          user: {
            type: 'object',
            properties: {
              name: null,
              email: { type: 'string' },
            },
          },
        },
      } as any);
      // Should not crash
      expect(result).toBeDefined();
    });
  });

  it('should handle nested object example from requirements', () => {
    const inputs: JsonModelSchemaType = {
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

    const result = normalizeFieldsToJsonSchema(inputs);
    expect(result).toEqual(inputs);
  });
});

describe('applyInputDefaults', () => {
  it('should apply defaults when inputs are undefined', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        name: { type: 'string', default: 'Default Name' },
        age: { type: 'number', default: 25 },
      },
      required: ['name'],
      additionalProperties: false,
    });

    const result = applyInputDefaults(undefined, inputsSchema);
    expect(result).toEqual({
      name: 'Default Name',
      age: 25,
    });
  });

  it('should apply defaults for missing properties', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        name: { type: 'string', default: 'Default Name' },
        age: { type: 'number', default: 25 },
      },
      required: ['name'],
      additionalProperties: false,
    });

    const result = applyInputDefaults({ name: 'Custom Name' }, inputsSchema);
    expect(result).toEqual({
      name: 'Custom Name',
      age: 25,
    });
  });

  it('should render default values when a renderer is provided', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        name: { type: 'string', default: '{{ user }}' },
      },
    });

    const result = applyInputDefaults(undefined, inputsSchema, (value) =>
      value === '{{ user }}' ? 'Alice' : value
    );

    expect(result).toEqual({
      name: 'Alice',
    });
  });

  it('should render provided values when a renderer is provided', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        name: { type: 'string', default: 'Default Name' },
        message: { type: 'string', default: '{{ greeting }}' },
      },
    });

    const result = applyInputDefaults(
      { name: '{{ user }}', message: 'custom' },
      inputsSchema,
      (value) => (value === '{{ user }}' ? 'Alice' : value)
    );

    expect(result).toEqual({
      name: 'Alice',
      message: 'custom',
    });
  });

  it('should render provided nested object values when a renderer is provided', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        settings: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    });

    const result = applyInputDefaults({ settings: { name: '{{ user }}' } }, inputsSchema, (value) =>
      value === '{{ user }}' ? 'Alice' : value
    );

    expect(result).toEqual({
      settings: { name: 'Alice' },
    });
  });

  it('should apply defaults for nested objects', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        analyst: {
          type: 'object',
          properties: {
            email: { type: 'string', default: 'analyst@security.com' },
            name: { type: 'string', default: 'Security Analyst' },
            team: { type: 'string', default: 'SOC' },
          },
          required: ['email', 'name', 'team'],
          additionalProperties: false,
        },
      },
      required: ['analyst'],
      additionalProperties: false,
    });

    const result = applyInputDefaults(undefined, inputsSchema);
    expect(result).toEqual({
      analyst: {
        email: 'analyst@security.com',
        name: 'Security Analyst',
        team: 'SOC',
      },
    });
  });

  it('should apply defaults for partial nested objects', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        analyst: {
          type: 'object',
          properties: {
            email: { type: 'string', default: 'analyst@security.com' },
            name: { type: 'string', default: 'Security Analyst' },
            team: { type: 'string', default: 'SOC' },
          },
          required: ['email', 'name', 'team'],
          additionalProperties: false,
        },
      },
      required: ['analyst'],
      additionalProperties: false,
    });

    const result = applyInputDefaults({ analyst: { email: 'custom@example.com' } }, inputsSchema);
    expect(result).toEqual({
      analyst: {
        email: 'custom@example.com',
        name: 'Security Analyst',
        team: 'SOC',
      },
    });
  });

  it('should apply defaults for arrays', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        notifyTeams: {
          type: 'array',
          items: { type: 'string' },
          default: ['SOC', 'Management'],
        },
      },
      additionalProperties: false,
    } as JsonModelSchemaType);

    const result = applyInputDefaults(undefined, inputsSchema);
    expect(result).toEqual({
      notifyTeams: ['SOC', 'Management'],
    });
  });

  it('should apply defaults for $ref references', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        user: {
          $ref: '#/definitions/UserSchema',
        },
      },
      required: ['user'],
      additionalProperties: false,
      definitions: {
        UserSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              default: 'John Doe',
            },
            email: {
              type: 'string',
              format: 'email',
              default: 'john.doe@example.com',
            },
            age: {
              type: 'number',
              default: 30,
            },
          },
          required: ['name', 'email'],
          additionalProperties: false,
        },
      },
    });

    const result = applyInputDefaults(undefined, inputsSchema);
    expect(result).toEqual({
      user: {
        name: 'John Doe',
        email: 'john.doe@example.com',
        age: 30,
      },
    });
  });

  it('should pre-fill Threat Intelligence Enrichment workflow with all defaults', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        analyst: {
          type: 'object',
          description: 'Security analyst handling the incident',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Analyst email address',
              default: 'analyst@security.com',
            },
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 100,
              description: 'Analyst full name',
              default: 'Security Analyst',
            },
            team: {
              type: 'string',
              enum: ['SOC', 'Threat Intelligence', 'Incident Response', 'Forensics'],
              description: 'Security team',
              default: 'SOC',
            },
          },
          required: ['email', 'name', 'team'],
          additionalProperties: false,
        },
        threatIndicator: {
          type: 'object',
          description: 'Threat indicator to investigate',
          properties: {
            type: {
              type: 'string',
              enum: ['ip', 'domain', 'hash', 'url', 'email'],
              description: 'Type of threat indicator',
              default: 'ip',
            },
            value: {
              type: 'string',
              description: 'The indicator value',
              default: '8.8.8.8',
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
        incidentMetadata: {
          type: 'object',
          description: 'Incident response metadata',
          properties: {
            incidentId: {
              type: 'string',
              pattern: '^INC-\\d{8}-\\d{4}$',
              description: 'Incident ID (format: INC-YYYYMMDD-####)',
              default: 'INC-20241118-0001',
            },
            source: {
              type: 'string',
              enum: ['SIEM Alert', 'Threat Intelligence Feed', 'Manual Report', 'EDR Detection'],
              description: 'Source of the incident',
              default: 'SIEM Alert',
            },
            enrichment: {
              type: 'object',
              description: 'Threat intelligence enrichment data',
              properties: {
                reputation: {
                  type: 'string',
                  enum: ['unknown', 'clean', 'suspicious', 'malicious'],
                  default: 'unknown',
                },
              },
              additionalProperties: false,
            },
          },
          required: ['incidentId', 'source'],
          additionalProperties: false,
        },
        responseActions: {
          type: 'object',
          description: 'Automated response actions to take',
          properties: {
            blockIndicator: {
              type: 'boolean',
              default: false,
              description: 'Block the threat indicator in firewall/IDS',
            },
            quarantineHosts: {
              type: 'boolean',
              default: false,
              description: 'Quarantine affected hosts',
            },
            createTicket: {
              type: 'boolean',
              default: true,
              description: 'Create incident response ticket',
            },
            notifyTeams: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['SOC', 'Management', 'Legal', 'Compliance'],
              },
              description: 'Teams to notify',
              default: ['SOC', 'Management'],
            },
          },
          required: ['createTicket'],
          additionalProperties: false,
        },
        priority: {
          type: 'string',
          enum: ['P1', 'P2', 'P3', 'P4'],
          default: 'P2',
          description: 'Incident priority (P1=Critical, P4=Low)',
        },
      },
      required: ['analyst', 'threatIndicator', 'incidentMetadata'],
      additionalProperties: false,
    });

    const result = applyInputDefaults(undefined, inputsSchema);

    // Verify all required fields with defaults are present
    expect(result).toBeDefined();
    expect(result).toHaveProperty('analyst');
    expect(result).toHaveProperty('threatIndicator');
    expect(result).toHaveProperty('incidentMetadata');
    expect(result).toHaveProperty('responseActions');
    expect(result).toHaveProperty('priority');

    // Verify analyst defaults
    expect(result?.analyst).toEqual({
      email: 'analyst@security.com',
      name: 'Security Analyst',
      team: 'SOC',
    });

    // Verify threatIndicator defaults
    expect(result?.threatIndicator).toEqual({
      type: 'ip',
      value: '8.8.8.8',
      severity: 'medium',
    });

    // Verify incidentMetadata defaults
    expect(result?.incidentMetadata).toEqual({
      incidentId: 'INC-20241118-0001',
      source: 'SIEM Alert',
      enrichment: {
        reputation: 'unknown',
      },
    });

    // Verify responseActions defaults
    expect(result?.responseActions).toEqual({
      blockIndicator: false,
      quarantineHosts: false,
      createTicket: true,
      notifyTeams: ['SOC', 'Management'],
    });

    // Verify priority default
    expect(result?.priority).toBe('P2');
  });

  it('should handle the security workflow example with all defaults', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        analyst: {
          type: 'object',
          properties: {
            email: { type: 'string', default: 'analyst@security.com' },
            name: { type: 'string', default: 'Security Analyst' },
            team: { type: 'string', default: 'SOC' },
          },
          required: ['email', 'name', 'team'],
          additionalProperties: false,
        },
        threatIndicator: {
          type: 'object',
          properties: {
            type: { type: 'string', default: 'ip' },
            value: { type: 'string', default: '192.168.1.100' },
            severity: { type: 'string', default: 'medium' },
          },
          required: ['type', 'value', 'severity'],
          additionalProperties: false,
        },
        incidentMetadata: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', default: 'INC-20241118-0001' },
            source: { type: 'string', default: 'SIEM Alert' },
          },
          required: ['incidentId', 'source'],
          additionalProperties: false,
        },
        responseActions: {
          type: 'object',
          properties: {
            blockIndicator: { type: 'boolean', default: false },
            quarantineHosts: { type: 'boolean', default: false },
            createTicket: { type: 'boolean', default: true },
            notifyTeams: {
              type: 'array',
              items: { type: 'string' },
              default: ['SOC', 'Management'],
            },
          },
          required: ['createTicket'],
          additionalProperties: false,
        },
      },
      required: ['analyst', 'threatIndicator', 'incidentMetadata'],
      additionalProperties: false,
    });

    const result = applyInputDefaults(undefined, inputsSchema);
    expect(result).toEqual({
      analyst: {
        email: 'analyst@security.com',
        name: 'Security Analyst',
        team: 'SOC',
      },
      threatIndicator: {
        type: 'ip',
        value: '192.168.1.100',
        severity: 'medium',
      },
      incidentMetadata: {
        incidentId: 'INC-20241118-0001',
        source: 'SIEM Alert',
      },
      responseActions: {
        blockIndicator: false,
        quarantineHosts: false,
        createTicket: true,
        notifyTeams: ['SOC', 'Management'],
      },
    });
  });
});

describe('resolveRef (#/kibana/definitions/...)', () => {
  const testBuiltinId = 'TestBuiltinPayload';
  let registrySnapshot: typeof builtinWorkflowInputDefinitions;

  beforeEach(() => {
    registrySnapshot = { ...builtinWorkflowInputDefinitions };
  });

  afterEach(() => {
    for (const key of Object.keys(builtinWorkflowInputDefinitions)) {
      delete builtinWorkflowInputDefinitions[key];
    }
    Object.assign(builtinWorkflowInputDefinitions, registrySnapshot);
  });

  it('resolves a registered built-in and applyInputDefaults uses it', () => {
    builtinWorkflowInputDefinitions[testBuiltinId] = {
      type: 'object',
      properties: {
        token: { type: 'string', default: 'abc' },
      },
      required: ['token'],
      additionalProperties: false,
    };

    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        payload: { $ref: '#/kibana/definitions/TestBuiltinPayload' },
      },
      required: ['payload'],
      additionalProperties: false,
    });

    expect(resolveRef('#/kibana/definitions/TestBuiltinPayload', inputsSchema)).toEqual(
      builtinWorkflowInputDefinitions[testBuiltinId]
    );
    expect(applyInputDefaults(undefined, inputsSchema)).toEqual({
      payload: { token: 'abc' },
    });
  });

  it('returns null for an unknown built-in id', () => {
    const inputsSchema = normalizeFieldsToJsonSchema({
      properties: {
        x: { $ref: '#/kibana/definitions/DoesNotExist' },
      },
    });
    expect(resolveRef('#/kibana/definitions/DoesNotExist', inputsSchema)).toBeNull();
  });

  it('returns null when the id contains a slash (invalid ref shape)', () => {
    expect(resolveRef('#/kibana/definitions/a/b', undefined)).toBeNull();
  });
});

describe('normalizeFieldsToJsonSchema + buildFieldsZodValidator (integration)', () => {
  it('should normalize legacy array input defs and validate payloads like the execution engine', () => {
    const legacyInputs = [
      { name: 'greeting', type: 'string' as const, required: true },
      { name: 'count', type: 'number' as const, required: false },
    ] as Array<z.infer<typeof LegacyWorkflowInputSchema>>;

    const normalizedSchema = normalizeFieldsToJsonSchema(legacyInputs);
    const validator = buildFieldsZodValidator(normalizedSchema);

    expect(validator.safeParse({ greeting: 'hi' }).success).toBe(true);
    expect(validator.safeParse({}).success).toBe(false);
  });

  it('should produce a validator consistent with the normalized JSON Schema properties', () => {
    const inputs: JsonModelSchemaType = {
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    };

    const normalizedSchema = normalizeFieldsToJsonSchema(inputs);
    expect(normalizedSchema?.properties).toHaveProperty('name');

    const validator = buildFieldsZodValidator(normalizedSchema);
    expect(validator.safeParse({ name: 'hello' }).success).toBe(true);
    expect(validator.safeParse({}).success).toBe(false);
  });
});

describe('getInputsFromDefinition', () => {
  const expectedSchema = {
    properties: {
      greeting: { type: 'string' },
      count: { type: 'number' },
    },
    required: ['greeting'],
  };

  it('should return the JSON Schema inputs from a manual trigger (new format)', () => {
    const definition = {
      triggers: [
        {
          type: 'manual',
          inputs: {
            properties: {
              greeting: { type: 'string' },
              count: { type: 'number' },
            },
            required: ['greeting'],
          },
        },
      ],
    } as unknown as WorkflowYaml;

    expect(getInputsFromDefinition(definition)).toEqual(expectedSchema);
  });

  it('should normalize legacy array inputs declared on the manual trigger', () => {
    const definition = {
      triggers: [
        {
          type: 'manual',
          inputs: [
            { name: 'greeting', type: 'string', required: true },
            { name: 'count', type: 'number' },
          ],
        },
      ],
    } as unknown as WorkflowYaml;

    expect(getInputsFromDefinition(definition)).toEqual(expectedSchema);
  });

  it('should fall back to root-level legacy inputs when the manual trigger has none', () => {
    const definition = {
      triggers: [{ type: 'manual' }],
      inputs: [
        { name: 'greeting', type: 'string', required: true },
        { name: 'count', type: 'number' },
      ],
    } as unknown as WorkflowYaml;

    expect(getInputsFromDefinition(definition)).toEqual(expectedSchema);
  });

  it('should return undefined when no inputs are defined anywhere', () => {
    const definition = {
      triggers: [{ type: 'manual' }],
    } as unknown as WorkflowYaml;

    expect(getInputsFromDefinition(definition)).toBeUndefined();
  });
});

describe('extractNormalizedInputsFromYaml', () => {
  const expectedSchema = {
    properties: {
      greeting: { type: 'string' },
      count: { type: 'number' },
    },
    required: ['greeting'],
  };

  it('should return inputs from the definition without parsing the YAML', () => {
    const definition = {
      triggers: [
        {
          type: 'manual',
          inputs: {
            properties: {
              greeting: { type: 'string' },
              count: { type: 'number' },
            },
            required: ['greeting'],
          },
        },
      ],
    } as unknown as WorkflowYaml;

    expect(extractNormalizedInputsFromYaml(definition, 'invalid: [yaml')).toEqual(expectedSchema);
  });

  it('should fall back to parsing YAML when the definition has no inputs', () => {
    const yaml = `
name: Test Workflow
triggers:
  - type: manual
    inputs:
      - name: greeting
        type: string
        required: true
      - name: count
        type: number
steps:
  - name: step1
    type: console
`;

    expect(extractNormalizedInputsFromYaml(null, yaml)).toEqual(expectedSchema);
  });
});
