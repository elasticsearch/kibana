/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart, SavedObjectsClientContract } from '@kbn/core/server';
import { SavedObjectsErrorHelpers, isSavedObjectErrorResult } from '@kbn/core/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { escapeQuotes } from '@kbn/es-query';
import { packSavedObjectType, savedQuerySavedObjectType } from '../../common/types';
import type { PackSavedObject, SavedQuerySavedObject } from '../common/types';
import { getInternalSavedObjectsClientForSpaceId } from '../utils/get_internal_saved_object_client';

/** Normalizes SO `ecs_mapping` (array or record) to the record form used on live-query bodies. */
export const toEcsMappingRecord = (
  mapping:
    | Array<{ key: string; value: Record<string, object> }>
    | Record<string, unknown>
    | undefined
): Record<string, unknown> | undefined => {
  if (!mapping) {
    return undefined;
  }

  if (Array.isArray(mapping)) {
    if (!mapping.length) {
      return undefined;
    }

    return mapping.reduce<Record<string, unknown>>((acc, { key, value }) => {
      acc[key] = value;

      return acc;
    }, {});
  }

  return Object.keys(mapping).length ? mapping : undefined;
};

export interface ResolvedQueryReference {
  savedObjectId: string;
  query?: string;
  queries?: string[];
  ecs_mapping?: Record<string, unknown>;
  /**
   * Set for packs. Packs hold `ecs_mapping` per query rather than at the top level, so a
   * caller-supplied top-level mapping is matched against these instead of `ecs_mapping`.
   */
  queryEcsMappings?: Array<Record<string, unknown> | undefined>;
  isPack?: boolean;
}

const toSavedQueryReference = (savedQuerySO: {
  id: string;
  attributes: SavedQuerySavedObject;
}): ResolvedQueryReference => ({
  savedObjectId: savedQuerySO.id,
  query: savedQuerySO.attributes.query,
  ecs_mapping: toEcsMappingRecord(savedQuerySO.attributes.ecs_mapping),
});

/**
 * Body `saved_query_id` is `attributes.id` (public id). Path `/{id}` is the SO uuid.
 * Find the documented identity first; fall back to SO uuid for callers that already send it.
 * Multiple `attributes.id` matches fail closed.
 */
export const lookupSavedQuery = async (
  soClient: Pick<SavedObjectsClientContract, 'find' | 'resolve'>,
  savedQueryId: string
): Promise<ResolvedQueryReference | undefined> => {
  const trimmedSavedQueryId = savedQueryId.trim();

  if (!trimmedSavedQueryId) {
    return undefined;
  }

  const found = await soClient.find<SavedQuerySavedObject>({
    type: savedQuerySavedObjectType,
    filter: `${savedQuerySavedObjectType}.attributes.id: "${escapeQuotes(trimmedSavedQueryId)}"`,
    perPage: 2,
    page: 1,
  });

  if (found.total > 1 || found.saved_objects.length > 1) {
    return undefined;
  }

  if (found.saved_objects.length === 1) {
    return toSavedQueryReference(found.saved_objects[0]);
  }

  try {
    const { saved_object: savedQuerySO, outcome } = await soClient.resolve<SavedQuerySavedObject>(
      savedQuerySavedObjectType,
      trimmedSavedQueryId
    );

    // Exact id plus a legacy alias for a different object — do not pick one.
    if (outcome === 'conflict' || isSavedObjectErrorResult(savedQuerySO)) {
      return undefined;
    }

    return toSavedQueryReference(savedQuerySO);
  } catch (error) {
    if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
};

/**
 * Resolves a saved query or pack via the internal space-scoped SO client.
 * `run_saved_queries` grants no SO read, so the caller's credentials cannot load the object.
 */
export const resolveQueryReference = async (
  coreStart: CoreStart,
  spaceId: string | undefined,
  reference: { saved_query_id?: string; pack_id?: string }
): Promise<ResolvedQueryReference | undefined> => {
  const { saved_query_id: savedQueryId, pack_id: packId } = reference;

  const trimmedSavedQueryId = savedQueryId?.trim();
  const trimmedPackId = packId?.trim();

  if (!trimmedSavedQueryId && !trimmedPackId) {
    return undefined;
  }

  const soClient = getInternalSavedObjectsClientForSpaceId(coreStart, spaceId ?? DEFAULT_SPACE_ID);

  try {
    if (trimmedPackId) {
      const packSO = await soClient.get<PackSavedObject>(packSavedObjectType, trimmedPackId);

      const packQueries = packSO.attributes.queries ?? [];

      return {
        savedObjectId: packSO.id,
        isPack: true,
        queries: packQueries.map(({ query }) => query),
        queryEcsMappings: packQueries.map(({ ecs_mapping: ecsMapping }) =>
          toEcsMappingRecord(ecsMapping)
        ),
      };
    }

    return lookupSavedQuery(soClient, trimmedSavedQueryId as string);
  } catch (error) {
    if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
};
