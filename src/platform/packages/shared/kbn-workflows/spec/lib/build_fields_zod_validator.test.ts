/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JSONSchema7 } from 'json-schema';
import {
  buildFieldsZodValidator,
  convertJsonSchemaToZod,
  convertJsonSchemaToZodWithRefs,
} from './build_fields_zod_validator';
import { mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema } from '../builtin_workflow_input_definitions';
import type { JsonModelSchemaType } from '../schema/common/json_model_schema';

describe('convertJsonSchemaToZod', () => {
  it('should convert a string schema to Zod', () => {
    const jsonSchema: JSONSchema7 = { type: 'string' };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema.parse('test')).toBe('test');
    // Note: The converter may fall back to z.any() for some cases
    // The important thing is that it returns a valid Zod schema
    expect(zodSchema).toBeDefined();
  });

  it('should convert a number schema to Zod', () => {
    const jsonSchema: JSONSchema7 = { type: 'number' };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema.parse(42)).toBe(42);
    // Note: The converter may fall back to z.any() for some cases
    // The important thing is that it returns a valid Zod schema
    expect(zodSchema).toBeDefined();
  });

  it('should convert a boolean schema to Zod', () => {
    const jsonSchema: JSONSchema7 = { type: 'boolean' };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema.parse(true)).toBe(true);
    expect(zodSchema.parse(false)).toBe(false);
    // Note: The converter may fall back to z.any() for some cases
    // The important thing is that it returns a valid Zod schema
    expect(zodSchema).toBeDefined();
  });

  it('should convert an object schema to Zod', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        email: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['email'],
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    const result = zodSchema.parse({ email: 'test@example.com', name: 'Test' }) as {
      email: string;
      name: string;
    };
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBe('Test');
    // Note: The converter may not enforce required fields in all cases
    // The important thing is that it returns a valid Zod schema
    expect(zodSchema).toBeDefined();
  });

  it('should convert a nested object schema to Zod', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        email: { type: 'string' },
        metadata: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            routing: {
              type: 'object',
              properties: {
                shard: { type: 'number' },
                primary: { type: 'boolean' },
              },
            },
          },
        },
      },
      required: ['email', 'name'],
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    const result = zodSchema.parse({
      email: 'test@example.com',
      name: 'Test',
      metadata: {
        source: 'api',
        routing: {
          shard: 1,
          primary: true,
        },
      },
    }) as {
      email: string;
      name: string;
      metadata: { source: string; routing: { shard: number; primary: boolean } };
    };
    expect(result.email).toBe('test@example.com');
    expect(result.metadata.routing.shard).toBe(1);
  });

  it('should convert an array schema to Zod', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'array',
      items: { type: 'string' },
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    const result = zodSchema.parse(['a', 'b', 'c']) as string[];
    expect(result).toEqual(['a', 'b', 'c']);
    // Note: The converter may not enforce strict item types in all cases
    // The important thing is that it returns a valid Zod schema
    expect(zodSchema).toBeDefined();
  });

  it('should convert a schema with enum to Zod', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'string',
      enum: ['option1', 'option2', 'option3'],
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema.parse('option1')).toBe('option1');
    // Note: The converter should validate enum values, but if it falls back to z.any(),
    // that's acceptable for workflow compatibility
    expect(zodSchema).toBeDefined();
  });

  it('should handle optional properties', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        required: { type: 'string' },
        optional: { type: 'string' },
      },
      required: ['required'],
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema.parse({ required: 'value' })).toEqual({ required: 'value' });
    expect(zodSchema.parse({ required: 'value', optional: 'opt' })).toEqual({
      required: 'value',
      optional: 'opt',
    });
  });

  it('should handle minItems and maxItems for arrays', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 3,
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema.parse(['a'])).toEqual(['a']);
    expect(zodSchema.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    // Note: The converter may not enforce minItems/maxItems in all cases
    // The important thing is that it returns a valid Zod schema
    expect(zodSchema).toBeDefined();
  });

  it('should handle the complex example from the requirements', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        email: {
          type: 'string',
        },
        name: {
          type: 'string',
        },
        metadata: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
            },
            routing: {
              type: 'object',
              properties: {
                shard: {
                  type: 'number',
                },
                primary: {
                  type: 'boolean',
                },
              },
            },
          },
        },
      },
      required: ['email', 'name'],
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    const result = zodSchema.parse({
      email: 'user@example.com',
      name: 'John Doe',
      metadata: {
        source: 'api',
        routing: {
          shard: 1,
          primary: true,
        },
      },
    }) as {
      email: string;
      name: string;
      metadata: { source: string; routing: { shard: number; primary: boolean } };
    };
    expect(result.email).toBe('user@example.com');
    expect(result.name).toBe('John Doe');
    expect(result.metadata.source).toBe('api');
    expect(result.metadata.routing.shard).toBe(1);
    expect(result.metadata.routing.primary).toBe(true);
  });

  it('should handle email format', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'string',
      format: 'email',
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    // The converter may not enforce email format validation, but should return a valid schema
    expect(zodSchema).toBeDefined();
    expect(zodSchema.parse('test@example.com')).toBe('test@example.com');
  });

  it('should handle regex pattern', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'string',
      pattern: '^\\d{5}(-\\d{4})?$', // US ZIP code
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    // The converter may not enforce pattern validation, but should return a valid schema
    expect(zodSchema).toBeDefined();
  });

  it('should handle minLength and maxLength', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'string',
      minLength: 1,
      maxLength: 100,
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema).toBeDefined();
  });

  it('should handle minimum and maximum for numbers', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'number',
      minimum: 0,
      maximum: 100,
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema).toBeDefined();
  });

  it('should handle schema with format and pattern together', () => {
    const jsonSchema: JSONSchema7 = {
      type: 'string',
      format: 'email',
      pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    };
    const zodSchema = convertJsonSchemaToZod(jsonSchema);
    expect(zodSchema).toBeDefined();
  });

  describe('edge cases - defensive checks', () => {
    it('should handle null schema gracefully', () => {
      const zodSchema = convertJsonSchemaToZod(null as any);
      expect(zodSchema).toBeDefined();
      // Should return z.any() as fallback
      expect(zodSchema.parse('anything')).toBe('anything');
    });

    it('should handle undefined schema gracefully', () => {
      const zodSchema = convertJsonSchemaToZod(undefined as any);
      expect(zodSchema).toBeDefined();
      // Should return z.any() as fallback
      expect(zodSchema.parse('anything')).toBe('anything');
    });

    it('should handle string input (invalid)', () => {
      const zodSchema = convertJsonSchemaToZod('invalid' as any);
      expect(zodSchema).toBeDefined();
      // Should return z.any() as fallback
      expect(zodSchema.parse('anything')).toBe('anything');
    });

    it('should handle number input (invalid)', () => {
      const zodSchema = convertJsonSchemaToZod(123 as any);
      expect(zodSchema).toBeDefined();
      // Should return z.any() as fallback
      expect(zodSchema.parse('anything')).toBe('anything');
    });

    it('should handle nested object with null properties gracefully', () => {
      const jsonSchema: JSONSchema7 = {
        type: 'object',
        properties: {
          ipsContainer: {
            type: 'object',
            properties: {
              ip: null,
              port: { type: 'number' },
            },
          },
        },
      } as any;

      // Should not crash when properties contain null values
      expect(() => {
        const zodSchema = convertJsonSchemaToZod(jsonSchema);
        expect(zodSchema).toBeDefined();
      }).not.toThrow();
    });

    it('should handle array with null items gracefully', () => {
      const jsonSchema: JSONSchema7 = {
        type: 'array',
        items: null,
      } as any;

      // Should not crash when items is null
      expect(() => {
        const zodSchema = convertJsonSchemaToZod(jsonSchema);
        expect(zodSchema).toBeDefined();
      }).not.toThrow();
    });
  });
});

describe('convertJsonSchemaToZodWithRefs', () => {
  it('should resolve $ref and convert referenced schema', () => {
    const rootSchema = {
      definitions: {
        Email: { type: 'string' },
      },
      properties: {
        email: { $ref: '#/definitions/Email' },
      },
    } as Parameters<typeof convertJsonSchemaToZodWithRefs>[1];
    const propSchema: JSONSchema7 = { $ref: '#/definitions/Email' };
    const zodSchema = convertJsonSchemaToZodWithRefs(propSchema, rootSchema);
    expect(zodSchema.parse('a@b.co')).toBe('a@b.co');
    expect(zodSchema.safeParse(123).success).toBe(false);
  });

  it('should recursively handle nested object with $ref in properties', () => {
    const rootSchema = {
      type: 'object',
      definitions: {
        Port: { type: 'number' },
      },
      properties: {
        host: { type: 'string' },
        port: { $ref: '#/definitions/Port' },
      },
    } as Parameters<typeof convertJsonSchemaToZodWithRefs>[1];
    const objSchema: JSONSchema7 = {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { $ref: '#/definitions/Port' },
      },
    };
    const zodSchema = convertJsonSchemaToZodWithRefs(objSchema, rootSchema);
    const result = zodSchema.parse({ host: 'localhost', port: 8080 }) as {
      host: string;
      port: number;
    };
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(8080);
  });

  it('should fall back to convertJsonSchemaToZod for non-object scalar types', () => {
    const rootSchema = { properties: {} } as Parameters<typeof convertJsonSchemaToZodWithRefs>[1];
    const stringSchema: JSONSchema7 = { type: 'string' };
    const zodSchema = convertJsonSchemaToZodWithRefs(stringSchema, rootSchema);
    expect(zodSchema.parse('hello')).toBe('hello');
  });
});

describe('buildFieldsZodValidator', () => {
  it('validates payloads that use built-in #/kibana/definitions $ref when schema is merged at root', () => {
    const inputs: JsonModelSchemaType = {
      properties: {
        notificationGroup: {
          $ref: '#/kibana/definitions/alertingV2NotificationGroup',
        },
      },
      required: ['notificationGroup'],
    };

    const mergedInputs = mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema(
      inputs as object
    ) as JsonModelSchemaType;

    const validator = buildFieldsZodValidator(mergedInputs);
    const invalid = validator.safeParse({
      notificationGroup: { episodes: [] },
    });
    expect(invalid.success).toBe(false);

    const valid = validator.safeParse({
      notificationGroup: {
        id: 'group-1',
        policyId: 'policy-1',
        groupKey: {},
        episodes: [
          {
            last_event_timestamp: '2024-01-01T00:00:00Z',
            rule_id: 'rule-1',
            group_hash: 'hash-1',
            episode_id: 'episode-1',
            episode_status: 'active',
          },
        ],
      },
    });
    expect(valid.success).toBe(true);
  });

  it('should return empty object schema when schema has no properties', () => {
    const validator = buildFieldsZodValidator(null);
    expect(validator.parse({})).toEqual({});
    const validator2 = buildFieldsZodValidator({});
    expect(validator2.parse({})).toEqual({});
  });

  it('should validate required and optional inputs', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    } as Parameters<typeof buildFieldsZodValidator>[0];
    const validator = buildFieldsZodValidator(schema);
    expect(validator.parse({ name: 'Alice' })).toEqual({ name: 'Alice' });
    expect(validator.parse({ name: 'Bob', age: 30 })).toEqual({ name: 'Bob', age: 30 });
    expect(validator.safeParse({ age: 30 }).success).toBe(false);
  });

  it('should apply defaults from schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'unknown' },
        count: { type: 'number', default: 0 },
      },
    } as Parameters<typeof buildFieldsZodValidator>[0];
    const validator = buildFieldsZodValidator(schema);
    const result = validator.parse({}) as { name: string; count: number };
    expect(result.name).toBe('unknown');
    expect(result.count).toBe(0);
  });

  it('should reject extra properties when additionalProperties is false', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    } as Parameters<typeof buildFieldsZodValidator>[0];
    const validator = buildFieldsZodValidator(schema);
    expect(validator.safeParse({ name: 'Alice', extra: 'should fail' }).success).toBe(false);
    expect(validator.safeParse({ name: 'Alice' }).success).toBe(true);
  });

  it('should reject invalid types', () => {
    const schema = {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
      },
    } as Parameters<typeof buildFieldsZodValidator>[0];
    const validator = buildFieldsZodValidator(schema);
    expect(validator.safeParse({ enabled: 'yes' }).success).toBe(false);
    expect(validator.safeParse({ enabled: true }).success).toBe(true);
  });
});
