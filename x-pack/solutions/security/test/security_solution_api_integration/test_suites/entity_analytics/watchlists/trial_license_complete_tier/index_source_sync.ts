/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';
import { WatchlistSyncUtils } from './utils/watchlist_sync_utils';
import { EntityStoreUtils } from './utils/entity_store_utils';

const userEuid = (name: string) => `user:${name}@unknown`;

const sourceIndexName = 'watchlist-index-sync-test-users';
const secondSourceIndexName = 'watchlist-index-sync-test-users-2';

export default ({ getService }: FtrProviderContext) => {
  const entityAnalyticsApi = getService('entityAnalyticsApi');

  describe('@ess @serverless @skipInServerlessMKI Index Source Sync', () => {
    const utils = WatchlistSyncUtils(getService, [sourceIndexName, secondSourceIndexName]);
    const entityStore = EntityStoreUtils(getService);

    before(async () => {
      await utils.cleanWatchlistState();
      await entityStore.install(['user']);
    });

    after(async () => {
      await entityStore.uninstall();
    });

    afterEach(async () => {
      await utils.deleteAllSourceIndices();
      await entityStore.clearAllEntityStoreData();
      await utils.cleanWatchlistState();
    });

    it('should remove an entity from the watchlist when it is removed from the source index', async () => {
      await utils.createSourceIndex(sourceIndexName);
      const { watchlistId } = await utils.createWatchlistAndEntitySource(
        'index-sync-deletion',
        sourceIndexName
      );

      await entityStore.createEntity('user', {
        user: { name: 'alice' },
        entity: { id: userEuid('alice'), type: 'user' },
      });

      await utils.addUsersToSourceIndex(['alice'], sourceIndexName);
      await utils.syncWatchlist(watchlistId);
      expect(await utils.queryWatchlistIndex(watchlistId)).toHaveLength(1);

      await utils.clearSourceIndex(sourceIndexName);
      await utils.syncWatchlist(watchlistId);
      expect(await utils.queryWatchlistIndex(watchlistId)).toHaveLength(0);
    });

    // TODO: Multi-source index sync is not yet officially supported. The implementation tracks
    // source ownership via labels.source_ids and only hard-deletes when all sources are gone,
    // so the logic is correct in principle. However, syncWatchlist processes sources concurrently
    // via Promise.all — if source 1's deletion detection runs before source 2's upsert has added
    // its source_id, the entity can be incorrectly removed. Revisit once multi-source index sync
    // is defined and the concurrency hazard is addressed.
    it.skip('should keep an entity when removed from one source but still present in another', async () => {
      await utils.createSourceIndex(sourceIndexName);
      await utils.createSourceIndex(secondSourceIndexName);
      const { watchlistId } = await utils.createWatchlistAndEntitySource(
        'index-sync-multi-source',
        sourceIndexName
      );

      await entityStore.createEntity('user', {
        user: { name: 'alice' },
        entity: { id: userEuid('alice'), type: 'user' },
      });

      await entityAnalyticsApi.createWatchlistEntitySource({
        params: { watchlist_id: watchlistId },
        body: {
          type: 'index',
          name: 'Second source',
          indexPattern: secondSourceIndexName,
          identifierField: 'user.name',
          enabled: true,
          range: { start: 'now-10d', end: 'now' },
        },
      });

      await utils.addUsersToSourceIndex(['alice'], sourceIndexName);
      await utils.addUsersToSourceIndex(['alice'], secondSourceIndexName);
      await utils.syncWatchlist(watchlistId);

      expect(await utils.queryWatchlistIndex(watchlistId)).toHaveLength(1);

      // Remove from first source — alice stays (still in second)
      await utils.clearSourceIndex(sourceIndexName);
      await utils.syncWatchlist(watchlistId);
      expect(await utils.queryWatchlistIndex(watchlistId)).toHaveLength(1);

      // Remove from second source — alice is hard-deleted
      await utils.clearSourceIndex(secondSourceIndexName);
      await utils.syncWatchlist(watchlistId);
      expect(await utils.queryWatchlistIndex(watchlistId)).toHaveLength(0);
    });

    it('should skip sync for an index source with no stored API key', async () => {
      await utils.createSourceIndex(sourceIndexName);
      const { watchlistId, entitySourceId } = await utils.createWatchlistAndEntitySource(
        'sync-skip-no-key',
        sourceIndexName
      );

      await entityStore.createEntity('user', {
        user: { name: 'alice' },
        entity: { id: userEuid('alice'), type: 'user' },
      });
      await utils.addUsersToSourceIndex(['alice'], sourceIndexName);

      // Simulate a source that has no API key stored
      await utils.clearEntitySourceApiKey(entitySourceId);

      await utils.syncWatchlist(watchlistId);

      expect(await utils.queryWatchlistIndex(watchlistId)).toHaveLength(0);
    });

    it('should resume sync after re-authorization', async () => {
      await utils.createSourceIndex(sourceIndexName);
      const { watchlistId, entitySourceId } = await utils.createWatchlistAndEntitySource(
        'sync-resume-reauth',
        sourceIndexName
      );

      await entityStore.createEntity('user', {
        user: { name: 'alice' },
        entity: { id: userEuid('alice'), type: 'user' },
      });
      await utils.addUsersToSourceIndex(['alice'], sourceIndexName);

      // Simulate a source that has no API key stored
      await utils.clearEntitySourceApiKey(entitySourceId);

      await utils.syncWatchlist(watchlistId);
      expect(await utils.queryWatchlistIndex(watchlistId)).toHaveLength(0);

      // Re-authorize: updating with no body re-mints the key for the existing index type
      await entityAnalyticsApi
        .updateWatchlistEntitySource({
          params: { watchlist_id: watchlistId, id: entitySourceId },
          body: {},
        })
        .expect(200);

      await utils.syncWatchlist(watchlistId);
      expect(await utils.queryWatchlistIndex(watchlistId)).toHaveLength(1);
    });

    it('should only sync documents matching the KQL filter on the entity source', async () => {
      await utils.createSourceIndex(sourceIndexName);
      const { watchlistId } = await utils.createWatchlistAndEntitySource(
        'index-sync-kql',
        sourceIndexName,
        undefined,
        'department: "engineering"'
      );

      await entityStore.createEntity('user', {
        user: { name: 'eng-user' },
        entity: { id: userEuid('eng-user'), type: 'user' },
      });
      await entityStore.createEntity('user', {
        user: { name: 'sales-user' },
        entity: { id: userEuid('sales-user'), type: 'user' },
      });

      await utils.addDocsToSourceIndex(
        [
          {
            '@timestamp': new Date().toISOString(),
            user: { name: 'eng-user' },
            department: 'engineering',
          },
          {
            '@timestamp': new Date().toISOString(),
            user: { name: 'sales-user' },
            department: 'sales',
          },
        ],
        sourceIndexName
      );

      await utils.syncWatchlist(watchlistId);

      const euids = (await utils.queryWatchlistIndex(watchlistId)).map(
        (e) => (e.entity as { id: string }).id
      );
      expect(euids).toContain(userEuid('eng-user'));
      expect(euids).not.toContain(userEuid('sales-user'));
    });
  });
};
