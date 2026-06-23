/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JSONSchema7 } from 'json-schema';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { generateSampleFromJsonSchema } from './generate_sample_from_json_schema';
import { INPUT_STRING_PLACEHOLDER } from '../consts/placeholders';

describe('generateSampleFromJsonSchema', () => {
  describe('default values', () => {
    it('returns the schema default when present', () => {
      expect(generateSampleFromJsonSchema({ type: 'string', default: 'hello' })).toBe('hello');
    });

    it('returns a numeric default', () => {
      expect(generateSampleFromJsonSchema({ type: 'number', default: 42 })).toBe(42);
    });

    it('returns a boolean default', () => {
      expect(generateSampleFromJsonSchema({ type: 'boolean', default: true })).toBe(true);
    });

    it('returns an object default', () => {
      const def = { key: 'value' };
      expect(generateSampleFromJsonSchema({ type: 'object', default: def })).toEqual(def);
    });
  });

  describe('string type', () => {
    it('returns "string" for a plain string', () => {
      expect(generateSampleFromJsonSchema({ type: 'string' })).toBe(INPUT_STRING_PLACEHOLDER);
    });

    it('returns "user@example.com" for format: email', () => {
      expect(generateSampleFromJsonSchema({ type: 'string', format: 'email' })).toBe(
        'user@example.com'
      );
    });
  });

  describe('numeric types', () => {
    it('returns 0 for number', () => {
      expect(generateSampleFromJsonSchema({ type: 'number' })).toBe(0);
    });

    it('returns 0 for integer', () => {
      expect(generateSampleFromJsonSchema({ type: 'integer' })).toBe(0);
    });
  });

  describe('boolean type', () => {
    it('returns false', () => {
      expect(generateSampleFromJsonSchema({ type: 'boolean' })).toBe(false);
    });
  });

  describe('array type', () => {
    it('returns an array with one sample item when items schema is provided', () => {
      const schema: JSONSchema7 = { type: 'array', items: { type: 'string' } };
      expect(generateSampleFromJsonSchema(schema)).toEqual([INPUT_STRING_PLACEHOLDER]);
    });

    it('returns an empty array when no items schema', () => {
      expect(generateSampleFromJsonSchema({ type: 'array' })).toEqual([]);
    });

    it('handles nested array items', () => {
      const schema: JSONSchema7 = {
        type: 'array',
        items: { type: 'array', items: { type: 'number' } },
      };
      expect(generateSampleFromJsonSchema(schema)).toEqual([[0]]);
    });
  });

  describe('object type', () => {
    it('includes only required properties when no defaults', () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          optional: { type: 'boolean' },
        },
        required: ['name', 'age'],
      };
      expect(generateSampleFromJsonSchema(schema)).toEqual({
        name: INPUT_STRING_PLACEHOLDER,
        age: 0,
      });
    });

    it('includes properties with defaults even if not required', () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          color: { type: 'string', default: 'blue' },
          size: { type: 'number' },
        },
      };
      expect(generateSampleFromJsonSchema(schema)).toEqual({ color: 'blue' });
    });

    it('returns an empty object when no properties', () => {
      expect(generateSampleFromJsonSchema({ type: 'object' })).toEqual({});
    });

    it('handles nested objects', () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
            required: ['city'],
          },
        },
        required: ['address'],
      };
      expect(generateSampleFromJsonSchema(schema)).toEqual({
        address: { city: INPUT_STRING_PLACEHOLDER },
      });
    });
  });

  describe('implicit object (no explicit type, but has properties)', () => {
    it('generates defaults from properties when type is omitted', () => {
      const schema: JSONSchema7 = {
        properties: {
          approved: { type: 'boolean', default: true },
          note: { type: 'string' },
        },
      };
      // approved has a default → included; note has no default and is not required → omitted
      expect(generateSampleFromJsonSchema(schema)).toEqual({ approved: true });
    });

    it('includes required properties even when no default', () => {
      const schema: JSONSchema7 = {
        properties: {
          severity: { type: 'string' },
        },
        required: ['severity'],
      };
      expect(generateSampleFromJsonSchema(schema)).toEqual({ severity: INPUT_STRING_PLACEHOLDER });
    });

    it('returns empty object when properties exist but none are required or defaulted', () => {
      const schema: JSONSchema7 = {
        properties: { optional: { type: 'string' } },
      };
      expect(generateSampleFromJsonSchema(schema)).toEqual({});
    });
  });

  describe('unknown / unhandled type', () => {
    it('returns undefined for null type', () => {
      expect(generateSampleFromJsonSchema({ type: 'null' })).toBeUndefined();
    });

    it('returns undefined for no type and no properties', () => {
      expect(generateSampleFromJsonSchema({})).toBeUndefined();
    });
  });

  describe('$ref resolution (inputs root)', () => {
    it('resolves local #/definitions when inputs root is provided', () => {
      const inputsRoot = {
        properties: {
          user: { $ref: '#/definitions/User' },
        },
        definitions: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
      } as JsonModelSchemaType;
      expect(generateSampleFromJsonSchema({ $ref: '#/definitions/User' }, inputsRoot)).toEqual({
        name: INPUT_STRING_PLACEHOLDER,
      });
    });

    it('resolves built-in #/kibana/definitions when inputs root is provided', () => {
      const inputsRoot = {
        properties: {
          notificationGroup: { $ref: '#/kibana/definitions/alertingV2NotificationGroup' },
        },
      } as JsonModelSchemaType;
      const sample = generateSampleFromJsonSchema(
        { $ref: '#/kibana/definitions/alertingV2NotificationGroup' },
        inputsRoot
      ) as Record<string, unknown>;
      expect(sample.id).toBe(INPUT_STRING_PLACEHOLDER);
      expect(sample.policyId).toBe(INPUT_STRING_PLACEHOLDER);
      expect(sample.groupKey).toEqual({});
      expect(sample.episodes).toEqual([
        {
          last_event_timestamp: INPUT_STRING_PLACEHOLDER,
          rule_id: INPUT_STRING_PLACEHOLDER,
          group_hash: INPUT_STRING_PLACEHOLDER,
          episode_id: INPUT_STRING_PLACEHOLDER,
          episode_status: INPUT_STRING_PLACEHOLDER,
        },
      ]);
    });
  });
});
