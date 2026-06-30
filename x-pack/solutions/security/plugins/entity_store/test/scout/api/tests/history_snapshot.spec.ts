/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import { hashEuid } from '../../../../common/domain/euid';
import {
  PUBLIC_HEADERS,
  INTERNAL_HEADERS,
  ENTITY_STORE_ROUTES,
  ENTITY_STORE_TAGS,
  LATEST_ALIAS,
} from '../fixtures/constants';
import { FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';
import {
  clearEntityStoreIndices,
  forceLogExtraction,
  normalizeKeywordList,
} from '../fixtures/helpers';

apiTest.describe('Entity Store History Snapshot', { tag: ENTITY_STORE_TAGS }, () => {
  let defaultHeaders: Record<string, string>;
  let internalHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ samlAuth, apiClient, esArchiver, kbnClient }) => {
    const credentials = await samlAuth.asInteractiveUser('admin');
    defaultHeaders = {
      ...credentials.cookieHeader,
      ...PUBLIC_HEADERS,
    };
    internalHeaders = {
      ...credentials.cookieHeader,
      ...INTERNAL_HEADERS,
    };

    await kbnClient.uiSettings.update({
      [FF_ENABLE_ENTITY_STORE_V2]: true,
    });

    const installResponse = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: { historySnapshot: { frequency: '24h' } },
    });
    expect(installResponse.statusCode).toBe(201);

    await esArchiver.loadIfNeeded(
      'x-pack/solutions/security/plugins/entity_store/test/scout/api/es_archives/updates'
    );
  });

  apiTest.afterAll(async ({ apiClient, esClient }) => {
    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect(response.statusCode).toBe(200);
    await clearEntityStoreIndices(esClient);
  });

  apiTest(
    'history snapshot: copies latest to history index and resets behaviors on latest',
    async ({ apiClient, esClient }) => {
      await forceLogExtraction(
        apiClient,
        internalHeaders,
        'host',
        '2026-01-20T11:00:00Z',
        '2026-01-20T13:00:00Z'
      );

      // Behaviors are managed fields — not populated by log extraction.
      // Seed them directly to simulate the detection engine writing behaviors.
      await esClient.update({
        index: LATEST_ALIAS,
        id: hashEuid('host:host-123'),
        refresh: 'wait_for',
        doc: {
          entity: { behaviors: { rule_names: ['rule-a', 'rule-b'], anomaly_job_ids: ['job-1'] } },
        },
      });
      await esClient.update({
        index: LATEST_ALIAS,
        id: hashEuid('host:server-01'),
        refresh: 'wait_for',
        doc: {
          entity: { behaviors: { rule_names: ['rule-c'], anomaly_job_ids: ['job-2', 'job-3'] } },
        },
      });

      const snapshotResponse = await apiClient.post(
        ENTITY_STORE_ROUTES.internal.FORCE_HISTORY_SNAPSHOT,
        {
          headers: internalHeaders,
          responseType: 'json',
          body: {},
        }
      );
      expect(snapshotResponse.statusCode).toBe(200);
      const body = snapshotResponse.body as {
        ok: boolean;
        historySnapshotIndex: string;
        docCount: number;
        resetCount: number;
      };
      expect(body.ok).toBe(true);

      expect(body.historySnapshotIndex).toMatch(
        /\.entities\.v2\.history\.security_default\.\d{4}-\d{2}-\d{2}-\d{2}$/
      );
      expect(typeof body.docCount).toBe('number');
      expect(typeof body.resetCount).toBe('number');
      expect(body.resetCount).toBe(body.docCount);

      const historyIndex = body.historySnapshotIndex;
      await esClient.indices.refresh({ index: historyIndex });
      const historyCount = await esClient.count({ index: historyIndex });
      expect(historyCount.count).toBe(body.docCount);

      const entityIdsWithBehaviors = ['host:host-123', 'host:server-01'] as const;
      const expectedBehaviorsInHistory = [
        { rule_names: ['rule-a', 'rule-b'], anomaly_job_ids: ['job-1'] },
        { rule_names: ['rule-c'], anomaly_job_ids: ['job-2', 'job-3'] },
      ] as const;

      const historySearchResult = await esClient.search({
        index: historyIndex,
        query: { terms: { 'entity.id': [...entityIdsWithBehaviors] } },
        size: entityIdsWithBehaviors.length,
      });

      const latestSearchResult = await esClient.search({
        index: LATEST_ALIAS,
        query: { terms: { 'entity.id': [...entityIdsWithBehaviors] } },
        size: entityIdsWithBehaviors.length,
      });

      const historyHits = (
        historySearchResult.hits.hits as Array<{ _source?: Record<string, unknown> }>
      ).filter((h) => h._source != null);
      const latestHits = (
        latestSearchResult.hits.hits as Array<{ _source?: Record<string, unknown> }>
      ).filter((h) => h._source != null);

      expect(historyHits).toHaveLength(entityIdsWithBehaviors.length);
      expect(latestHits).toHaveLength(entityIdsWithBehaviors.length);

      for (let i = 0; i < entityIdsWithBehaviors.length; i++) {
        const entityId = entityIdsWithBehaviors[i];
        const expectedBehavior = expectedBehaviorsInHistory[i];

        const historyHit = historyHits.find(
          (h) => (h._source!.entity as Record<string, unknown>)?.id === entityId
        );
        expect(historyHit).toBeDefined();
        const historyEntity = historyHit!._source!.entity as Record<string, unknown>;
        const historyBehaviors = historyEntity.behaviors as Record<string, unknown> | undefined;
        expect(normalizeKeywordList(historyBehaviors?.rule_names).sort()).toStrictEqual(
          [...expectedBehavior.rule_names].sort()
        );
        expect(normalizeKeywordList(historyBehaviors?.anomaly_job_ids).sort()).toStrictEqual(
          [...expectedBehavior.anomaly_job_ids].sort()
        );

        const latestHit = latestHits.find(
          (h) => (h._source!.entity as Record<string, unknown>)?.id === entityId
        );
        expect(latestHit).toBeDefined();
        expect(latestHit!._source!['@timestamp']).toBeDefined();
        const latestEntity = latestHit!._source!.entity as Record<string, unknown>;
        const latestBehaviors = latestEntity.behaviors as Record<string, unknown> | undefined;
        expect(normalizeKeywordList(latestBehaviors?.rule_names)).toStrictEqual([]);
        expect(normalizeKeywordList(latestBehaviors?.anomaly_job_ids)).toStrictEqual([]);
        expect((latestEntity.lifecycle as Record<string, unknown>)?.last_activity).toBeDefined();
      }
    }
  );
});
