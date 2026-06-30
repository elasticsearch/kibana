/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { chunk } from 'lodash';
import { euid } from '@kbn/entity-store/common/euid_helpers';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';
import type { DetectionAlertLatest } from '../../../../../../common/api/detection_engine/model/alerts';
import type {
  AlertEnrichmentLogger,
  CreateV2EnrichmentFunction,
  EventsForEnrichment,
  EventsMapByEnrichments,
} from './types';

const CHUNK_SIZE = 1000;

interface ListEntitiesForEuidChunkOpts {
  euids: string[];
  entityStoreCrudClient: EntityStoreCRUDClient;
  enrichmentFields: string[];
}
const listEntitiesForEuidChunk = async ({
  euids,
  entityStoreCrudClient,
  enrichmentFields,
}: ListEntitiesForEuidChunkOpts) => {
  try {
    return await entityStoreCrudClient.listEntities({
      filter: { terms: { 'entity.id': euids } },
      size: euids.length,
      fields: ['entity.id', ...enrichmentFields],
    });
  } catch (e) {
    // Swallow errors from the entity store and return an empty result, since enrichment failure shouldn't block the rule execution. The enrichment will simply be skipped for all events in this chunk.
    return { entities: [], fields: [] };
  }
};
/**
 * Enriches alert events with data from the entity store V2, using the EUID translation
 * layer to identify entities. Queries via the entity store's `listEntities` API with a
 * KQL terms filter on `entity.id`, so all entity-store authorisation and index routing
 * is handled by the client rather than the raw ES client.
 *
 * For each event the EUID is computed in-memory from the event source (e.g.
 * `host.name` → `host:<value>`), the entity store is queried by `entity.id`,
 * and `createEnrichmentFunction` is called with the matching document's fields
 * (in dot-notation `{ 'entity.risk.calculated_level': [value], … }` format) to
 * produce the per-event mutation.
 */
export const createEntityStoreEnrichment = async <T extends DetectionAlertLatest>({
  name,
  entityType,
  entityStoreCrudClient,
  logger,
  events,
  enrichmentFields,
  createEnrichmentFunction,
}: {
  name: string;
  entityType: 'host' | 'user' | 'service';
  entityStoreCrudClient: EntityStoreCRUDClient;
  logger: AlertEnrichmentLogger;
  events: Array<EventsForEnrichment<T>>;
  enrichmentFields: string[];
  createEnrichmentFunction: CreateV2EnrichmentFunction;
}): Promise<EventsMapByEnrichments> => {
  try {
    logger.debug(`Enrichment ${name}: started`);

    // Compute the EUID for each event and group events by EUID.
    const eventsMapByEuid: Record<string, Array<EventsForEnrichment<T>>> = {};
    for (const event of events) {
      const computedEuid = euid.getEuidFromObject(entityType, event._source);
      if (computedEuid) {
        (eventsMapByEuid[computedEuid] ??= []).push(event);
      }
    }

    const euids = Object.keys(eventsMapByEuid);
    if (euids.length === 0) {
      logger.debug(`Enrichment ${name}: no events with ${entityType} EUID`);
      return {};
    }

    const eventsMapById: EventsMapByEnrichments = {};

    for (const euidChunk of chunk(euids, CHUNK_SIZE)) {
      const chunkResults = await listEntitiesForEuidChunk({
        euids: euidChunk,
        entityStoreCrudClient,
        enrichmentFields,
      });

      const enrichableEntities: Array<{ entityId: string; fields: Record<string, unknown[]> }> =
        chunkResults.entities.flatMap((entity, i) => {
          const entityId = entity?.entity?.id;
          if (!entityId) return [];
          return [{ entityId, fields: chunkResults.fields?.[i] ?? {} }];
        });

      enrichableEntities
        .flatMap(({ entityId, fields }) => {
          const enrichmentFn = createEnrichmentFunction(fields);
          if (!enrichmentFn) return [];
          return (eventsMapByEuid[entityId] ?? []).map((event) => ({ event, enrichmentFn }));
        })
        .forEach(({ event, enrichmentFn }) => {
          eventsMapById[event._id] = [enrichmentFn];
        });
    }

    logger.debug(
      `Enrichment ${name}: return ${Object.keys(eventsMapById).length} events ready to be enriched`
    );
    return eventsMapById;
  } catch (error) {
    logger.info(`Enrichment ${name} failed: ${error}`);
    return {};
  }
};
