/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RequestMock } from '../test/helpers';
import { routeDependencies, RouterMock } from '../test/helpers';
import { addBasePath } from '../routes/api';
import { registerIndicesRoutes } from '../routes/api/indices';
import {
  createTestIndexResponse,
  createTestIndexState,
  createTestIndexStats,
} from '../test/helpers/indices_fixtures';

describe('[Index management API Routes] fetch indices lib function', () => {
  const router = new RouterMock();

  const getIndices = router.getMockESApiFn('indices.get');
  const getIndicesStats = router.getMockESApiFn('indices.stats');
  const getMeteringStats = router.getMockESApiFnAsSecondaryAuthUser('transport.request');
  const mockRequest: RequestMock = {
    method: 'get',
    path: addBasePath('/indices'),
  };

  describe('stateful', () => {
    beforeAll(() => {
      registerIndicesRoutes({
        ...routeDependencies,
        config: {
          ...routeDependencies.config,
          isSizeAndDocCountEnabled: false,
          isIndexStatsEnabled: true,
        },
        router,
      });
    });

    test('regular index', async () => {
      getIndices.mockResolvedValue({
        regular_index: createTestIndexState(),
      });
      getIndicesStats.mockResolvedValue({
        indices: {
          regular_index: createTestIndexStats({ uuid: 'regular_index' }),
        },
      });

      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: [createTestIndexResponse({ name: 'regular_index', uuid: 'regular_index' })],
      });
    });
    test('index with aliases', async () => {
      getIndices.mockResolvedValue({
        index_with_aliases: createTestIndexState({
          aliases: { test_alias: {}, another_alias: {} },
        }),
      });
      getIndicesStats.mockResolvedValue({
        indices: {
          index_with_aliases: createTestIndexStats({ uuid: 'index_with_aliases' }),
        },
      });

      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: [
          createTestIndexResponse({
            aliases: ['test_alias', 'another_alias'],
            name: 'index_with_aliases',
            uuid: 'index_with_aliases',
          }),
        ],
      });
    });
    test('frozen index', async () => {
      getIndices.mockResolvedValue({
        frozen_index: createTestIndexState({
          settings: { index: { number_of_shards: 1, number_of_replicas: 1, frozen: 'true' } },
        }),
      });
      getIndicesStats.mockResolvedValue({
        indices: {
          frozen_index: createTestIndexStats({ uuid: 'frozen_index' }),
        },
      });

      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: [
          createTestIndexResponse({
            name: 'frozen_index',
            uuid: 'frozen_index',
            isFrozen: true,
          }),
        ],
      });
    });
    test('lookup indices expose their configured lifecycle policies', async () => {
      getIndices.mockResolvedValue({
        lookup_index: createTestIndexState({
          settings: {
            index: {
              number_of_shards: 1,
              number_of_replicas: 1,
              mode: 'lookup',
              lifecycle: { name: 'stale-policy' },
            },
          },
        }),
        another_lookup_index: createTestIndexState({
          settings: {
            index: {
              number_of_shards: 1,
              number_of_replicas: 1,
              mode: 'lookup',
              lifecycle: { name: 'another-policy' },
            },
          },
        }),
      });
      getIndicesStats.mockResolvedValue({
        indices: {
          lookup_index: createTestIndexStats({ uuid: 'lookup_index' }),
          another_lookup_index: createTestIndexStats({ uuid: 'another_lookup_index' }),
        },
      });

      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: [
          createTestIndexResponse({
            name: 'lookup_index',
            uuid: 'lookup_index',
            mode: 'lookup',
            ilmPolicyName: 'stale-policy',
          }),
          createTestIndexResponse({
            name: 'another_lookup_index',
            uuid: 'another_lookup_index',
            mode: 'lookup',
            ilmPolicyName: 'another-policy',
          }),
        ],
      });
      expect(getIndices).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filter_path: expect.arrayContaining([
            '*.settings.index.mode',
            '*.settings.index.lifecycle.name',
          ]),
        })
      );
    });
    test('hidden index', async () => {
      getIndices.mockResolvedValue({
        hidden_index: createTestIndexState({
          settings: { index: { number_of_shards: 1, number_of_replicas: 1, hidden: 'true' } },
        }),
      });
      getIndicesStats.mockResolvedValue({
        indices: {
          hidden_index: createTestIndexStats({ uuid: 'hidden_index' }),
        },
      });

      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: [
          createTestIndexResponse({
            name: 'hidden_index',
            uuid: 'hidden_index',
            hidden: true,
          }),
        ],
      });
    });
    test('data stream index', async () => {
      getIndices.mockResolvedValue({
        data_stream_index: createTestIndexState({
          data_stream: 'test_data_stream',
        }),
      });
      getIndicesStats.mockResolvedValue({
        indices: {
          data_stream_index: createTestIndexStats({ uuid: 'data_stream_index' }),
        },
      });

      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: [
          createTestIndexResponse({
            name: 'data_stream_index',
            uuid: 'data_stream_index',
            data_stream: 'test_data_stream',
          }),
        ],
      });
    });
    test('index missing in stats call', async () => {
      getIndices.mockResolvedValue({
        index_missing_stats: createTestIndexState(),
      });
      // simulates when an index has been deleted after get indices call
      // deleted index won't be present in the indices stats call response
      getIndicesStats.mockResolvedValue({
        indices: {
          some_other_index: createTestIndexStats({ uuid: 'some_other_index' }),
        },
      });
      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: [
          createTestIndexResponse({
            name: 'index_missing_stats',
            uuid: undefined,
            health: undefined,
            status: undefined,
            documents: 0,
            size: 0,
            primary_size: 0,
          }),
        ],
      });
    });
  });

  describe('stateless', () => {
    beforeAll(() => {
      registerIndicesRoutes({
        ...routeDependencies,
        config: {
          ...routeDependencies.config,
          isSizeAndDocCountEnabled: true,
          isIndexStatsEnabled: false,
        },
        router,
      });
    });

    test('regular index', async () => {
      getIndices.mockResolvedValue({
        regular_index: createTestIndexState(),
      });
      getMeteringStats.mockResolvedValue({
        indices: [{ name: 'regular_index', num_docs: 100, size_in_bytes: 1000 }],
      });

      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: [
          {
            name: 'regular_index',
            isFrozen: false,
            aliases: 'none',
            hidden: false,
            data_stream: undefined,
            documents: 100,
            size: 1000,
          },
        ],
      });
    });

    test('lookup indices expose their configured lifecycle policies', async () => {
      getIndices.mockResolvedValue({
        lookup_index: createTestIndexState({
          settings: {
            index: {
              number_of_shards: 1,
              number_of_replicas: 1,
              mode: 'lookup',
              lifecycle: { name: 'stale-policy' },
            },
          },
        }),
        another_lookup_index: createTestIndexState({
          settings: {
            index: {
              number_of_shards: 1,
              number_of_replicas: 1,
              mode: 'lookup',
              lifecycle: { name: 'another-policy' },
            },
          },
        }),
      });
      getMeteringStats.mockResolvedValue({
        indices: [
          { name: 'lookup_index', num_docs: 100, size_in_bytes: 1000 },
          { name: 'another_lookup_index', num_docs: 200, size_in_bytes: 2000 },
        ],
      });

      const response = await router.runRequest(mockRequest);

      expect(response.body[0]).toMatchObject({
        name: 'lookup_index',
        mode: 'lookup',
        ilmPolicyName: 'stale-policy',
      });
      expect(response.body[1]).toMatchObject({
        name: 'another_lookup_index',
        mode: 'lookup',
        ilmPolicyName: 'another-policy',
      });
    });
  });

  describe('without index stats or metering', () => {
    beforeAll(() => {
      registerIndicesRoutes({
        ...routeDependencies,
        config: {
          ...routeDependencies.config,
          isSizeAndDocCountEnabled: false,
          isIndexStatsEnabled: false,
        },
        router,
      });
    });

    test('lookup indices expose their configured lifecycle policies', async () => {
      getIndices.mockResolvedValue({
        lookup_index: createTestIndexState({
          settings: {
            index: {
              number_of_shards: 1,
              number_of_replicas: 1,
              mode: 'lookup',
              lifecycle: { name: 'stale-policy' },
            },
          },
        }),
        another_lookup_index: createTestIndexState({
          settings: {
            index: {
              number_of_shards: 1,
              number_of_replicas: 1,
              mode: 'lookup',
              lifecycle: { name: 'another-policy' },
            },
          },
        }),
      });

      const response = await router.runRequest(mockRequest);

      expect(response.body[0]).toMatchObject({
        name: 'lookup_index',
        mode: 'lookup',
        ilmPolicyName: 'stale-policy',
      });
      expect(response.body[1]).toMatchObject({
        name: 'another_lookup_index',
        mode: 'lookup',
        ilmPolicyName: 'another-policy',
      });
    });
  });
});
