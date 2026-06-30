/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getJourneyScreenshot } from './get_journey_screenshot';
import { CHECK_GROUP_TIME_RANGE_BUFFER_MS } from '../../common/constants/client_defaults';
import { getUptimeESMockClient, mockSearchResult } from './test_helpers';

describe('getJourneyScreenshot', () => {
  it('returns screenshot data', async () => {
    const screenshotResult = {
      _id: 'id',
      _index: 'index',
      _source: {
        synthetics: {
          blob_mime: 'image/jpeg',
          blob: 'image data',
          step: {
            name: 'load homepage',
          },
          type: 'step/screenshot',
        },
      },
    };
    expect(
      await getJourneyScreenshot({
        syntheticsEsClient: mockSearchResult([], {
          step: {
            image: {
              hits: {
                total: 1,
                hits: [screenshotResult],
              },
            },
          },
        }),
        checkGroup: 'checkGroup',
        stepIndex: 0,
      })
    ).toEqual({
      synthetics: {
        blob: 'image data',
        blob_mime: 'image/jpeg',
        step: {
          name: 'load homepage',
        },
        type: 'step/screenshot',
      },
      totalSteps: 0,
    });
  });

  describe('remoteName CCS index override', () => {
    const emptyAggResponse = {
      took: 18,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        hits: [],
        max_score: 0.0,
        total: { value: 0, relation: 'eq' as const },
      },
      aggregations: {
        step: { image: { hits: { total: 0, hits: [] } } },
      },
    };

    it('does not override the index when remoteName is absent', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
      mockEsClient.search.mockResponseOnce(emptyAggResponse);

      await getJourneyScreenshot({
        syntheticsEsClient,
        checkGroup: 'checkGroup',
        stepIndex: 0,
      });

      const call: any = mockEsClient.search.mock.calls[0][0];
      expect(call.index).toBe(syntheticsEsClient.heartbeatIndices);
    });

    it('prefixes the index with remoteName when present', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
      mockEsClient.search.mockResponseOnce(emptyAggResponse);

      await getJourneyScreenshot({
        syntheticsEsClient,
        checkGroup: 'checkGroup',
        stepIndex: 0,
        remoteName: 'cluster1',
      });

      const call: any = mockEsClient.search.mock.calls[0][0];
      expect(call.index).toBe(`cluster1:${syntheticsEsClient.heartbeatIndices}`);
    });

    it('bounds the query by a time range around the run when timestamp is provided', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
      mockEsClient.search.mockResponseOnce(emptyAggResponse);

      const timestamp = '2023-01-01T00:00:00.000Z';
      await getJourneyScreenshot({
        syntheticsEsClient,
        checkGroup: 'checkGroup',
        stepIndex: 0,
        timestamp,
      });

      const call: any = mockEsClient.search.mock.calls[0][0];
      const runTime = new Date(timestamp).getTime();
      expect(call.query.bool.filter).toContainEqual({
        range: {
          '@timestamp': {
            gte: new Date(runTime - CHECK_GROUP_TIME_RANGE_BUFFER_MS).toISOString(),
            lte: new Date(runTime + CHECK_GROUP_TIME_RANGE_BUFFER_MS).toISOString(),
          },
        },
      });
    });

    it('does not add a time range filter when timestamp is absent', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
      mockEsClient.search.mockResponseOnce(emptyAggResponse);

      await getJourneyScreenshot({
        syntheticsEsClient,
        checkGroup: 'checkGroup',
        stepIndex: 0,
      });

      const call: any = mockEsClient.search.mock.calls[0][0];
      const hasTimestampRange = call.query.bool.filter.some(
        (clause: any) => clause?.range?.['@timestamp']
      );
      expect(hasTimestampRange).toBe(false);
    });
  });

  it('returns ref data', async () => {
    const screenshotRefResult = {
      _id: 'id',
      _index: 'index',
      _source: {
        '@timestamp': '123',
        monitor: {
          check_group: 'check_group',
        },
        screenshot_ref: {
          width: 10,
          height: 20,
          blocks: [
            {
              hash: 'hash1',
              top: 0,
              left: 0,
              height: 2,
              width: 4,
            },
            {
              hash: 'hash2',
              top: 0,
              left: 2,
              height: 2,
              width: 4,
            },
          ],
        },
        synthetics: {
          package_version: 'v1.0.0',
          step: {
            name: 'name',
            index: 0,
          },
          type: 'step/screenshot_ref',
        },
      },
    };
    expect(
      await getJourneyScreenshot({
        syntheticsEsClient: mockSearchResult([], {
          step: { image: { hits: { hits: [screenshotRefResult], total: 1 } } },
        }),
        checkGroup: 'checkGroup',
        stepIndex: 0,
      })
    ).toMatchInlineSnapshot(`
      Object {
        "@timestamp": "123",
        "monitor": Object {
          "check_group": "check_group",
        },
        "screenshot_ref": Object {
          "blocks": Array [
            Object {
              "hash": "hash1",
              "height": 2,
              "left": 0,
              "top": 0,
              "width": 4,
            },
            Object {
              "hash": "hash2",
              "height": 2,
              "left": 2,
              "top": 0,
              "width": 4,
            },
          ],
          "height": 20,
          "width": 10,
        },
        "synthetics": Object {
          "package_version": "v1.0.0",
          "step": Object {
            "index": 0,
            "name": "name",
          },
          "type": "step/screenshot_ref",
        },
        "totalSteps": 0,
      }
    `);
  });
});
