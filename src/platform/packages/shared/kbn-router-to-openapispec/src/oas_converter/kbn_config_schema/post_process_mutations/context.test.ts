/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { metaFields, schema } from '@kbn/config-schema';
import { joi2JsonInternal } from '../parse';
import { createCtx } from './context';
import { OasSchemaCollisionError } from './schema_collision';

it('records schemas as expected', () => {
  const ctx = createCtx();
  const objA = schema.object({});
  const objB = schema.object({});
  const a = joi2JsonInternal(objA.getSchema());
  const b = joi2JsonInternal(objB.getSchema());

  ctx.addSharedSchema('a', a);
  ctx.addSharedSchema('b', b);

  expect(ctx.getSharedSchemas()).toMatchObject({
    a: { properties: {} },
    b: { properties: {} },
  });
});

describe('shared-schema id collision detection', () => {
  const baseShape = { type: 'object' as const, properties: { a: { type: 'string' as const } } };
  const extendedShape = {
    type: 'object' as const,
    properties: {
      a: { type: 'string' as const },
      b: { type: 'number' as const },
    },
  };

  it('is a no-op when the same id is registered with the same shape', () => {
    const ctx = createCtx();
    ctx.addSharedSchema('reused', { ...baseShape });
    expect(() => ctx.addSharedSchema('reused', { ...baseShape })).not.toThrow();
    expect(ctx.getSharedSchemas()).toEqual({ reused: baseShape });
  });

  it('ignores transient OAS generator annotations when comparing shared schemas', () => {
    const ctx = createCtx();
    const transientShape = () => ({
      type: 'object' as const,
      [metaFields.META_FIELD_X_OAS_DISCRIMINATOR]: 'a',
      [metaFields.META_FIELD_X_OAS_DISCRIMINATOR_DEFAULT_CASE]: true,
      properties: {
        a: {
          type: 'string' as const,
          [metaFields.META_FIELD_X_OAS_OPTIONAL]: true,
        },
      },
    });
    const storedShape = transientShape();
    ctx.addSharedSchema('reused', storedShape as never);

    const mutatedStoredShape = storedShape as Record<string, unknown>;
    delete mutatedStoredShape[metaFields.META_FIELD_X_OAS_DISCRIMINATOR];
    delete mutatedStoredShape[metaFields.META_FIELD_X_OAS_DISCRIMINATOR_DEFAULT_CASE];
    delete (storedShape.properties.a as Record<string, unknown>)[
      metaFields.META_FIELD_X_OAS_OPTIONAL
    ];

    expect(() => ctx.addSharedSchema('reused', transientShape() as never)).not.toThrow();
    expect(ctx.getSharedSchemas()).toEqual({
      reused: transientShape(),
    });
  });

  it('still detects collisions after transient metadata is removed', () => {
    const ctx = createCtx();
    const storedShape = {
      ...baseShape,
      [metaFields.META_FIELD_X_OAS_DISCRIMINATOR]: 'a',
    };
    ctx.addSharedSchema('id_collision', storedShape);
    delete (storedShape as Record<string, unknown>)[metaFields.META_FIELD_X_OAS_DISCRIMINATOR];

    expect(() => ctx.addSharedSchema('id_collision', { ...extendedShape })).toThrowError(
      OasSchemaCollisionError
    );
  });

  it('treats processed discriminator wrappers as equivalent during collision comparison', () => {
    const ctx = createCtx();
    const branchRefs = [
      { $ref: '#/components/schemas/condition_filter' },
      { $ref: '#/components/schemas/group_filter' },
    ];

    ctx.addSharedSchema('reused_discriminated_union', {
      type: 'array',
      items: {
        oneOf: branchRefs,
        discriminator: {
          propertyName: 'type',
          mapping: {
            condition: '#/components/schemas/condition_filter',
            group: '#/components/schemas/group_filter',
          },
        },
      },
    } as never);

    expect(() =>
      ctx.addSharedSchema('reused_discriminated_union', {
        type: 'array',
        items: {
          anyOf: branchRefs,
        },
      } as never)
    ).not.toThrow();
  });

  it('throws OasSchemaCollisionError when the same id is registered with a different shape', () => {
    const ctx = createCtx();
    ctx.addSharedSchema('id_collision', { ...baseShape });
    expect(() => ctx.addSharedSchema('id_collision', { ...extendedShape })).toThrowError(
      OasSchemaCollisionError
    );
  });

  it('includes the conflicting id and a key-set diff in the error message', () => {
    const ctx = createCtx();
    ctx.addSharedSchema('id_collision', { ...baseShape });
    let captured: Error | undefined;
    try {
      ctx.addSharedSchema('id_collision', { ...extendedShape });
    } catch (error) {
      captured = error as Error;
    }
    expect(captured).toBeDefined();
    expect(captured!.message).toContain('"id_collision"');
    expect(captured!.message).toContain('properties only in the second registration: `b`');
    expect(captured!.message).toContain('Base.extends({...})');
    expect(captured!.message).toContain('https://github.com/elastic/kibana/issues/271809');
  });

  it('warns instead of throwing when onCollision is "warn"', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ctx = createCtx({ onCollision: 'warn' });
      ctx.addSharedSchema('id_collision', { ...baseShape });
      ctx.addSharedSchema('id_collision', { ...extendedShape });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('OAS shared schema collision');
      // last write still wins under 'warn'
      expect(ctx.getSharedSchemas().id_collision).toEqual(extendedShape);
    } finally {
      warn.mockRestore();
    }
  });

  it('preserves legacy last-write-wins semantics when onCollision is "ignore"', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ctx = createCtx({ onCollision: 'ignore' });
      ctx.addSharedSchema('id_collision', { ...baseShape });
      ctx.addSharedSchema('id_collision', { ...extendedShape });
      expect(warn).not.toHaveBeenCalled();
      expect(ctx.getSharedSchemas().id_collision).toEqual(extendedShape);
    } finally {
      warn.mockRestore();
    }
  });

  it('reports the collision when reproducing the issue #271809 pattern via @kbn/config-schema', () => {
    const ctx = createCtx();
    // Two distinct schemas that share the same `meta.id` — what `Base.extends({...})`
    // (without overriding meta.id) produces in practice.
    const baseSchema = schema.object(
      { a: schema.string(), b: schema.boolean() },
      { meta: { id: 'package_policy_status_response_demo' } }
    );
    const extendedSchema = schema.object(
      {
        a: schema.string(),
        b: schema.boolean(),
        output_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
        policy_ids: schema.arrayOf(schema.string()),
      },
      { meta: { id: 'package_policy_status_response_demo' } }
    );

    const baseJson = joi2JsonInternal(baseSchema.getSchema()) as unknown as {
      schemas: Record<string, object>;
    };
    const extendedJson = joi2JsonInternal(extendedSchema.getSchema()) as unknown as {
      schemas: Record<string, object>;
    };

    ctx.addSharedSchema(
      'package_policy_status_response_demo',
      extendedJson.schemas.package_policy_status_response_demo as never
    );

    expect(() =>
      ctx.addSharedSchema(
        'package_policy_status_response_demo',
        baseJson.schemas.package_policy_status_response_demo as never
      )
    ).toThrowError(/OAS shared schema collision for id "package_policy_status_response_demo"/);
  });
});
