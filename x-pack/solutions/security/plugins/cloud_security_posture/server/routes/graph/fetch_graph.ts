/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, IScopedClusterClient } from '@kbn/core/server';
import type { EsqlToRecords } from '@elastic/elasticsearch/lib/helpers';
import type { ProjectRouting } from '@kbn/cloud-security-posture-common/schema/graph/v1';
import { fetchEvents, regroupEvents, enrichEventDocData } from './fetch_events_graph';
import {
  fetchEntities,
  fetchEntityRelationships,
  regroupRelationships,
  enrichRelationshipDocData,
  enrichEntityRecords,
} from './fetch_entity_relationships_graph';
import { fetchEntityEnrichment, type EntityEnrichmentFields } from './fetch_entity_enrichment';
import { checkIfEntitiesIndexExists, addValuesToSet } from './utils';
import type {
  EsQuery,
  EntityId,
  OriginEventId,
  EventEdge,
  EventEsqlRow,
  RelationshipEdge,
  RelationshipEsqlRow,
  EntityRecord,
} from './types';

export interface FetchGraphParams {
  esClient: IScopedClusterClient;
  logger: Logger;
  start: string | number;
  end: string | number;
  originEventIds: OriginEventId[];
  showUnknownTarget: boolean;
  indexPatterns: string[];
  spaceId: string;
  esQuery?: EsQuery;
  entityIds?: EntityId[];
  pinnedIds?: string[];
  projectRouting?: ProjectRouting;
}

export interface FetchGraphResult {
  events: EventEdge[];
  relationships: RelationshipEdge[];
  entities: EntityRecord[];
}

const emptyEventsResult: EsqlToRecords<EventEsqlRow> = { columns: [], records: [] };
const emptyRelationshipsResult: EsqlToRecords<RelationshipEsqlRow> = { columns: [], records: [] };
const emptyEntitiesResult: EsqlToRecords<EntityRecord> = { columns: [], records: [] };

/**
 * Fetches graph data including both events and entity relationships.
 * Orchestrates parallel fetching of events from logs/alerts and relationships from entity store.
 * After fetching, performs a single consolidated enrichment query and re-groups results
 * by type/subtype, restoring the previous LOOKUP JOIN behavior in a CPS-safe way.
 */
export const fetchGraph = async ({
  esClient,
  logger,
  start,
  end,
  originEventIds,
  showUnknownTarget,
  indexPatterns,
  spaceId,
  esQuery,
  entityIds,
  pinnedIds,
  projectRouting,
}: FetchGraphParams): Promise<FetchGraphResult> => {
  // Only fetch events when originEventIds or esQuery are provided
  const hasOriginEventIds = originEventIds.length > 0;
  const hasEsQuery =
    !!esQuery?.bool.filter?.length ||
    !!esQuery?.bool.must?.length ||
    !!esQuery?.bool.should?.length ||
    !!esQuery?.bool.must_not?.length;

  const hasEntityIds = entityIds && entityIds.length > 0;

  // Single existence check upfront, reused by all entity-store-backed fetches and the
  // downstream enrichment query. Runs in parallel with the events fetch since events
  // hit logs/alerts indices and don't depend on the result.
  const [eventsResult, entityStoreIndexExists] = await Promise.all([
    hasOriginEventIds || hasEsQuery
      ? fetchEvents({
          esClient,
          logger,
          start,
          end,
          originEventIds,
          showUnknownTarget,
          indexPatterns,
          spaceId,
          esQuery,
          pinnedIds,
          projectRouting,
        }).catch((error) => {
          logger.error(`Failed to fetch events: ${error.message}`);
          throw error;
        })
      : Promise.resolve(emptyEventsResult),
    checkIfEntitiesIndexExists(esClient, logger, spaceId),
  ]);

  // Relationships and pinned entities both require the entity store index.
  const relationshipsPromise = hasEntityIds
    ? fetchEntityRelationships({
        esClient,
        logger,
        entityIds,
        spaceId,
        entityStoreIndexExists,
        pinnedIds,
      }).catch((error) => {
        logger.error(`Failed to fetch entity relationships: ${error.message}`);
        throw error;
      })
    : Promise.resolve(emptyRelationshipsResult);

  // We fetch the entities just in case they don't have any relationships. We would still like to see them in the graph.
  // These entities suppose to be pinned anyway. So there's no worry that they might be part of a group.
  const entitiesPromise = hasEntityIds
    ? fetchEntities({
        esClient,
        logger,
        entityIds,
        spaceId,
        entityStoreIndexExists,
      }).catch((error) => {
        logger.error(`Failed to fetch entities: ${error.message}`);
        throw error;
      })
    : Promise.resolve(emptyEntitiesResult);

  const [relationshipsResult, entitiesResult] = await Promise.all([
    relationshipsPromise,
    entitiesPromise,
  ]);

  logger.trace(
    `Fetched [events: ${eventsResult.records.length}] [relationships: ${relationshipsResult.records.length}]`
  );

  // Collect all entity IDs for a single consolidated enrichment query
  const allEntityIds = new Set<string>();
  for (const r of eventsResult.records) {
    addValuesToSet(allEntityIds, r.actorEntityId, { dropEmpty: true });
    addValuesToSet(allEntityIds, r.targetEntityId, { dropEmpty: true });
  }
  for (const r of relationshipsResult.records) {
    // actorIds is the multi-value set of same-type actors merged in the ES|QL STATS.
    addValuesToSet(allEntityIds, r.actorIds, { dropEmpty: true });
    if (r.targetId) allEntityIds.add(r.targetId);
  }
  for (const r of entitiesResult.records) {
    if (r.id) allEntityIds.add(r.id);
  }

  const enrichmentMap =
    allEntityIds.size > 0
      ? await fetchEntityEnrichment({
          esClient,
          logger,
          entityIds: [...allEntityIds],
          spaceId,
          entityStoreIndexExists,
        }).catch((error) => {
          logger.error(`Failed to enrich entities: ${error.message}`);
          throw error;
        })
      : new Map<string, EntityEnrichmentFields>();

  return {
    events: enrichEventDocData(regroupEvents(eventsResult.records, enrichmentMap), enrichmentMap),
    relationships: enrichRelationshipDocData(
      regroupRelationships(relationshipsResult.records, enrichmentMap),
      enrichmentMap
    ),
    entities: enrichEntityRecords(entitiesResult.records, enrichmentMap),
  };
};
