/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DiscoverTabType } from '@kbn/discover-session-constants';
import { apiTest, tags, type RoleApiCredentials } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { injectReferences, parseSearchSourceJSON } from '@kbn/data-plugin/common';
import { FILTERS, FilterStateStore } from '@kbn/es-query';
import type { DiscoverSessionAttributes } from '@kbn/saved-search-plugin/server';
import type { DiscoverSessionApiDataInput } from '../../../../../server/api/schema';
import {
  COMMON_HEADERS,
  DISCOVER_SESSION_API_BASE_PATH,
  KBN_ARCHIVES,
  TEST_DISCOVER_SESSION_ID,
} from '../fixtures/constants';

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createEsqlTab = (id: string, query: string) => ({
  id,
  label: id,
  data_source: {
    type: 'esql',
    query,
  },
});

apiTest.describe('PUT /api/discover_sessions/{id}', { tag: tags.deploymentAgnostic }, () => {
  let editorCredentials: RoleApiCredentials;
  let viewerCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth }) => {
    editorCredentials = await requestAuth.getApiKeyForPrivilegedUser();
    viewerCredentials = await requestAuth.getApiKeyForViewer();
  });

  apiTest.beforeEach(async ({ kbnClient }) => {
    await kbnClient.importExport.load(KBN_ARCHIVES.SESSION_WITH_CONTROL);
  });

  apiTest.afterEach(async ({ kbnClient }) => {
    await kbnClient.savedObjects.clean({ types: ['search'] });
  });

  apiTest('creates a Discover session at the requested ID', async ({ apiClient }) => {
    const id = createId('put-create');
    const title = `PUT-created Discover session ${Date.now()}`;

    const response = await apiClient.put(`${DISCOVER_SESSION_API_BASE_PATH}/${id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: {
        title,
        tabs: [
          {
            id: 'main',
            label: 'Main',
            data_source: {
              type: 'data_view_reference',
              ref_id: 'missing-data-view',
            },
          },
        ],
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(201);
    expect(response.body).toMatchObject({
      id,
      data: {
        title,
        description: '',
        tabs: [
          expect.objectContaining({
            id: 'main',
            hide_chart: false,
            hide_table: false,
            data_source: {
              type: 'data_view_reference',
              ref_id: 'missing-data-view',
            },
          }),
        ],
      },
      meta: {
        managed: false,
      },
    });
    expect(response.body.meta.version).toBeDefined();
  });

  apiTest('fully replaces an existing Discover session', async ({ apiClient, kbnClient }) => {
    const id = TEST_DISCOVER_SESSION_ID;
    const initialSession = await kbnClient.savedObjects.get({
      type: 'search',
      id,
    });

    const replacementBody: DiscoverSessionApiDataInput = {
      title: 'Replacement session',
      tags: ['tag-1', 'tag-2'],
      tabs: [
        {
          id: 'replacement',
          label: 'Replacement',
          data_source: {
            type: 'data_view_reference',
            ref_id: 'replacement-data-view',
          },
        },
      ],
    };
    const response = await apiClient.put(`${DISCOVER_SESSION_API_BASE_PATH}/${id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: replacementBody,
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body.id).toBe(id);
    expect(response.body.data).toMatchObject({
      title: 'Replacement session',
      description: '',
      tags: ['tag-1', 'tag-2'],
      tabs: [
        expect.objectContaining({
          id: 'replacement',
          hide_chart: false,
          hide_table: false,
          data_source: {
            type: 'data_view_reference',
            ref_id: 'replacement-data-view',
          },
        }),
      ],
    });
    expect(response.body.data.tabs).toHaveLength(1);
    expect(response.body.meta.version).not.toBe(initialSession.version);

    const storedSession = await kbnClient.savedObjects.get({ type: 'search', id });
    expect(storedSession.references).toStrictEqual([
      {
        name: 'tag-ref-tag-1',
        type: 'tag',
        id: 'tag-1',
      },
      {
        name: 'tag-ref-tag-2',
        type: 'tag',
        id: 'tag-2',
      },
      {
        name: 'tab_replacement.kibanaSavedObjectMeta.searchSourceJSON.index',
        type: 'index-pattern',
        id: 'replacement-data-view',
      },
    ]);

    const repeatedResponse = await apiClient.put(`${DISCOVER_SESSION_API_BASE_PATH}/${id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: replacementBody,
      responseType: 'json',
    });

    expect(repeatedResponse).toHaveStatusCode(200);
    expect(repeatedResponse.body.data).toStrictEqual(response.body.data);

    // PUT fully replaces the session, so omitting tags removes the existing tag references.
    const responseWithoutTags = await apiClient.put(`${DISCOVER_SESSION_API_BASE_PATH}/${id}`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: {
        title: replacementBody.title,
        tabs: replacementBody.tabs,
      },
      responseType: 'json',
    });

    expect(responseWithoutTags).toHaveStatusCode(200);
    expect(responseWithoutTags.body.data.tags).toStrictEqual([]);

    const storedSessionWithoutTags = await kbnClient.savedObjects.get({ type: 'search', id });
    expect(storedSessionWithoutTags.references).toStrictEqual([
      {
        name: 'tab_replacement.kibanaSavedObjectMeta.searchSourceJSON.index',
        type: 'index-pattern',
        id: 'replacement-data-view',
      },
    ]);
  });

  apiTest(
    'preserves metrics tab state through a GET and PUT round trip',
    async ({ apiClient, kbnClient }) => {
      const id = createId('metrics-tab-state-round-trip');
      const storedTabTypeState: NonNullable<
        DiscoverSessionAttributes['tabs'][number]['attributes']['tabTypeState']
      > = {
        type: DiscoverTabType.Metrics,
        dimensions: ['host.name', 'service.name'],
        searchTerm: 'cpu',
        counterAggregation: 'max',
        gaugeAggregation: 'min',
        histogramPercentile: 'p99',
      };

      const attributes: DiscoverSessionAttributes = {
        title: 'Metrics tab state round trip',
        description: '',
        tabs: [
          {
            id: 'metrics-tab',
            label: 'Metrics',
            attributes: {
              hideChart: false,
              hideTable: false,
              columns: [],
              sort: [],
              grid: {},
              kibanaSavedObjectMeta: {
                searchSourceJSON: JSON.stringify({
                  query: { esql: 'TS metrics-* | LIMIT 10' },
                  filter: [],
                }),
              },
              isTextBasedQuery: true,
              tabTypeState: storedTabTypeState,
            },
          },
        ],
      };

      await kbnClient.savedObjects.create({
        type: 'search',
        id,
        overwrite: false,
        attributes,
        references: [],
      });

      const getResponse = await apiClient.get(`${DISCOVER_SESSION_API_BASE_PATH}/${id}`, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        responseType: 'json',
      });

      expect(getResponse).toHaveStatusCode(200);
      expect(getResponse.body.data.tabs[0]).toMatchObject({
        id: 'metrics-tab',
        type: 'metrics',
        dimensions: ['host.name', 'service.name'],
        search_term: 'cpu',
        counter_aggregation: 'max',
        gauge_aggregation: 'min',
        histogram_percentile: 'p99',
        data_source: {
          type: 'esql',
          query: 'TS metrics-* | LIMIT 10',
        },
      });
      expect('tabTypeState' in getResponse.body.data.tabs[0]).toBe(false);

      const putResponse = await apiClient.put(`${DISCOVER_SESSION_API_BASE_PATH}/${id}`, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        body: getResponse.body.data,
        responseType: 'json',
      });

      expect(putResponse).toHaveStatusCode(200);
      expect(putResponse.body.data).toStrictEqual(getResponse.body.data);

      const repeatedGetResponse = await apiClient.get(`${DISCOVER_SESSION_API_BASE_PATH}/${id}`, {
        headers: {
          ...COMMON_HEADERS,
          ...editorCredentials.apiKeyHeader,
        },
        responseType: 'json',
      });

      expect(repeatedGetResponse).toHaveStatusCode(200);
      expect(repeatedGetResponse.body.data).toStrictEqual(getResponse.body.data);

      const storedSession = await kbnClient.savedObjects.get<DiscoverSessionAttributes>({
        type: 'search',
        id,
      });
      expect(storedSession.attributes.tabs[0].attributes.tabTypeState).toStrictEqual(
        storedTabTypeState
      );
    }
  );

  apiTest(
    'updates an existing session whose ID predates the as-code format',
    async ({ apiClient, kbnClient }) => {
      const id = `Legacy-Discover-Session-${Date.now()}`;
      await kbnClient.savedObjects.create({
        type: 'search',
        id,
        overwrite: false,
        attributes: {
          title: 'Legacy session',
          description: '',
          tabs: [
            {
              id: 'main',
              label: 'Main',
              attributes: {
                hideChart: false,
                hideTable: false,
                columns: [],
                sort: [],
                grid: {},
                kibanaSavedObjectMeta: {
                  searchSourceJSON: JSON.stringify({
                    query: { esql: 'FROM logs-* | LIMIT 10' },
                    filter: [],
                  }),
                },
                isTextBasedQuery: true,
              },
            },
          ],
        },
        references: [],
      });

      const response = await apiClient.put(
        `${DISCOVER_SESSION_API_BASE_PATH}/${encodeURIComponent(id)}`,
        {
          headers: {
            ...COMMON_HEADERS,
            ...editorCredentials.apiKeyHeader,
          },
          body: {
            title: 'Updated legacy session',
            tabs: [createEsqlTab('main', 'FROM metrics-* | LIMIT 10')],
          },
          responseType: 'json',
        }
      );

      expect(response).toHaveStatusCode(200);
      expect(response.body.id).toBe(id);
      expect(response.body.data.title).toBe('Updated legacy session');
    }
  );

  apiTest(
    'preserves stored pinned filter conditions through GET, PUT, and GET',
    async ({ apiClient, kbnClient }) => {
      const id = createId('pinned-filter-round-trip');
      const url = `${DISCOVER_SESSION_API_BASE_PATH}/${id}`;
      const headers = { ...COMMON_HEADERS, ...editorCredentials.apiKeyHeader };
      const pinnedFilter = {
        meta: {
          index: 'logs-data-view',
          type: FILTERS.PHRASE,
          key: 'service.name',
          disabled: true,
          negate: true,
          alias: 'Saved condition',
        },
        query: { match_phrase: { 'service.name': 'checkout' } },
        $state: { store: FilterStateStore.GLOBAL_STATE },
      };
      const appFilter = {
        meta: { index: 'foreign-data-view', type: FILTERS.EXISTS, key: 'bytes' },
        query: { exists: { field: 'bytes' } },
        $state: { store: FilterStateStore.APP_STATE },
      };

      // Seed the stored format: the API cannot create a filter with a pin marker.
      await kbnClient.savedObjects.create({
        type: 'search',
        id,
        overwrite: false,
        attributes: {
          title: 'Session with a stored pinned filter',
          description: '',
          tabs: [
            {
              id: 'main',
              label: 'Main',
              attributes: {
                hideChart: false,
                hideTable: false,
                columns: [],
                sort: [],
                grid: {},
                isTextBasedQuery: false,
                kibanaSavedObjectMeta: {
                  searchSourceJSON: JSON.stringify({
                    index: 'logs-data-view',
                    query: { language: 'kuery', query: '' },
                    filter: [pinnedFilter, appFilter],
                  }),
                },
              },
            },
          ],
        },
        references: [],
      });

      const initialResponse = await apiClient.get(url, { headers, responseType: 'json' });

      expect(initialResponse).toHaveStatusCode(200);
      expect(initialResponse.body.data.tabs[0].filters).toStrictEqual([
        expect.objectContaining({
          type: 'condition',
          condition: { field: 'service.name', operator: 'is', value: 'checkout', negate: true },
          data_view_id: 'logs-data-view',
          disabled: true,
          negate: true,
          label: 'Saved condition',
        }),
        expect.objectContaining({
          type: 'condition',
          condition: { field: 'bytes', operator: 'exists' },
          data_view_id: 'foreign-data-view',
        }),
      ]);

      const saveResponse = await apiClient.put(url, {
        headers,
        body: initialResponse.body.data,
        responseType: 'json',
      });

      expect(saveResponse).toHaveStatusCode(200);
      expect(saveResponse.body.data).toStrictEqual(initialResponse.body.data);

      const reloadedResponse = await apiClient.get(url, { headers, responseType: 'json' });

      expect(reloadedResponse).toHaveStatusCode(200);
      expect(reloadedResponse.body.data).toStrictEqual(initialResponse.body.data);

      // Check the actual write, not just the API response: conditions remain, pin markers do not.
      const storedSession = await kbnClient.savedObjects.get<DiscoverSessionAttributes>({
        type: 'search',
        id,
      });
      const storedSearchSource = injectReferences(
        parseSearchSourceJSON(
          storedSession.attributes.tabs[0].attributes.kibanaSavedObjectMeta.searchSourceJSON
        ),
        storedSession.references
      );

      expect(storedSearchSource.filter).toMatchObject([
        { meta: pinnedFilter.meta, query: pinnedFilter.query },
        { meta: appFilter.meta, query: appFilter.query },
      ]);
      expect(storedSearchSource.filter?.map((filter) => filter.$state)).toStrictEqual([
        undefined,
        undefined,
      ]);
    }
  );

  apiTest('returns 400 for an invalid ID when creating a session', async ({ apiClient }) => {
    const response = await apiClient.put(`${DISCOVER_SESSION_API_BASE_PATH}/INVALID-ID`, {
      headers: {
        ...COMMON_HEADERS,
        ...editorCredentials.apiKeyHeader,
      },
      body: {
        title: 'Invalid ID',
        tabs: [createEsqlTab('main', 'FROM logs-* | LIMIT 10')],
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(400);
  });

  apiTest('returns 403 when the user cannot update Discover sessions', async ({ apiClient }) => {
    const response = await apiClient.put(
      `${DISCOVER_SESSION_API_BASE_PATH}/${TEST_DISCOVER_SESSION_ID}`,
      {
        headers: {
          ...COMMON_HEADERS,
          ...viewerCredentials.apiKeyHeader,
        },
        body: {
          title: 'Forbidden Discover session',
          tabs: [createEsqlTab('main', 'FROM logs-* | LIMIT 10')],
        },
        responseType: 'json',
      }
    );

    expect(response).toHaveStatusCode(403);
  });
});
