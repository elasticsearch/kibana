/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';

import type { Logger } from '@kbn/logging';
import type { EntityUpdateClient, BulkObject } from '@kbn/entity-store/server';
import type { Entity } from '@kbn/entity-store/common/domain/definitions/entity.gen';

import type { EntityRelationshipRecord } from './types';

// Must stay in sync with hashEuid in entity_store/common/domain/euid/hash_euid.ts.
// Avoids a cross-plugin import of a private module.
export const hashEntityId = (id: string): string => createHash('sha256').update(id).digest('hex');

type ValidRecord = EntityRelationshipRecord & { entityId: string };

interface MergedRelationships {
  [relType: string]: Set<string>;
}

function hasAnyTargets(record: EntityRelationshipRecord): boolean {
  return Object.values(record.relationships).some((rel) => rel.length > 0);
}

function filterValid(records: EntityRelationshipRecord[]): ValidRecord[] {
  return records.filter((r): r is ValidRecord => r.entityId !== null && hasAnyTargets(r));
}

function mergeRecords(records: ValidRecord[]): Map<string, MergedRelationships> {
  const merged = new Map<string, MergedRelationships>();
  for (const record of records) {
    let entity = merged.get(record.entityId);
    if (!entity) {
      entity = {};
      merged.set(record.entityId, entity);
    }
    for (const [relType, rel] of Object.entries(record.relationships)) {
      if (!entity[relType]) {
        entity[relType] = new Set();
      }
      for (const id of rel) {
        entity[relType].add(id);
      }
    }
  }
  return merged;
}

/**
 * Result of a `writeEntityIds` call. Surfaces the three buckets that the
 * `bulkUpdateEntity` response distinguishes so the engine can include them
 * in its run summary instead of swallowing them in a debug log.
 *
 * - `updated`: entities whose relationships were merged + persisted.
 * - `notFound`: 404 responses — actor EUID isn't in the entity store yet
 *   (extraction lag, namespace mismatch, suppression). Not a write failure
 *   by itself, but persistent 404s burn work every run with no user signal,
 *   so we surface the count.
 * - `errors`: non-404 failures (5xx, 4xx other than 404) — these always
 *   warrant an investigation.
 */
export interface WriteEntityIdsResult {
  updated: number;
  notFound: number;
  errors: number;
  /**
   * Applied writes per relationship type, keyed by rel-type string
   * (e.g. `{ accesses_frequently: 40, accesses_infrequently: 25 }`).
   * Counted from the merged map after `bulkUpdateEntity`, excluding entities
   * whose bulk-update item failed. `BulkObjectResponse._id` is the hashed
   * EUID, so we hash each entityId to match against the failed-hash set.
   */
  relationshipTypeApplied: Record<string, number>;
}

export const writeEntityIds = async (
  crudClient: EntityUpdateClient,
  logger: Logger,
  records: EntityRelationshipRecord[]
): Promise<WriteEntityIdsResult> => {
  if (records.length === 0)
    return { updated: 0, notFound: 0, errors: 0, relationshipTypeApplied: {} };

  const valid = filterValid(records);
  if (valid.length === 0)
    return { updated: 0, notFound: 0, errors: 0, relationshipTypeApplied: {} };

  const merged = mergeRecords(valid);

  const objects: BulkObject[] = [];
  for (const [entityId, mergedRels] of merged) {
    const relationships: Record<string, { ids: string[] }> = {};
    for (const [relType, idSet] of Object.entries(mergedRels)) {
      if (idSet.size > 0) {
        relationships[relType] = { ids: Array.from(idSet) };
      }
    }
    if (Object.keys(relationships).length > 0) {
      // TODO(#266748): entity type hardcoded to 'user' — use actorEntityType from config.
      objects.push({
        type: 'user',
        doc: { entity: { id: entityId, relationships } } as unknown as Entity,
      });
    }
  }

  if (objects.length === 0)
    return { updated: 0, notFound: 0, errors: 0, relationshipTypeApplied: {} };

  logger.info(`Writing relationship ids for ${objects.length} entity records`);
  const responseErrors = await crudClient.bulkUpdateEntity({ objects, force: true });

  const missingErrors = responseErrors.filter((e) => e.status === 404);
  const realErrors = responseErrors.filter((e) => e.status !== 404);
  const updated = objects.length - responseErrors.length;

  // Promote 404s from `debug` to `info` when non-trivial: a single 404 is
  // expected during entity extraction lag, but a sustained run with many
  // 404s indicates a config/namespace problem worth surfacing in the run
  // summary so the caller (task scheduler, alerting) can react.
  if (missingErrors.length > 0) {
    logger.info(
      `Skipped ${missingErrors.length} records: actor entities not yet in store ` +
        `(extraction lag, namespace mismatch, or suppression)`
    );
  }
  if (realErrors.length > 0) {
    logger.error(`Failed to write ${realErrors.length} records: ${JSON.stringify(realErrors)}`);
  }

  logger.info(`Wrote relationship ids for ${updated} entities`);

  // `bulkUpdateEntity` returns hashed EUIDs in `_id`, not raw entity IDs, so we
  // hash each entityId before checking. Count one per entity per rel-type (not per
  // target ID) to reflect writes landed, excluding entities whose bulk item failed.
  const failedHashes = new Set(responseErrors.map((e) => e._id));
  const relationshipTypeApplied: Record<string, number> = {};
  for (const [entityId, mergedRels] of merged) {
    if (!failedHashes.has(hashEntityId(entityId))) {
      for (const relType of Object.keys(mergedRels)) {
        relationshipTypeApplied[relType] = (relationshipTypeApplied[relType] ?? 0) + 1;
      }
    }
  }

  return {
    updated,
    notFound: missingErrors.length,
    errors: realErrors.length,
    relationshipTypeApplied,
  };
};
