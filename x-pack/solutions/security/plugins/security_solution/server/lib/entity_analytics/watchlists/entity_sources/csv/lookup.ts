/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { EntityType } from '@kbn/entity-store/common';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';
import { MAX_ITERATIONS, LIST_PAGE_SIZE } from './constants';
import type { MatchedEntity } from './types';
import { parseEntityType, buildEntityFilters } from './parse';

interface LookupResult {
  numEntitiesMatched: number;
  entities: MatchedEntity[];
}

/**
 * Processes a single CSV row: validates, builds filters, and looks up
 * matching entities in the entity store.
 */
export const lookupEntitiesForRow = async (
  entityStoreClient: EntityStoreCRUDClient,
  row: Record<string, unknown>,
  rowIndex: number,
  logger: Logger
): Promise<LookupResult> => {
  const type = parseEntityType(row);
  const filters = buildEntityFilters(row, type);
  const entities = await paginateEntityStore(entityStoreClient, filters, type, rowIndex, logger);

  return { numEntitiesMatched: entities.length, entities };
};

/**
 * Paginates through the entity store, collecting all entities
 * that match the given filters.
 */
const paginateEntityStore = async (
  entityStoreClient: EntityStoreCRUDClient,
  filters: QueryDslQueryContainer[],
  type: EntityType,
  rowIndex: number,
  logger: Logger
): Promise<MatchedEntity[]> => {
  const entities: MatchedEntity[] = [];
  let searchAfter: Array<string | number> | undefined;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const { entities: page, nextSearchAfter } = await entityStoreClient.listEntities({
      filter: filters,
      size: LIST_PAGE_SIZE,
      source: ['entity.id', 'entity.attributes.watchlists'],
      searchAfter,
    });

    if (page.length === 0) break;

    entities.push(
      ...page
        .filter((e): e is typeof e & { entity: { id: string } } => !!e.entity?.id)
        .map((e) => toMatchedEntity(e.entity.id, type, e.entity?.attributes?.watchlists, rowIndex))
    );

    searchAfter = nextSearchAfter;
    if (!searchAfter || page.length < LIST_PAGE_SIZE) break;
  }

  if (entities.length >= MAX_ITERATIONS * LIST_PAGE_SIZE) {
    logger.warn(
      `[WatchlistCsvUpload] Max iterations reached for row ${rowIndex}. ` +
        `${MAX_ITERATIONS * LIST_PAGE_SIZE} entities will be processed.`
    );
  }

  return entities;
};

const toMatchedEntity = (
  entityId: string,
  type: EntityType,
  watchlists: string[] | undefined,
  rowIndex: number
): MatchedEntity => ({
  euid: entityId,
  type,
  currentWatchlists: watchlists,
  rowIndex,
});
