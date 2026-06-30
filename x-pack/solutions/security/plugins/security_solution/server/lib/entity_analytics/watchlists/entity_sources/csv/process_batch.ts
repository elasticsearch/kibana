/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import pMap from 'p-map';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';
import type { WatchlistCsvUploadResponseItem } from '../../../../../../common/api/entity_analytics/watchlists/csv_upload/csv_upload.gen';
import { bulkUpsertOperationsFactory } from '../bulk/upsert';
import { addWatchlistAttributeToStore } from '../sync/entity_store_sync';
import { getErrorFromBulkResponse, errorsMsg } from '../sync/utils';
import { MANUAL_SOURCE_ID } from '../manual/constants';
import type { MatchedEntity, Watchlist } from './types';
import { lookupEntitiesForRow } from './lookup';

const toRowResult = (
  numEntitiesMatched: number,
  error?: string
): WatchlistCsvUploadResponseItem => ({
  matchedEntities: numEntitiesMatched,
  status: error ? 'failure' : numEntitiesMatched > 0 ? 'success' : 'unmatched',
  ...(error ? { error } : {}),
});

const lookupRows = async (
  batch: Array<Record<string, unknown>>,
  startIndex: number,
  entityStoreClient: EntityStoreCRUDClient,
  logger: Logger
) =>
  pMap(
    batch,
    async (row, i) => {
      const rowIndex = startIndex + i;
      try {
        const { numEntitiesMatched, entities } = await lookupEntitiesForRow(
          entityStoreClient,
          row,
          rowIndex,
          logger
        );
        return { numEntitiesMatched, entities, error: undefined };
      } catch (err) {
        logger.error(`[WatchlistCsvUpload] Error processing row ${rowIndex}: ${err}`);
        return {
          numEntitiesMatched: 0,
          entities: [] as MatchedEntity[],
          error: `Error processing row: ${(err as Error).message}`,
        };
      }
    },
    { concurrency: 10 }
  );

const upsertToWatchlistIndex = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  matched: MatchedEntity[],
  watchlist: Watchlist
) => {
  const entities = matched.map((m) => ({
    euid: m.euid,
    type: m.type,
    sourceId: MANUAL_SOURCE_ID,
    currentWatchlists: m.currentWatchlists,
  }));

  const operations = bulkUpsertOperationsFactory(
    logger,
    watchlist
  )({
    entities,
    sourceLabel: MANUAL_SOURCE_ID,
    targetIndex: watchlist.index,
  });

  if (operations.length > 0) {
    const resp = await esClient.bulk({ refresh: 'wait_for', body: operations });
    const errors = getErrorFromBulkResponse(resp);
    if (errors.length > 0) {
      logger.error(`[WatchlistCsvUpload] Bulk upsert errors: ${errorsMsg(errors)}`);
    }
  }
};

const syncEntityStoreAttributes = async (
  crudClient: EntityStoreCRUDClient,
  logger: Logger,
  matched: MatchedEntity[],
  watchlistId: string
) => {
  await addWatchlistAttributeToStore({
    crudClient,
    logger,
    entityRefs: matched.map((m) => ({
      euid: m.euid,
      type: m.type,
      currentWatchlists: m.currentWatchlists,
    })),
    watchlistId,
  });
};

const markBatchAsFailed = (
  results: WatchlistCsvUploadResponseItem[],
  startIndex: number,
  batchLength: number,
  errorMsg: string
) => {
  for (let i = 0; i < batchLength; i++) {
    const result = results[startIndex + i];
    if (result.status === 'success') {
      result.status = 'failure';
      result.error = errorMsg;
    }
  }
};

/**
 * Processes a batch of CSV rows:
 * 1. Look up matching entities concurrently
 * 2. Collect row results
 * 3. Upsert matches into watchlist index
 * 4. Sync entity store watchlists attribute
 */
export const processBatch = async ({
  batch,
  entityStoreClient,
  esClient,
  logger,
  results,
  startIndex,
  watchlist,
}: {
  batch: Array<Record<string, unknown>>;
  entityStoreClient: EntityStoreCRUDClient;
  esClient: ElasticsearchClient;
  logger: Logger;
  results: WatchlistCsvUploadResponseItem[];
  startIndex: number;
  watchlist: Watchlist;
}) => {
  const rowResults = await lookupRows(batch, startIndex, entityStoreClient, logger);

  const allMatched = rowResults.flatMap(({ entities }) => entities);

  rowResults.forEach(({ numEntitiesMatched, error }) => {
    results.push(toRowResult(numEntitiesMatched, error));
  });

  if (allMatched.length === 0) return;

  try {
    await upsertToWatchlistIndex(esClient, logger, allMatched, watchlist);
    await syncEntityStoreAttributes(entityStoreClient, logger, allMatched, watchlist.id);
  } catch (err) {
    logger.error(
      `[WatchlistCsvUpload] Bulk operations failed for batch at index ${startIndex}: ${err}`
    );
    markBatchAsFailed(
      results,
      startIndex,
      batch.length,
      `Bulk update failed: ${(err as Error).message}`
    );
  }
};
