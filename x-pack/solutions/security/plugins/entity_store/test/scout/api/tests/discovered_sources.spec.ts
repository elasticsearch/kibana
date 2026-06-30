/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import {
  PUBLIC_HEADERS,
  INTERNAL_HEADERS,
  ENTITY_STORE_ROUTES,
  ENTITY_STORE_TAGS,
  UPDATES_INDEX,
} from '../fixtures/constants';
import { clearEntityStoreIndices } from '../fixtures/helpers';
import { FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';
import type { DiscoveredSourcesResponseBody } from '../../../../server/routes/apis/discovered_sources';

type ApiWorkerFixtures = Parameters<Parameters<typeof apiTest>[2]>[0];
type ApiClientFixture = ApiWorkerFixtures['apiClient'];

/**
 * Deterministic source-discovery POC (`useDiscoveredIndexSource`). Unlike the KI
 * POC, discovery is deterministic, so these tests can seed a real `logs-*` data
 * stream and assert it surfaces in the discovered `FROM` end-to-end.
 *
 * Note: the alerts-index branch (`.alerts-security.alerts-<ns>`) is exercised by
 * unit tests rather than seeded here — the security alerts index is a
 * framework-managed system alias and is fragile to fabricate in an API test.
 */
apiTest.describe(
  'Entity Store deterministic source discovery API',
  { tag: ENTITY_STORE_TAGS },
  () => {
    // logs-* data stream carrying a keyword `user.email` — should qualify for the user engine.
    const LOGS_DATA_STREAM = 'logs-poc.discovery-default';
    const LOGS_INDEX_TEMPLATE = 'entity-store-poc-discovery-logs';
    const ALL_TYPES_EMPTY = { user: [], host: [], service: [], generic: [] };

    let defaultHeaders: Record<string, string>;
    let internalHeaders: Record<string, string>;

    const getDiscoveredSources = (apiClient: ApiClientFixture) =>
      apiClient.get(ENTITY_STORE_ROUTES.internal.DISCOVERED_SOURCES, {
        headers: internalHeaders,
        responseType: 'json',
      }) as Promise<{ statusCode: number; body: DiscoveredSourcesResponseBody }>;

    const setDiscoveryFlag = (apiClient: ApiClientFixture, enabled: boolean) =>
      apiClient.put(ENTITY_STORE_ROUTES.public.UPDATE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: { logExtraction: { useDiscoveredIndexSource: enabled } },
      });

    apiTest.beforeAll(async ({ samlAuth, apiClient, kbnClient, esClient }) => {
      const credentials = await samlAuth.asInteractiveUser('admin');
      defaultHeaders = { ...credentials.cookieHeader, ...PUBLIC_HEADERS };
      internalHeaders = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };

      await kbnClient.uiSettings.update({ [FF_ENABLE_ENTITY_STORE_V2]: true });

      // A `logs-*` Security Solution data view. With discovery OFF the engine
      // sources from this (the literal `logs-*` token). With discovery ON the
      // data view must be bypassed, so `logs-*` must NOT appear in the FROM.
      const dataViewResponse = await apiClient.post('/api/data_views/data_view', {
        headers: defaultHeaders,
        responseType: 'json',
        body: {
          override: true,
          data_view: {
            id: 'security-solution-default',
            name: 'security-solution-default',
            title: 'logs-*',
            timeFieldName: '@timestamp',
          },
        },
      });
      expect(dataViewResponse.statusCode).toBe(200);

      const installResponse = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });
      expect(installResponse.statusCode).toBe(201);

      // Seed a logs-* data stream with a keyword `user.email` BEFORE the first
      // discovery call so the 15-minute discovery cache is primed with it.
      await esClient.indices.putIndexTemplate({
        name: LOGS_INDEX_TEMPLATE,
        index_patterns: [LOGS_DATA_STREAM],
        data_stream: {},
        priority: 500,
        template: {
          mappings: {
            properties: {
              '@timestamp': { type: 'date' },
              user: {
                properties: {
                  email: { type: 'keyword' },
                  name: { type: 'keyword' },
                },
              },
            },
          },
        },
      });
      await esClient.indices.createDataStream({ name: LOGS_DATA_STREAM });
      await esClient.index({
        index: LOGS_DATA_STREAM,
        op_type: 'create',
        refresh: 'wait_for',
        body: {
          '@timestamp': new Date().toISOString(),
          event: { kind: 'asset', module: 'okta' },
          user: { email: 'poc-discovery@example.com', name: 'poc-discovery-user' },
        },
      });
    });

    apiTest.afterAll(async ({ apiClient, esClient }) => {
      await apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });
      await esClient.indices.deleteDataStream({ name: LOGS_DATA_STREAM }, { ignore: [404] });
      await esClient.indices.deleteIndexTemplate({ name: LOGS_INDEX_TEMPLATE }, { ignore: [404] });
      await clearEntityStoreIndices(esClient);
    });

    apiTest(
      'returns enabled:false with empty per-type sources when the flag is off',
      async ({ apiClient }) => {
        await setDiscoveryFlag(apiClient, false);

        const { statusCode, body } = await getDiscoveredSources(apiClient);

        expect(statusCode).toBe(200);
        expect(body.enabled).toBe(false);
        expect(body.sources).toStrictEqual(ALL_TYPES_EMPTY);
        expect(body.provenance).toStrictEqual([]);
      }
    );

    apiTest(
      'discovers the seeded logs-* data stream (by its clean name) once the flag is on',
      async ({ apiClient }) => {
        await setDiscoveryFlag(apiClient, true);

        const { statusCode, body } = await getDiscoveredSources(apiClient);

        expect(statusCode).toBe(200);
        expect(body.enabled).toBe(true);
        expect(body.sources.user).toContain(LOGS_DATA_STREAM);

        const userProvenance = body.provenance.find(
          (entry) => entry.entityType === 'user' && entry.sourceName === LOGS_DATA_STREAM
        );
        expect(userProvenance).toBeDefined();
        expect(userProvenance?.matchedFields).toContain('user.email');
      }
    );

    apiTest(
      'extraction FROM unions updates with discovered sources and bypasses the data view (no logs-* fallback)',
      async ({ apiClient }) => {
        await setDiscoveryFlag(apiClient, true);

        const extraction = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('user'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: { fromDateISO: '2026-01-20T11:00:00Z', toDateISO: '2026-01-20T13:00:00Z' },
          }
        );

        expect(extraction.statusCode).toBe(200);
        expect(extraction.body.success).toBe(true);

        const scannedIndices = extraction.body.scannedIndices as string[];
        // updates union is preserved …
        expect(scannedIndices).toContain(UPDATES_INDEX);
        // … the discovered data stream is sourced by its clean name …
        expect(scannedIndices).toContain(LOGS_DATA_STREAM);
        // … and the data view's `logs-*` token is gone (no silent fallback).
        expect(scannedIndices).not.toContain('logs-*');
      }
    );
  }
);
