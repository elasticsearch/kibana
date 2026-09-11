/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  elasticsearchServiceMock,
  loggingSystemMock,
  type ScopedClusterClientMock,
} from '@kbn/core/server/mocks';
import type {
  ObservabilityAgentBuilderCoreSetup,
  ObservabilityAgentBuilderPluginSetupDependencies,
} from '../../types';
import { getObservabilityDataSources } from '../../utils/get_observability_data_sources';
import { getToolHandler } from './handler';

jest.mock('../../utils/get_observability_data_sources');

const mockGetObservabilityDataSources = jest.mocked(getObservabilityDataSources);

const createSearchResponse = (total: number) => ({
  took: 1,
  timed_out: false,
  _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
  hits: { total: { value: total, relation: 'eq' as const }, hits: [] },
});

const BASE_ARGS = {
  core: {} as ObservabilityAgentBuilderCoreSetup,
  plugins: {} as ObservabilityAgentBuilderPluginSetupDependencies,
  logger: loggingSystemMock.createLogger(),
  start: '2026-01-01T00:00:00.000Z',
  end: '2026-01-01T01:00:00.000Z',
  metric: 'latency' as const,
  percentileThreshold: 95,
  fieldCandidates: ['service.name'],
  limit: 10,
};

describe('get_apm_correlations handler', () => {
  let esClient: ScopedClusterClientMock;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient = elasticsearchServiceMock.createScopedClusterClient();
    mockGetObservabilityDataSources.mockResolvedValue({
      apmIndexPatterns: {
        transaction: 'traces-apm*',
        span: 'traces-apm*',
        error: 'logs-apm.error*',
        metric: 'metrics-apm*',
        onboarding: 'apm-*',
        sourcemap: 'apm-*',
      },
      logIndexPatterns: [],
      metricIndexPatterns: [],
      alertsIndexPattern: [],
    });
  });

  it('uses the valid value from an unkeyed percentile response', async () => {
    esClient.asCurrentUser.search
      .mockResolvedValueOnce(createSearchResponse(10))
      .mockResolvedValueOnce({
        ...createSearchResponse(10),
        aggregations: {
          duration_percentile: { values: [{ key: 95, value: 1_200 }] },
        },
      })
      .mockResolvedValueOnce(createSearchResponse(1))
      .mockResolvedValueOnce({
        ...createSearchResponse(0),
        aggregations: { correlated_values: { buckets: [] } },
      });

    const result = await getToolHandler({ ...BASE_ARGS, esClient });

    expect(esClient.asCurrentUser.search.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        aggs: {
          duration_percentile: {
            percentiles: {
              field: 'transaction.duration.us',
              percents: [95],
              keyed: false,
            },
          },
        },
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        subset: {
          totalTransactions: 1,
          definition: {
            metric: 'latency',
            percentileThreshold: 95,
            durationThresholdUs: 1_200,
          },
        },
      })
    );
  });

  it('rejects a genuinely missing percentile value', async () => {
    esClient.asCurrentUser.search
      .mockResolvedValueOnce(createSearchResponse(10))
      .mockResolvedValueOnce({
        ...createSearchResponse(10),
        aggregations: {
          duration_percentile: { values: [{ key: 95, value: null }] },
        },
      });

    await expect(getToolHandler({ ...BASE_ARGS, esClient })).rejects.toThrow(
      'Could not compute duration percentile (p95) for field "transaction.duration.us".'
    );
  });
});
