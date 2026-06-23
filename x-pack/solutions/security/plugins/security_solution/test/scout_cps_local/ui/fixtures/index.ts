/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import { tags, test as baseTest } from '@kbn/scout-security';
import type { EsClient, SecurityTestFixtures, SecurityWorkerFixtures } from '@kbn/scout-security';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CPS_TAGS = [...tags.serverless.security.complete];

/** NPRE expression: search only the origin (self-linked) project. */
export const SPACE_PROJECT_ROUTING_ORIGIN_ONLY = '_alias:_origin';

/** NPRE expression: search the origin and all linked projects. */
export const SPACE_PROJECT_ROUTING_ALL = '_alias:*';

const ORIGIN_MARKER_FIELD = 'origin_marker';
const LINKED_MARKER_FIELD = 'linked_marker';

// Graph CPS fixture: distinguishable host names per project so the rendered graph
// can be inspected for origin-vs-linked entity nodes. The index pattern is matched
// by the Security data view's default `logs-*`.
const GRAPH_CPS_LOGS_INDEX_PREFIX = 'logs-scout-cps-graph-';
const GRAPH_CPS_ORIGIN_HOST_PREFIX = 'scout-cps-origin-host-';
const GRAPH_CPS_LINKED_HOST_PREFIX = 'scout-cps-linked-host-';

// ---------------------------------------------------------------------------
// ES index helpers (private to the fixture)
// ---------------------------------------------------------------------------

const createMarkerFieldIndex = async (
  esClient: EsClient,
  index: string,
  markerField: string
): Promise<void> => {
  await esClient.indices.delete({ index }, { ignore: [404] });
  await esClient.indices.create({
    index,
    mappings: {
      properties: {
        '@timestamp': { type: 'date' },
        'host.name': { type: 'keyword' },
        [markerField]: { type: 'keyword' },
      },
    },
  });
  await esClient.index({
    index,
    refresh: 'wait_for',
    body: {
      '@timestamp': new Date(Date.now() - 60_000).toISOString(),
      'host.name': `${markerField}-host`,
      [markerField]: 'present',
    },
  });
};

/**
 * Bulk-indexes graph-shaped events into a `logs-*` data stream so the Graph API's
 * default pattern picks them up. Each event has the minimum field set the events
 * query consumes: `event.id`, `event.action`, `host.name` (actor EUID), `@timestamp`.
 *
 * `logs-*` is reserved by the default `logs` index template (data-streams only) in
 * serverless ES, so we use `op_type: create` against the data-stream name — ES
 * auto-creates the data stream the first time a document is written.
 */
const createGraphEventsIndex = async (
  esClient: EsClient,
  dataStream: string,
  hostName: string,
  runId: string
): Promise<void> => {
  await esClient.indices.deleteDataStream({ name: dataStream }, { ignore: [404] });

  // Seed exactly one event per cluster: the existing `alertsTablePage` page object
  // requires exactly one alert per rule name (toHaveCount(1)), and the custom query
  // rule fires one alert per matched source event.
  //
  // The seeded event carries both actor (`host.entity.id`) and target
  // (`user.target.entity.id`) identity fields — `useGraphPreview` requires both
  // to mark `hasGraphData=true`, which in turn renders the Graph tab button in
  // the alert flyout's Visualize section.
  await esClient.bulk(
    {
      refresh: 'wait_for',
      operations: [
        { create: { _index: dataStream } },
        {
          '@timestamp': new Date(Date.now() - 5 * 60_000).toISOString(),
          event: { id: `${runId}-${hostName}-event-0`, action: 'graph-cps-action', kind: 'event' },
          host: { name: hostName, entity: { id: `host-${hostName}` } },
          user: { target: { entity: { id: `user-target-${hostName}` } } },
        },
      ],
    },
    // Bulk implicitly creates the data stream + backing index on first write.
    // On a resource-constrained host that can take longer than the ES JS
    // client's 30s default; bump to 3 minutes.
    { requestTimeout: 180_000 }
  );
};

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

export interface CpsTestDataFixture {
  testIndex: string;
  runId: string;
  originMarkerField: string;
  linkedMarkerField: string;
}

export interface GraphCpsTestDataFixture {
  /** Index pattern + concrete name used on both clusters; matches `logs-*`. */
  testIndex: string;
  runId: string;
  /** `host.name` value used by the events written to the origin cluster. */
  originHostName: string;
  /** `host.name` value used by the events written to the linked cluster. */
  linkedHostName: string;
}

export interface CpsSpaceFixture {
  create: (params: { spaceId: string; projectRouting: string }) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Extended test with CPS fixtures
// ---------------------------------------------------------------------------

export const test = baseTest.extend<
  SecurityTestFixtures & { cpsSpace: CpsSpaceFixture },
  SecurityWorkerFixtures & {
    cpsTestData: CpsTestDataFixture;
    graphCpsTestData: GraphCpsTestDataFixture;
  }
>({
  context: async ({ context }, use) => {
    // Suppress the CPS onboarding tour before any page loads so it cannot
    // intercept pointer events during test interactions.
    await context.addInitScript(() => {
      window.localStorage.setItem('cps:projectPicker:tourShown', 'true');
    });
    await use(context);
  },

  cpsTestData: [
    async ({ esClient, linkedProject }, use) => {
      const runId = randomUUID().slice(0, 8);
      const testIndex = `logstash-scout-cps-ui-${runId}`;

      await createMarkerFieldIndex(esClient, testIndex, ORIGIN_MARKER_FIELD);
      await createMarkerFieldIndex(linkedProject.esClient, testIndex, LINKED_MARKER_FIELD);

      await use({
        testIndex,
        runId,
        originMarkerField: ORIGIN_MARKER_FIELD,
        linkedMarkerField: LINKED_MARKER_FIELD,
      });

      await esClient.indices.delete({ index: testIndex }, { ignore: [404] });
      await linkedProject.esClient.indices.delete({ index: testIndex }, { ignore: [404] });
    },
    { scope: 'worker' },
  ],

  graphCpsTestData: [
    async ({ esClient, linkedProject }, use) => {
      const runId = randomUUID().slice(0, 8);
      const testIndex = `${GRAPH_CPS_LOGS_INDEX_PREFIX}${runId}`;
      const originHostName = `${GRAPH_CPS_ORIGIN_HOST_PREFIX}${runId}`;
      const linkedHostName = `${GRAPH_CPS_LINKED_HOST_PREFIX}${runId}`;

      await createGraphEventsIndex(esClient, testIndex, originHostName, runId);
      await createGraphEventsIndex(linkedProject.esClient, testIndex, linkedHostName, runId);

      await use({ testIndex, runId, originHostName, linkedHostName });

      await esClient.indices.deleteDataStream({ name: testIndex }, { ignore: [404] });
      await linkedProject.esClient.indices.deleteDataStream({ name: testIndex }, { ignore: [404] });
    },
    // Default Playwright fixture timeout is 60s. Creating a data stream on a fresh
    // stateless cluster (template instantiation + backing index creation) can take
    // longer on a resource-constrained host; budget 4 minutes.
    { scope: 'worker', timeout: 240_000 },
  ],

  cpsSpace: [
    async ({ kbnClient }, use) => {
      const createdSpaces: string[] = [];

      await use({
        create: async ({ spaceId, projectRouting }) => {
          await kbnClient.request({
            method: 'POST',
            path: '/api/spaces/space',
            body: {
              id: spaceId,
              name: `CPS detection test ${spaceId}`,
              description: 'Temporary space for CPS Scout tests',
              disabledFeatures: [],
              projectRouting,
            },
          });
          createdSpaces.push(spaceId);
          return spaceId;
        },
      });

      for (const spaceId of createdSpaces) {
        await kbnClient
          .request({ method: 'DELETE', path: `/api/spaces/space/${spaceId}` })
          .catch(() => {});
      }
    },
    { scope: 'test' },
  ],
});
