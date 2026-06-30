/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getJourneyDetails } from './get_journey_details';
import { getUptimeESMockClient } from './test_helpers';

describe('getJourneyDetails', () => {
  describe('remoteName CCS index override', () => {
    const emptyResponse = {
      took: 18,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        hits: [],
        max_score: 0.0,
        total: { value: 0, relation: 'eq' as const },
      },
    };

    it('does not override the index when remoteName is absent', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
      mockEsClient.search.mockResponseOnce(emptyResponse);

      await getJourneyDetails({
        syntheticsEsClient,
        checkGroup: 'check-group-1',
      });

      const call: any = mockEsClient.search.mock.calls[0][0];
      expect(call.index).toBe(syntheticsEsClient.heartbeatIndices);
    });

    it('prefixes the index with remoteName when present', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
      mockEsClient.search.mockResponseOnce(emptyResponse);

      await getJourneyDetails({
        syntheticsEsClient,
        checkGroup: 'check-group-1',
        remoteName: 'cluster1',
      });

      const call: any = mockEsClient.search.mock.calls[0][0];
      expect(call.index).toBe(`cluster1:${syntheticsEsClient.heartbeatIndices}`);
    });

    it('bounds the current-journey query by @timestamp when a timestamp is provided', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
      mockEsClient.search.mockResponseOnce(emptyResponse);

      await getJourneyDetails({
        syntheticsEsClient,
        checkGroup: 'check-group-1',
        timestamp: '2024-01-01T00:00:00.000Z',
      });

      const call: any = mockEsClient.search.mock.calls[0][0];
      const rangeFilter = call.query.bool.filter.find((f: any) => f.range?.['@timestamp']);
      expect(rangeFilter).toEqual({
        range: {
          '@timestamp': {
            gte: '2023-12-31T23:00:00.000Z',
            lte: '2024-01-01T01:00:00.000Z',
          },
        },
      });
    });

    it('does not bound the current-journey query when no timestamp is provided', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
      mockEsClient.search.mockResponseOnce(emptyResponse);

      await getJourneyDetails({
        syntheticsEsClient,
        checkGroup: 'check-group-1',
      });

      const call: any = mockEsClient.search.mock.calls[0][0];
      const rangeFilter = call.query.bool.filter.find((f: any) => f.range?.['@timestamp']);
      expect(rangeFilter).toBeUndefined();
    });

    it('prefixes the sibling-journey queries with remoteName when present', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();

      // First call returns a journey/start hit so sibling queries fire.
      const journeyStartHit = {
        _id: 'journey-1',
        _index: 'cluster1:synthetics-browser-default',
        _source: {
          '@timestamp': '2024-01-01T00:00:00Z',
          monitor: { id: 'monitor-1', check_group: 'check-group-1' },
          observer: { geo: { name: 'us-east' } },
          synthetics: { type: 'journey/start' },
        },
      };
      mockEsClient.search.mockResponseOnce({
        ...emptyResponse,
        hits: {
          ...emptyResponse.hits,
          hits: [journeyStartHit],
          total: { value: 1, relation: 'eq' },
        },
      });
      mockEsClient.search.mockResponseOnce(emptyResponse);
      mockEsClient.search.mockResponseOnce(emptyResponse);

      await getJourneyDetails({
        syntheticsEsClient,
        checkGroup: 'check-group-1',
        remoteName: 'cluster1',
      });

      const allCalls = (mockEsClient.search as unknown as jest.Mock).mock.calls;
      expect(allCalls).toHaveLength(3);
      const expectedIndex = `cluster1:${syntheticsEsClient.heartbeatIndices}`;
      expect(allCalls[0][0].index).toBe(expectedIndex);
      expect(allCalls[1][0].index).toBe(expectedIndex);
      expect(allCalls[2][0].index).toBe(expectedIndex);
    });
  });
});
