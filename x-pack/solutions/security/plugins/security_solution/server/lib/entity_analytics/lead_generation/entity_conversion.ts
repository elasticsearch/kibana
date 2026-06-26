/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';
import type { Entity } from '@kbn/entity-store/common';
import type { LeadEntity } from './types';

const MAX_CANDIDATE_ENTITIES = 500;

/** Row shape returned by {@link EntityStoreCRUDClient.listEntities}. */
type EntityStoreEntity = Awaited<
  ReturnType<EntityStoreCRUDClient['listEntities']>
>['entities'][number];

/**
 * Convert an Entity Store V2 record into a LeadEntity, extracting the EUID
 * (`entity.id`) as the identity field plus the convenience `type` and `name`
 * fields. Returns `undefined` when the record has no EUID — such records
 * cannot be the subject of correct observations because they have no stable
 * identity to join against.
 */
export const entityRecordToLeadEntity = (record: EntityStoreEntity): LeadEntity | undefined => {
  const r = record as Record<string, unknown>;
  const entityField = r.entity as
    | { name?: string; type?: string; id?: string; EngineMetadata?: { Type?: string } }
    | undefined;
  const id = entityField?.id;
  if (!id) return undefined;
  return {
    record: record as Entity,
    id,
    type: entityField?.EngineMetadata?.Type ?? entityField?.type ?? 'unknown',
    name: entityField?.name ?? id,
  };
};

/**
 * Fetch the top candidate entities from the V2 unified index, sorted by
 * risk score descending and capped at {@link MAX_CANDIDATE_ENTITIES}.
 *
 * Sorting and limiting are pushed to Elasticsearch via the CRUD client's
 * page-mode query so we avoid fetching all entities into Kibana memory.
 * Entities without a risk score sort last (ES `missing` default for desc).
 */
export const fetchCandidateEntities = async (
  crudClient: EntityStoreCRUDClient,
  logger?: Logger
): Promise<LeadEntity[]> => {
  const { entities, total } = await crudClient.listEntities({
    sortField: 'entity.risk.calculated_score_norm',
    sortOrder: 'desc',
    perPage: MAX_CANDIDATE_ENTITIES,
    page: 1,
  });

  const leadEntities = entities
    .map(entityRecordToLeadEntity)
    .filter((entity): entity is LeadEntity => entity !== undefined);
  const skipped = entities.length - leadEntities.length;

  logger?.debug(
    `[LeadGeneration] Entity selection: ${total ?? entities.length} total -> ${
      leadEntities.length
    } candidates (cap ${MAX_CANDIDATE_ENTITIES}${
      skipped > 0 ? `, skipped ${skipped} without EUID` : ''
    })`
  );

  return leadEntities;
};
