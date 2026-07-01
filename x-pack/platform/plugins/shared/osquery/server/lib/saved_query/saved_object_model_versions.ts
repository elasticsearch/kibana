/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObjectModelDataBackfillFn,
  SavedObjectsModelVersion,
} from '@kbn/core-saved-objects-server';
import { v4 as uuidv4 } from 'uuid';
import {
  savedQuerySchemaV2,
  packSchemaV2,
  packSchemaV3,
  packSchemaV3ForwardCompat,
  packSchemaV4,
} from './schemas';

export const savedQueryModelVersion1: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        timeout: { type: 'short' },
      },
    },
  ],
};

export const savedQueryModelVersion2: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        created_by_profile_uid: { type: 'keyword' },
        updated_by_profile_uid: { type: 'keyword' },
      },
    },
  ],
  schemas: {
    forwardCompatibility: savedQuerySchemaV2.extends({}, { unknowns: 'ignore' }),
  },
};

export const packSavedObjectModelVersion1: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        queries: {
          properties: {
            timeout: { type: 'short' },
          },
        },
      },
    },
  ],
};

export const packSavedObjectModelVersion2: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        created_by_profile_uid: { type: 'keyword' },
        updated_by_profile_uid: { type: 'keyword' },
      },
    },
  ],
  schemas: {
    forwardCompatibility: packSchemaV2.extends({}, { unknowns: 'ignore' }),
  },
};

/**
 * V3 adds pack-level scheduling fields:
 * - `schedule_type` (keyword): 'interval' | 'rrule'
 * - `interval` (integer): pack-level interval in seconds (new — previously per-query only)
 * - `rrule_schedule` (dynamic: false): the serialized RRULE config object
 *
 * CRITICAL: the pack SO root mappings are NOT `dynamic: false` (unlike the
 * saved query SO). Without this `mappings_addition`, new pack-level fields are
 * silently dropped on write. Per-query overrides inside `queries` (which is
 * `dynamic: false`) do not need explicit mapping; `packQuerySchema` uses
 * `unknowns: 'allow'` so they round-trip cleanly.
 */
export const packSavedObjectModelVersion3: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        schedule_type: { type: 'keyword', ignore_above: 1024 },
        interval: { type: 'integer' },
        rrule_schedule: { dynamic: false, properties: {} },
      },
    },
  ],
  schemas: {
    forwardCompatibility: packSchemaV3ForwardCompat.extends({}, { unknowns: 'ignore' }),
    // `create` is required for new model versions per #240919 (rollback support
    // soft-enforced 2025-11-05). The pack SO root is NOT `dynamic: false`,
    // so the SO-types lint requires every mapping field be declared here.
    // Reuse `packSchemaV3` (which already declares V1+V2+V3 fields) and accept
    // unknown sub-keys so per-query RRULE overrides / unknown rrule parts
    // round-trip.
    create: packSchemaV3.extends({}, { unknowns: 'allow' }),
  },
};

/**
 * V4 deterministically backfills a stable per-query `schedule_id` onto every
 * pack-query that lacks one. Unlike the best-effort Task
 * Manager backfill it replaces, a `data_backfill` model version runs exactly
 * once per Saved Object on EVERY upgrade / rollback / Serverless path, which is
 * the only mechanism that gives upgrade-path determinism.
 */
const backfillScheduleIdFn: SavedObjectModelDataBackfillFn<
  { queries?: Array<{ schedule_id?: string }> },
  { queries?: Array<{ schedule_id?: string }> }
> = ({ attributes }) => {
  const queries = attributes.queries;
  if (!queries?.length) {
    // `data_backfill` requires an `attributes` object; an empty patch is the no-op.
    return { attributes: {} };
  }

  return {
    attributes: {
      queries: queries.map((query) => ({
        ...query,
        schedule_id: query.schedule_id ?? uuidv4(),
      })),
    },
  };
};

export const packSavedObjectModelVersion4: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'data_backfill',
      backfillFn: backfillScheduleIdFn,
    },
  ],
  schemas: {
    forwardCompatibility: packSchemaV4.extends({}, { unknowns: 'ignore' }),
    create: packSchemaV4.extends({}, { unknowns: 'allow' }),
  },
};

export const packAssetSavedObjectModelVersion1: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'mappings_addition',
      addedMappings: {
        queries: {
          properties: {
            timeout: { type: 'short' },
          },
        },
      },
    },
  ],
};
