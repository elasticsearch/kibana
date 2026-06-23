/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';

export const WatchlistSyncUtils = (
  getService: FtrProviderContext['getService'],
  managedIndexNames: string[] = []
) => {
  const log = getService('log');
  const es = getService('es');
  const entityAnalyticsApi = getService('entityAnalyticsApi');
  const kibanaServer = getService('kibanaServer');

  const createSourceIndex = async (indexName: string) =>
    es.indices.create({
      index: indexName,
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          user: { properties: { name: { type: 'keyword' } } },
          department: { type: 'keyword' },
        },
      },
    });

  const addUsersToSourceIndex = async (users: string[], indexName: string, timestamp?: string) => {
    const ops = users.flatMap((name) => [
      { index: {} },
      { '@timestamp': timestamp ?? new Date().toISOString(), user: { name } },
    ]);
    await es.bulk({ index: indexName, body: ops, refresh: true });
  };

  const addDocsToSourceIndex = async (docs: Array<Record<string, unknown>>, indexName: string) => {
    const ops = docs.flatMap((doc) => [{ index: {} }, doc]);
    await es.bulk({ index: indexName, body: ops, refresh: true });
  };

  const deleteSourceIndex = async (indexName: string) => {
    await es.indices.delete({ index: indexName }, { ignore: [404] }).catch((err) => {
      log.error(`Error deleting index ${indexName}: ${err}`);
    });
  };

  const deleteAllSourceIndices = async () => {
    for (const indexName of managedIndexNames) {
      await deleteSourceIndex(indexName);
    }
  };

  const clearSourceIndex = async (indexName: string) => {
    await es
      .deleteByQuery(
        { index: indexName, query: { match_all: {} }, refresh: true },
        { ignore: [404] }
      )
      .catch((err) => {
        log.error(`Error clearing index ${indexName}: ${err}`);
      });
  };

  const createWatchlistAndEntitySource = async (
    watchlistName: string,
    sourceIndexPattern: string,
    range?: { start: string; end: string },
    queryRule?: string
  ) => {
    const { body: watchlist } = await entityAnalyticsApi.createWatchlist({
      body: {
        name: watchlistName,
        description: `Test watchlist for ${watchlistName}`,
        riskModifier: 1,
      },
    });

    log.info(`Created watchlist: ${JSON.stringify(watchlist)}`);

    const { body: entitySource } = await entityAnalyticsApi.createWatchlistEntitySource({
      params: { watchlist_id: watchlist.id },
      body: {
        type: 'index',
        name: `Source for ${watchlistName}`,
        indexPattern: sourceIndexPattern,
        identifierField: 'user.name',
        enabled: true,
        range: range ?? { start: 'now-10d', end: 'now' },
        ...(queryRule ? { queryRule } : {}),
      },
    });

    log.info(`Created entity source: ${JSON.stringify(entitySource)}`);

    return { watchlistId: watchlist.id, entitySourceId: entitySource.id };
  };

  const syncWatchlist = async (watchlistId: string) => {
    const response = await entityAnalyticsApi.syncWatchlist({
      params: { watchlist_id: watchlistId },
    });

    expect(response.status).toBe(200);
    return response;
  };

  const queryWatchlistIndex = async (watchlistId: string, namespace: string = 'default') => {
    const indexName = `.entity_analytics.watchlists.${namespace}`;

    const response = await es.search({
      index: indexName,
      size: 1000,
      query: { term: { 'watchlist.id': watchlistId } },
    });

    return response.hits.hits.map((hit) => hit._source as Record<string, unknown>);
  };

  const findEntity = (
    entities: Array<Record<string, unknown>>,
    euid: string
  ): Record<string, unknown> | undefined =>
    entities.find((e) => {
      const entity = e.entity as { id?: string } | undefined;
      return entity?.id === euid;
    });

  const deleteWatchlistDocs = async (watchlistId: string, namespace: string = 'default') => {
    const indexName = `.entity_analytics.watchlists.${namespace}`;
    await es
      .deleteByQuery(
        { index: indexName, query: { term: { 'watchlist.id': watchlistId } }, refresh: true },
        { ignore: [404] }
      )
      .catch((err) => {
        log.error(`Error deleting watchlist docs for ${watchlistId}: ${err}`);
      });
  };

  const cleanWatchlistState = async () => {
    await kibanaServer.savedObjects.clean({
      types: ['watchlist-config', 'watchlist-entity-source'],
    });
  };

  const clearEntitySourceApiKey = async (entitySourceId: string) => {
    await kibanaServer.savedObjects.update({
      id: entitySourceId,
      type: 'watchlist-entity-source',
      attributes: { apiKeyId: null, apiKey: null },
    });
  };

  return {
    createSourceIndex,
    addUsersToSourceIndex,
    addDocsToSourceIndex,
    deleteSourceIndex,
    deleteAllSourceIndices,
    clearSourceIndex,
    cleanWatchlistState,
    createWatchlistAndEntitySource,
    syncWatchlist,
    queryWatchlistIndex,
    findEntity,
    deleteWatchlistDocs,
    clearEntitySourceApiKey,
  };
};
