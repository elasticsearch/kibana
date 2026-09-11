/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { getSchemaAtPath } from './get_schema_at_path';
import { expectZodSchemaEqual } from './test_utils/expect_zod_schema_equal';
import { EsGenericResponseSchema } from '../../elasticsearch_generic_response_schema';

describe('getSchemaAtPath', () => {
  it('objects with simple paths', () => {
    expectZodSchemaEqual(
      getSchemaAtPath(z.object({ a: z.string() }), 'a').schema as z.ZodType,
      z.string()
    );
  });

  it('objects with getter properties', () => {
    const schema = z.object({
      a: z.object({
        get mappings() {
          return z.optional(z.object({ dynamic: true }));
        },
      }),
    });
    const result = getSchemaAtPath(schema, 'a.mappings');
    expect(result.schema).toBeDefined();
    expect(result.scopedToPath).toBe('a.mappings');
    expect(result.schema).toBeInstanceOf(z.ZodObject);
    // @ts-expect-error - we are testing the shape of the schema
    expect(result.schema.shape.dynamic).toBeDefined();
    // not using expectZodSchemaEqual because underlying z.toJSONSchema is failing for some reason
  });

  it('objects with nested paths', () => {
    expectZodSchemaEqual(
      getSchemaAtPath(z.object({ a: z.object({ b: z.array(z.string()) }) }), 'a.b[0]')
        .schema as z.ZodType,
      z.string()
    );
  });

  it('array paths with invalid index should return null', () => {
    expect(
      getSchemaAtPath(z.object({ a: z.array(z.string()).length(5) }), 'a[10]').schema
    ).toBeNull();
  });

  it('unconstrained arrays should return element schema', () => {
    expectZodSchemaEqual(
      getSchemaAtPath(z.object({ a: z.array(z.string()) }), 'a[0]').schema as z.ZodType,
      z.string()
    );
    expectZodSchemaEqual(
      getSchemaAtPath(z.object({ a: z.array(z.string()) }), 'a[999]').schema as z.ZodType,
      z.string()
    );
  });

  it('negative indices should return null', () => {
    expect(getSchemaAtPath(z.object({ a: z.array(z.string()) }), 'a[-1]').schema).toBeNull();
  });

  it('invalid paths should return null', () => {
    expect(getSchemaAtPath(z.object({ a: z.string() }), 'b').schema).toBeNull();
    expect(getSchemaAtPath(z.object({ a: z.string() }), 'a.b').schema).toBeNull();
    expect(getSchemaAtPath(z.object({ a: z.string() }), 'a[1]').schema).toBeNull();
    expect(getSchemaAtPath(z.object({ a: z.string() }), 'a[0].b').schema).toBeNull();
  });

  it('optional any in nested object should return any', () => {
    const schema = z.object({ a: z.object({ b: z.any().optional() }) });
    const result = getSchemaAtPath(schema, 'a.b');
    expectZodSchemaEqual(result.schema as z.ZodType, z.any());
    expect(result.scopedToPath).toBe('a.b');
  });

  it('lazy zod schemas', () => {
    const schema = z.lazy(() => z.object({ a: z.string() }));
    const result = getSchemaAtPath(schema, 'a');
    expect(result.schema).toBeDefined();
    expect(result.scopedToPath).toBe('a');
    expectZodSchemaEqual(result.schema as z.ZodType, z.string());
  });

  it('nested lazy zod schemas', () => {
    const schema = z.lazy(() =>
      z.object({ a: z.lazy(() => z.object({ b: z.lazy(() => z.string()) })) })
    );
    const result = getSchemaAtPath(schema, 'a.b');
    expect(result.schema).toBeDefined();
    expect(result.scopedToPath).toBe('a.b');
    expectZodSchemaEqual(result.schema as z.ZodType, z.string());
  });

  it('union branches', () => {
    const schema = z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]);
    const result = getSchemaAtPath(schema, 'a');
    expect(result.schema).toBeDefined();
    expect(result.scopedToPath).toBe('a');
    expectZodSchemaEqual(result.schema as z.ZodType, z.string());
  });

  it('union branches with invalid path', () => {
    const schema = z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]);
    const result = getSchemaAtPath(schema, 'c');
    expect(result.schema).toBeNull();
    expect(result.scopedToPath).toBeNull();
  });

  it('intersection', () => {
    const schema = z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }));
    const result = getSchemaAtPath(schema, 'a');
    expect(result.schema).toBeDefined();
    expect(result.scopedToPath).toBe('a');
    expectZodSchemaEqual(result.schema as z.ZodType, z.string());
  });

  it('intersection with invalid path', () => {
    const schema = z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }));
    const result = getSchemaAtPath(schema, 'c');
    expect(result.schema).toBeNull();
    expect(result.scopedToPath).toBeNull();
  });

  it('record', () => {
    const schema = z.record(z.string(), z.unknown());
    const result = getSchemaAtPath(schema, 'a');
    expect(result.schema).toBeDefined();
    expect(result.scopedToPath).toBe('a');
    expectZodSchemaEqual(result.schema as z.ZodType, z.unknown());
  });

  it('typed catchall walks into the value shape and rejects unknown value fields', () => {
    const schema = z.object({}).catchall(z.object({ name: z.string() }));
    expect(getSchemaAtPath(schema, 'rule-1.name').schema).not.toBeNull();
    expect(getSchemaAtPath(schema, 'rule-1.nmae').schema).toBeNull();
  });

  it('does not walk an unknown catchall (open map)', () => {
    const schema = z.object({}).catchall(z.unknown());
    expect(getSchemaAtPath(schema, 'anything').schema).toBeNull();
  });
});

describe('getSchemaAtPath: real life examples', () => {
  it('should return the correct type for the real life example', () => {
    const path = 'steps.search_park_data.output.hits.total.value';
    const schema = z.object({
      steps: z.object({
        search_park_data: z.object({
          output: EsGenericResponseSchema,
        }),
      }),
    });
    const atPathResult = getSchemaAtPath(schema, path);
    expect(atPathResult.schema).toBeDefined();
    expect(atPathResult.scopedToPath).toBe(path);
    expectZodSchemaEqual(atPathResult.schema as z.ZodType, z.number());
  });
});

describe('getSchemaAtPath: prototype-chain keys', () => {
  const schema = z.object({ a: z.string() });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'does not resolve %s to an Object.prototype member',
    (segment) => {
      expect(getSchemaAtPath(schema, segment).schema).toBeNull();
      expect(getSchemaAtPath(schema, `a.${segment}`).schema).toBeNull();
    }
  );

  it('resolves __proto__ when it is a real own key of the shape', () => {
    const shape = Object.create(null) as Record<string, z.ZodType>;
    shape.__proto__ = z.number();
    const result = getSchemaAtPath(z.object(shape), '__proto__');
    expect(result.schema).not.toBeNull();
    expectZodSchemaEqual(result.schema as z.ZodType, z.number());
  });
});
