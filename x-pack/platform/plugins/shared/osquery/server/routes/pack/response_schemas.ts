/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

const ecsMappingItemSchema = schema.object(
  {
    field: schema.maybe(schema.string()),
    value: schema.maybe(
      schema.oneOf([
        schema.string({ maxLength: 1024 }),
        schema.arrayOf(schema.string({ maxLength: 1024 }), { maxSize: 1000 }),
      ])
    ),
  },
  { unknowns: 'allow' }
);

const packQuerySchema = schema.object(
  {
    query: schema.maybe(schema.string()),
    id: schema.maybe(schema.string()),
    interval: schema.maybe(schema.oneOf([schema.number(), schema.string()])),
    platform: schema.maybe(schema.nullable(schema.string())),
    version: schema.maybe(schema.nullable(schema.string())),
    snapshot: schema.maybe(schema.nullable(schema.boolean())),
    removed: schema.maybe(schema.nullable(schema.boolean())),
    timeout: schema.maybe(schema.nullable(schema.number())),
    ecs_mapping: schema.maybe(
      schema.nullable(
        schema.oneOf([
          schema.recordOf(schema.string(), ecsMappingItemSchema),
          schema.arrayOf(schema.any(), { maxSize: 1000 }),
        ])
      )
    ),
    saved_query_id: schema.maybe(schema.nullable(schema.string())),
    name: schema.maybe(schema.string()),
    schedule_id: schema.maybe(schema.string()),
  },
  { unknowns: 'allow' }
);

const shardItemSchema = schema.object({
  key: schema.string(),
  value: schema.number(),
});

const targetingWarningSchema = schema.object({
  untargeted_agent_policy_names: schema.arrayOf(schema.string({ maxLength: 1024 }), {
    maxSize: 10000,
  }),
});

const packDataSchema = schema.object(
  {
    saved_object_id: schema.string(),
    name: schema.string(),
    description: schema.maybe(schema.nullable(schema.string())),
    queries: schema.maybe(
      schema.oneOf([
        schema.recordOf(schema.string(), packQuerySchema),
        schema.arrayOf(packQuerySchema, { maxSize: 1000 }),
      ])
    ),
    version: schema.maybe(schema.number()),
    enabled: schema.maybe(schema.nullable(schema.boolean())),
    created_at: schema.maybe(schema.string()),
    created_by: schema.maybe(schema.nullable(schema.string())),
    created_by_profile_uid: schema.maybe(schema.nullable(schema.string())),
    updated_at: schema.maybe(schema.string()),
    updated_by: schema.maybe(schema.nullable(schema.string())),
    updated_by_profile_uid: schema.maybe(schema.nullable(schema.string())),
    policy_ids: schema.maybe(
      schema.arrayOf(schema.string({ maxLength: 1024 }), { maxSize: 10000 })
    ),
    shards: schema.maybe(
      schema.nullable(
        schema.oneOf([
          schema.arrayOf(shardItemSchema, { maxSize: 10000 }),
          schema.recordOf(schema.string(), schema.number()),
        ])
      )
    ),
    read_only: schema.maybe(schema.boolean()),
    targeting_warning: schema.maybe(targetingWarningSchema),
  },
  { unknowns: 'allow' }
);

export const createPackResponseSchema = schema.object({
  data: packDataSchema,
});

export const readPackResponseSchema = schema.object({
  data: schema.object(
    {
      saved_object_id: schema.string(),
      name: schema.string(),
      description: schema.maybe(schema.nullable(schema.string())),
      queries: schema.maybe(schema.recordOf(schema.string(), packQuerySchema)),
      version: schema.maybe(schema.number()),
      enabled: schema.maybe(schema.nullable(schema.boolean())),
      created_at: schema.maybe(schema.string()),
      created_by: schema.maybe(schema.nullable(schema.string())),
      created_by_profile_uid: schema.maybe(schema.nullable(schema.string())),
      updated_at: schema.maybe(schema.string()),
      updated_by: schema.maybe(schema.nullable(schema.string())),
      updated_by_profile_uid: schema.maybe(schema.nullable(schema.string())),
      policy_ids: schema.maybe(
        schema.arrayOf(schema.string({ maxLength: 1024 }), { maxSize: 10000 })
      ),
      shards: schema.maybe(schema.recordOf(schema.string(), schema.number())),
      read_only: schema.maybe(schema.boolean()),
      type: schema.maybe(schema.string()),
      namespaces: schema.maybe(
        schema.arrayOf(schema.string({ maxLength: 1024 }), { maxSize: 10000 })
      ),
      migrationVersion: schema.maybe(schema.recordOf(schema.string(), schema.string())),
      managed: schema.maybe(schema.boolean()),
      coreMigrationVersion: schema.maybe(schema.string()),
    },
    { unknowns: 'allow' }
  ),
});

export const findPackResponseSchema = schema.object({
  page: schema.number(),
  per_page: schema.number(),
  total: schema.number(),
  data: schema.arrayOf(packDataSchema, { maxSize: 10000 }),
});

/**
 * The update pack route has two return paths:
 * 1. Normal path: returns { data: PackResponseData } (same shape as create/copy)
 * 2. Early return path (line 262): returns { data: SavedObject } when enabled is
 *    unchanged and pack is disabled — this is a raw SavedObject with `id`, `type`,
 *    `attributes`, `references` etc.
 */
export const updatePackResponseSchema = schema.object({
  data: schema.oneOf([
    packDataSchema,
    // Raw SavedObject shape from the early return path
    schema.object(
      {
        id: schema.string(),
        type: schema.maybe(schema.string()),
        attributes: schema.object(
          {
            name: schema.maybe(schema.string()),
            queries: schema.maybe(schema.any()),
          },
          { unknowns: 'allow' }
        ),
      },
      { unknowns: 'allow' }
    ),
  ]),
});

// Delete returns an empty body `{}` — no unknowns expected
export const deletePackResponseSchema = schema.object({});

export const copyPackResponseSchema = schema.object({
  data: packDataSchema,
});
