/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { SavedObjectsFullModelVersion } from '@kbn/core-saved-objects-server';

// The SO mapping uses `dynamic: false`, so only a subset of attributes is indexed.
// The `create` schema must declare every indexed field (see
// `kbn-check-saved-objects-cli` validateAllMappingsInModelVersion), so we mirror
// the mapping here while keeping the wrapping objects permissive via
// `unknowns: 'allow'` to accommodate the unified payload variations
// (reference vs value attachments, metadata, pushed_by, updated_by, etc.).

const userSchema = schema.object(
  {
    username: schema.maybe(schema.nullable(schema.string())),
  },
  { unknowns: 'allow' }
);

const dataSchema = schema.object(
  {
    content: schema.maybe(schema.nullable(schema.string())),
  },
  { unknowns: 'allow' }
);

const createSchema = schema.object(
  {
    type: schema.string(),
    attachmentId: schema.maybe(schema.oneOf([schema.string(), schema.arrayOf(schema.string())])),
    owner: schema.string(),
    data: schema.maybe(schema.nullable(dataSchema)),
    created_at: schema.string(),
    created_by: userSchema,
    pushed_at: schema.maybe(schema.nullable(schema.string())),
    updated_at: schema.maybe(schema.nullable(schema.string())),
  },
  { unknowns: 'allow' }
);

/** Baseline model version anchoring `cases-attachments`. */
export const modelVersion1: SavedObjectsFullModelVersion = {
  changes: [],
  schemas: {
    forwardCompatibility: (attrs) => attrs,
    create: createSchema,
  },
};
