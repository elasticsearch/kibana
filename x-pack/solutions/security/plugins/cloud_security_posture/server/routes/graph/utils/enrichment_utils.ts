/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { castArray } from 'lodash';
import type { Logger, IScopedClusterClient } from '@kbn/core/server';
import { getEntitiesLatestIndexName } from '@kbn/cloud-security-posture-common/utils/helpers';
import type { EntityEnrichmentFields } from '../fetch_entity_enrichment';

/**
 * SHA-256 hash of a sorted, comma-joined id list. Used to derive a stable node id when
 * multiple entity ids collapse into a single graph node (group node, label node).
 * Input is sorted internally so callers don't need to remember.
 */
export const hashIds = (ids: string[]): string =>
  createHash('sha256')
    .update([...ids].sort().join(','))
    .digest('hex');

/**
 * Unions an ES|QL multi-value column (scalar | array | null | undefined) into a target Set.
 * Used by the regroup* functions to merge the VALUES(...) aggregates of pre-aggregated rows.
 * `dropEmpty` additionally excludes the empty-string sentinel ES|QL emits for missing values —
 * set it for doc id / doc-data columns to match the original `if (record.x)` falsy guards.
 */
export const addValuesToSet = (
  set: Set<string>,
  value: string | string[] | null | undefined,
  { dropEmpty }: { dropEmpty: boolean }
): void => {
  for (const v of castArray(value ?? [])) {
    if (v == null) continue;
    if (dropEmpty && v === '') continue;
    set.add(v);
  }
};

/**
 * Checks if the entities latest index exists.
 * Previously checked for lookup mode (required for LOOKUP JOIN), but since
 * enrichment now uses follow-up queries, only existence matters.
 */
export const checkIfEntitiesIndexExists = async (
  esClient: IScopedClusterClient,
  logger: Logger,
  spaceId: string
): Promise<boolean> => {
  const indexName = getEntitiesLatestIndexName(spaceId);
  try {
    const exists = await esClient.asInternalUser.indices.exists({ index: indexName });
    if (!exists) {
      logger.debug(`Entities index ${indexName} does not exist`);
    }
    return exists;
  } catch (error) {
    logger.error(`Error checking entities index ${indexName}: ${error.message}`);
    return false;
  }
};

/**
 * Rebuilds doc data JSON strings with enrichment data from the entity store.
 * Builds the entity object for docs that have an id, applying availableInEntityStore=false
 * as default when no enrichment is found. Returns docs unchanged if JSON parsing fails or
 * no id is present. sourceFields may be at the top level (from events docData) or inside
 * an existing entity object — both formats are handled.
 */
export const rebuildDocData = (
  docDataItems: (string | null)[] | string | undefined,
  enrichmentMap: Map<string, EntityEnrichmentFields>
): string[] => {
  const items = castArray(docDataItems ?? []).filter((d): d is string => d != null);
  return items.map((item) => {
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(item);
    } catch {
      return item;
    }
    const entityId = doc.id as string;
    if (!entityId) return item;

    const enrichment = enrichmentMap.get(entityId);

    // sourceFields may be at top level (events docData), inside existing entity object (entity store
    // docData), or from enrichment (relationship target docData that has no sourceFields in the doc).
    const topLevelSourceFields = doc.sourceFields;
    const existingEntity = (doc.entity as Record<string, unknown>) ?? {};
    const sourceFields =
      topLevelSourceFields ?? existingEntity.sourceFields ?? enrichment?.sourceFields;
    const entityData: Record<string, unknown> = {
      availableInEntityStore: enrichment != null,
      ...(sourceFields ? { sourceFields } : {}),
    };

    if (enrichment?.name != null) entityData.name = enrichment.name;
    if (enrichment?.type != null) entityData.type = enrichment.type;
    if (enrichment?.subType != null) entityData.sub_type = enrichment.subType;
    if (enrichment?.engineType != null) entityData.engine_type = enrichment.engineType;
    if (enrichment?.hostIps?.length) entityData.host = { ip: enrichment.hostIps };

    if (topLevelSourceFields !== undefined) delete doc.sourceFields;
    doc.entity = entityData;
    return JSON.stringify(doc);
  });
};
