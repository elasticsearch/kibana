/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MsearchResponse } from '@elastic/elasticsearch/lib/api/types';
import type { DataTier } from '@kbn/observability-shared-plugin/common';
import { SyntheticsEsClient, applyExcludedDataTiersToQuery } from './lib';
import { savedObjectsClientMock, uiSettingsServiceMock } from '@kbn/core/server/mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';

describe('SyntheticsEsClient', () => {
  let syntheticsEsClient: SyntheticsEsClient;
  const savedObjectsClient = savedObjectsClientMock.create();
  const esClient = elasticsearchClientMock.createClusterClient().asInternalUser;

  beforeEach(() => {
    syntheticsEsClient = new SyntheticsEsClient(savedObjectsClient, esClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('msearch', () => {
    it('should call baseESClient.msearch with correct parameters', async () => {
      esClient.msearch.mockResolvedValueOnce({
        body: {
          responses: [
            { aggregations: { aggName: { value: 'str' } } },
            { aggregations: { aggName: { value: 'str' } } },
          ],
        },
      } as unknown as MsearchResponse);

      const mockSearchParams = [
        {
          query: {
            match_all: {},
          },
        },
        {
          query: {
            match_all: {},
          },
        },
      ];

      const result = await syntheticsEsClient.msearch(mockSearchParams);

      expect(esClient.msearch).toHaveBeenCalledWith(
        {
          searches: [
            {
              index: 'synthetics-*',
              ignore_unavailable: true,
            },
            mockSearchParams[0],
            {
              index: 'synthetics-*',
              ignore_unavailable: true,
            },
            mockSearchParams[1],
          ],
        },
        { meta: true }
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "responses": Array [
            Object {
              "aggregations": Object {
                "aggName": Object {
                  "value": "str",
                },
              },
            },
            Object {
              "aggregations": Object {
                "aggName": Object {
                  "value": "str",
                },
              },
            },
          ],
        }
      `);
    });
  });

  describe('search', () => {
    it('should call baseESClient.search with correct parameters', async () => {
      const mockSearchParams = {
        ignore_unavailable: true,
        query: {
          match_all: {},
        },
      };

      const result = await syntheticsEsClient.search({
        query: {
          match_all: {},
        },
      });

      expect(esClient.search).toHaveBeenCalledWith(
        {
          index: 'synthetics-*',
          ...mockSearchParams,
        },
        { meta: true, context: { loggingOptions: { loggerName: 'synthetics' } } }
      );
      expect(result).toEqual({
        body: {},
        headers: {
          'x-elastic-product': 'Elasticsearch',
        },
        meta: {},
        statusCode: 200,
        warnings: [],
      });
    });

    it('should throw an error if baseESClient.search throws an error', async () => {
      const mockSearchParams = {
        ignore_unavailable: true,
        query: {
          match_all: {},
        },
      };
      const mockError = new Error('Search error');
      esClient.search.mockRejectedValueOnce(mockError);

      await expect(syntheticsEsClient.search(mockSearchParams)).rejects.toThrow(mockError);
      expect(esClient.search).toHaveBeenCalledWith(
        {
          index: 'synthetics-*',
          ...mockSearchParams,
        },
        { meta: true, context: { loggingOptions: { loggerName: 'synthetics' } } }
      );
    });
  });

  describe('count', () => {
    it('should call baseESClient.count with correct parameters', async () => {
      const mockCountParams = {
        index: 'example',
        ignore_unavailable: true,
      };

      const result = await syntheticsEsClient.count(mockCountParams);

      expect(esClient.count).toHaveBeenCalledWith(mockCountParams, {
        meta: true,
        context: { loggingOptions: { loggerName: 'synthetics' } },
      });
      expect(result).toEqual({
        indices: 'synthetics-*',
        result: {
          body: {},
          headers: {
            'x-elastic-product': 'Elasticsearch',
          },
          meta: {},
          statusCode: 200,
          warnings: [],
        },
      });
    });

    it('should throw an error if baseESClient.count throws an error', async () => {
      const mockCountParams = {
        ignore_unavailable: true,
        index: 'example',
      };
      const mockError = new Error('Count error');
      esClient.count.mockRejectedValueOnce(mockError);

      await expect(syntheticsEsClient.count(mockCountParams)).rejects.toThrow(mockError);
      expect(esClient.count).toHaveBeenCalledWith(mockCountParams, {
        meta: true,
        context: { loggingOptions: { loggerName: 'synthetics' } },
      });
    });
  });

  describe('excluded data tiers', () => {
    const matchAll = { match_all: {} };
    const frozen: DataTier[] = ['data_frozen'];
    const expectedFrozenFilter = { bool: { must_not: [{ terms: { _tier: frozen } }] } };

    const createClientWithExcludedTiers = (tiers: DataTier[]) => {
      const uiSettings = uiSettingsServiceMock.createClient();
      uiSettings.get.mockResolvedValue(tiers);
      const client = new SyntheticsEsClient(savedObjectsClient, esClient, {
        uiSettingsClient: uiSettings,
      });
      return { client, uiSettings };
    };

    it('wraps the search query with a tier exclusion filter when configured', async () => {
      const { client, uiSettings } = createClientWithExcludedTiers(frozen);

      await client.search({ query: matchAll });

      expect(uiSettings.get).toHaveBeenCalledWith('observability:searchExcludedDataTiers');
      expect(esClient.search).toHaveBeenCalledWith(
        {
          index: 'synthetics-*',
          ignore_unavailable: true,
          query: { bool: { filter: [matchAll, expectedFrozenFilter] } },
        },
        { meta: true, context: { loggingOptions: { loggerName: 'synthetics' } } }
      );
    });

    it('does not modify the search query when no tiers are excluded', async () => {
      const { client } = createClientWithExcludedTiers([]);

      await client.search({ query: matchAll });

      expect(esClient.search).toHaveBeenCalledWith(
        { index: 'synthetics-*', ignore_unavailable: true, query: matchAll },
        { meta: true, context: { loggingOptions: { loggerName: 'synthetics' } } }
      );
    });

    it('wraps each msearch request with a tier exclusion filter when configured', async () => {
      esClient.msearch.mockResolvedValueOnce({
        body: { responses: [{}] },
      } as unknown as MsearchResponse);
      const { client } = createClientWithExcludedTiers(frozen);

      await client.msearch([{ query: matchAll }]);

      expect(esClient.msearch).toHaveBeenCalledWith(
        {
          searches: [
            { index: 'synthetics-*', ignore_unavailable: true },
            { query: { bool: { filter: [matchAll, expectedFrozenFilter] } } },
          ],
        },
        { meta: true }
      );
    });

    it('does not modify msearch requests when no tiers are excluded', async () => {
      esClient.msearch.mockResolvedValueOnce({
        body: { responses: [{}] },
      } as unknown as MsearchResponse);
      const { client, uiSettings } = createClientWithExcludedTiers([]);

      await client.msearch([{ query: matchAll }]);

      expect(uiSettings.get).toHaveBeenCalledWith('observability:searchExcludedDataTiers');
      expect(esClient.msearch).toHaveBeenCalledWith(
        {
          searches: [{ index: 'synthetics-*', ignore_unavailable: true }, { query: matchAll }],
        },
        { meta: true }
      );
    });

    it('wraps the count query with a tier exclusion filter when configured', async () => {
      const { client } = createClientWithExcludedTiers(frozen);

      await client.count({ query: matchAll });

      expect(esClient.count).toHaveBeenCalledWith(
        {
          index: 'synthetics-*',
          ignore_unavailable: true,
          query: { bool: { filter: [matchAll, expectedFrozenFilter] } },
        },
        { meta: true, context: { loggingOptions: { loggerName: 'synthetics' } } }
      );
    });

    it('does not modify the count query when no tiers are excluded', async () => {
      const { client, uiSettings } = createClientWithExcludedTiers([]);

      await client.count({ query: matchAll });

      expect(uiSettings.get).toHaveBeenCalledWith('observability:searchExcludedDataTiers');
      expect(esClient.count).toHaveBeenCalledWith(
        { index: 'synthetics-*', ignore_unavailable: true, query: matchAll },
        { meta: true, context: { loggingOptions: { loggerName: 'synthetics' } } }
      );
    });

    it('does not read ui settings when no client is provided', async () => {
      await syntheticsEsClient.search({ query: matchAll });

      expect(esClient.search).toHaveBeenCalledWith(
        { index: 'synthetics-*', ignore_unavailable: true, query: matchAll },
        { meta: true, context: { loggingOptions: { loggerName: 'synthetics' } } }
      );
    });
  });

  describe('applyExcludedDataTiersToQuery', () => {
    it('returns the original query when no tiers are excluded', () => {
      const query = { match_all: {} };

      expect(applyExcludedDataTiersToQuery(query, [])).toBe(query);
    });

    it('wraps an existing query with a must_not _tier filter', () => {
      const query = { term: { 'monitor.id': 'test-id' } };

      expect(applyExcludedDataTiersToQuery(query, ['data_cold', 'data_frozen'])).toEqual({
        bool: {
          filter: [
            query,
            { bool: { must_not: [{ terms: { _tier: ['data_cold', 'data_frozen'] } }] } },
          ],
        },
      });
    });

    it('builds a filter-only query when there is no original query', () => {
      expect(applyExcludedDataTiersToQuery(undefined, ['data_frozen'])).toEqual({
        bool: {
          filter: [{ bool: { must_not: [{ terms: { _tier: ['data_frozen'] } }] } }],
        },
      });
    });
  });

  describe('getInspectEnabled', () => {
    it('should return false if uiSettings is not available', async () => {
      const result = await syntheticsEsClient.getInspectEnabled();

      expect(result).toBe(false);
    });

    it('should return the value from uiSettings if available', async () => {
      const mockUiSettings = uiSettingsServiceMock.createClient();
      syntheticsEsClient.uiSettings = {
        client: mockUiSettings,
      } as any;

      // @ts-expect-error
      mockUiSettings.get.mockReturnValue(true);

      await syntheticsEsClient.getInspectEnabled();

      expect(syntheticsEsClient.isInspectorEnabled).toBe(true);
      expect(mockUiSettings.get).toHaveBeenCalledWith('observability:enableInspectEsQueries');
    });
  });
});
