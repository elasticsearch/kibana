/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { JourneyStep } from '../../common/runtime_types/ping/synthetics';
import { getJourneySteps } from './get_journey_steps';
import { CHECK_GROUP_TIME_RANGE_BUFFER_MS } from '../../common/constants/client_defaults';
import { getUptimeESMockClient } from './test_helpers';

describe('getJourneySteps request module', () => {
  describe('getJourneySteps', () => {
    let data: any;
    beforeEach(() => {
      data = {
        body: {
          hits: {
            hits: [
              {
                _id: 'o6myXncBFt2V8m6r6z-r',
                _source: {
                  '@timestamp': '2021-02-01T17:45:19.001Z',
                  synthetics: {
                    package_version: '0.0.1-alpha.8',
                    journey: {
                      name: 'inline',
                      id: 'inline',
                    },
                    step: {
                      name: 'load homepage',
                      index: 1,
                    },
                    type: 'step/end',
                  },
                  monitor: {
                    name: 'My Monitor',
                    id: 'my-monitor',
                    check_group: '2bf952dc-64b5-11eb-8b3b-42010a84000d',
                    type: 'browser',
                  },
                },
              },
              {
                _id: 'IjqzXncBn2sjqrYxYoCG',
                _source: {
                  '@timestamp': '2021-02-01T17:45:49.944Z',
                  synthetics: {
                    package_version: '0.0.1-alpha.8',
                    journey: {
                      name: 'inline',
                      id: 'inline',
                    },
                    step: {
                      name: 'hover over products menu',
                      index: 2,
                    },
                    type: 'step/end',
                  },
                  monitor: {
                    name: 'My Monitor',
                    timespan: {
                      lt: '2021-02-01T17:46:49.945Z',
                      gte: '2021-02-01T17:45:49.945Z',
                    },
                    id: 'my-monitor',
                    check_group: '2bf952dc-64b5-11eb-8b3b-42010a84000d',
                    type: 'browser',
                  },
                },
              },
            ],
          },
        },
      };
    });

    it('formats ES result', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();

      mockEsClient.search.mockResolvedValueOnce(data);
      const result: JourneyStep[] = await getJourneySteps({
        syntheticsEsClient,
        checkGroup: '2bf952dc-64b5-11eb-8b3b-42010a84000d',
      });
      expect(mockEsClient.search).toHaveBeenCalledTimes(1);
      const call: any = mockEsClient.search.mock.calls[0][0];

      // check that default `synthetics.type` value is supplied,
      expect(call.query.bool.filter[0]).toMatchInlineSnapshot(`
        Object {
          "terms": Object {
            "synthetics.type": Array [
              "cmd/status",
              "journey/browserconsole",
              "step/end",
              "step/screenshot",
              "step/screenshot_ref",
            ],
          },
        }
      `);

      // given check group is used for the terms filter
      expect(call.query.bool.filter[1]).toMatchInlineSnapshot(`
        Object {
          "term": Object {
            "monitor.check_group": "2bf952dc-64b5-11eb-8b3b-42010a84000d",
          },
        }
      `);

      // should sort by step index, then timestamp
      expect(call.sort).toMatchInlineSnapshot(`
        Array [
          Object {
            "synthetics.step.index": Object {
              "order": "asc",
            },
          },
          Object {
            "@timestamp": Object {
              "order": "asc",
            },
          },
        ]
      `);

      expect(result).toHaveLength(2);
      // `getJourneySteps` is responsible for formatting these fields, so we need to check them
      result.forEach((step: JourneyStep) => {
        expect(['2021-02-01T17:45:19.001Z', '2021-02-01T17:45:49.944Z']).toContain(
          step['@timestamp']
        );
        expect(['o6myXncBFt2V8m6r6z-r', 'IjqzXncBn2sjqrYxYoCG']).toContain(step._id);
        expect(step.synthetics.isFullScreenshot).toBeDefined();
      });
    });

    describe('remoteName CCS index override', () => {
      it('does not override the index when remoteName is absent', async () => {
        const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
        mockEsClient.search.mockResolvedValueOnce(data);

        await getJourneySteps({
          syntheticsEsClient,
          checkGroup: '2bf952dc-64b5-11eb-8b3b-42010a84000d',
        });

        const call: any = mockEsClient.search.mock.calls[0][0];
        expect(call.index).toBe(syntheticsEsClient.heartbeatIndices);
      });

      it('prefixes the index with remoteName when present', async () => {
        const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
        mockEsClient.search.mockResolvedValueOnce(data);

        await getJourneySteps({
          syntheticsEsClient,
          checkGroup: '2bf952dc-64b5-11eb-8b3b-42010a84000d',
          remoteName: 'cluster1',
        });

        const call: any = mockEsClient.search.mock.calls[0][0];
        expect(call.index).toBe(`cluster1:${syntheticsEsClient.heartbeatIndices}`);
      });
    });

    describe('timestamp bounding', () => {
      it('bounds the query by a time range around the run when timestamp is provided', async () => {
        const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();
        mockEsClient.search.mockResolvedValueOnce(data);

        const timestamp = '2021-02-01T17:45:19.001Z';
        await getJourneySteps({
          syntheticsEsClient,
          checkGroup: '2bf952dc-64b5-11eb-8b3b-42010a84000d',
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
        mockEsClient.search.mockResolvedValueOnce(data);

        await getJourneySteps({
          syntheticsEsClient,
          checkGroup: '2bf952dc-64b5-11eb-8b3b-42010a84000d',
        });

        const call: any = mockEsClient.search.mock.calls[0][0];
        const hasTimestampRange = call.query.bool.filter.some(
          (clause: any) => clause?.range?.['@timestamp']
        );
        expect(hasTimestampRange).toBe(false);
      });
    });

    it('notes screenshot exists when a document of type step/screenshot is included', async () => {
      const { esClient: mockEsClient, syntheticsEsClient } = getUptimeESMockClient();

      data.body.hits.hits[0]._source.synthetics.type = 'step/screenshot';
      data.body.hits.hits[0]._source.synthetics.step.index = 2;
      mockEsClient.search.mockResolvedValueOnce(data);

      const result: JourneyStep[] = await getJourneySteps({
        syntheticsEsClient,
        checkGroup: '2bf952dc-64b5-11eb-8b3b-42010a84000d',
      });

      const call: any = mockEsClient.search.mock.calls[0][0];

      // assert that filters for only the provided step types are used
      expect(call.query.bool.filter[0]).toMatchInlineSnapshot(`
        Object {
          "terms": Object {
            "synthetics.type": Array [
              "cmd/status",
              "journey/browserconsole",
              "step/end",
              "step/screenshot",
              "step/screenshot_ref",
            ],
          },
        }
      `);

      expect(result).toHaveLength(1);
      expect(result[0].synthetics.isFullScreenshot).toBe(true);
    });
  });
});
