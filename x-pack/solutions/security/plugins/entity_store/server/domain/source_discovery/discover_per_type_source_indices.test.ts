/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import { getUpdatesEntitiesDataStreamName } from '../asset_manager/updates_data_stream';
import { discoverPerTypeSourceIndices } from './discover_per_type_source_indices';

const NAMESPACE = 'default';
const ALERTS_INDEX = '.alerts-security.alerts-default';

interface ResolvePartial {
  indices?: Array<{ name: string }>;
  aliases?: Array<{ name: string; indices: string | string[] }>;
  data_streams?: Array<{ name: string; backing_indices: string | string[] }>;
}

const buildEsClient = (resolve: ResolvePartial, fieldCaps: unknown): ElasticsearchClient =>
  ({
    indices: {
      resolveIndex: jest.fn().mockResolvedValue({
        indices: resolve.indices ?? [],
        aliases: resolve.aliases ?? [],
        data_streams: resolve.data_streams ?? [],
      }),
    },
    fieldCaps: jest.fn().mockResolvedValue(fieldCaps),
  } as unknown as ElasticsearchClient);

describe('discoverPerTypeSourceIndices', () => {
  const logger = loggerMock.create();

  beforeEach(() => jest.clearAllMocks());

  it('qualifies a logs data stream by its clean name when a backing index carries a keyword identity field', async () => {
    const dataStream = 'logs-okta.system-default';
    const backingIndex = '.ds-logs-okta.system-default-2024.01.01-000001';
    const esClient = buildEsClient(
      { data_streams: [{ name: dataStream, backing_indices: [backingIndex] }] },
      {
        indices: [backingIndex],
        fields: {
          'user.email': { keyword: { type: 'keyword', indices: [backingIndex] } },
        },
      }
    );

    const { sources, provenance } = await discoverPerTypeSourceIndices({
      esClient,
      namespace: NAMESPACE,
      logger,
    });

    // The clean data stream name, never the churning `.ds-…` backing index.
    expect(sources.user).toEqual([dataStream]);
    expect(sources.host).toEqual([]);
    expect(provenance).toContainEqual({
      entityType: 'user',
      sourceName: dataStream,
      matchedFields: ['user.email'],
    });
  });

  it('scopes both ES calls to `logs-*` + the alerts index and pushes the keyword type gate into field_caps', async () => {
    const esClient = buildEsClient({}, { indices: [], fields: {} });

    await discoverPerTypeSourceIndices({ esClient, namespace: NAMESPACE, logger });

    expect(esClient.indices.resolveIndex).toHaveBeenCalledWith(
      expect.objectContaining({ name: `logs-*,${ALERTS_INDEX}` })
    );
    expect(esClient.fieldCaps).toHaveBeenCalledWith(
      expect.objectContaining({
        index: ['logs-*', ALERTS_INDEX],
        types: ['keyword'],
        // Required for per-index presence: without it ES omits `indices` for
        // fields that are keyword wherever they exist, and discovery over-
        // qualifies every source for every entity type.
        include_unmapped: true,
      })
    );
  });

  it('falls back to all matched indices when a field has uniform keyword caps (no per-field indices)', async () => {
    const dataStream = 'logs-system.auth-default';
    const backingIndex = '.ds-logs-system.auth-default-2024.01.01-000001';
    const esClient = buildEsClient(
      { data_streams: [{ name: dataStream, backing_indices: [backingIndex] }] },
      {
        indices: [backingIndex],
        // No `indices` on the cap → uniform across all matched indices.
        fields: { 'host.name': { keyword: { type: 'keyword' } } },
      }
    );

    const { sources } = await discoverPerTypeSourceIndices({
      esClient,
      namespace: NAMESPACE,
      logger,
    });

    expect(sources.host).toEqual([dataStream]);
  });

  it('includes the alerts alias as a source, mapping its hidden backing index back to the alias name', async () => {
    const alertsBackingIndex = '.internal.alerts-security.alerts-default-000001';
    const esClient = buildEsClient(
      { aliases: [{ name: ALERTS_INDEX, indices: [alertsBackingIndex] }] },
      {
        indices: [alertsBackingIndex],
        fields: { 'user.name': { keyword: { type: 'keyword', indices: [alertsBackingIndex] } } },
      }
    );

    const { sources } = await discoverPerTypeSourceIndices({
      esClient,
      namespace: NAMESPACE,
      logger,
    });

    expect(sources.user).toEqual([ALERTS_INDEX]);
  });

  it('excludes the entity store updates data stream even if it carries identity fields', async () => {
    const updatesDataStream = getUpdatesEntitiesDataStreamName(NAMESPACE);
    const updatesBackingIndex = `.ds-${updatesDataStream}-2024.01.01-000001`;
    const esClient = buildEsClient(
      { data_streams: [{ name: updatesDataStream, backing_indices: [updatesBackingIndex] }] },
      {
        indices: [updatesBackingIndex],
        fields: { 'user.name': { keyword: { type: 'keyword', indices: [updatesBackingIndex] } } },
      }
    );

    const { sources, provenance } = await discoverPerTypeSourceIndices({
      esClient,
      namespace: NAMESPACE,
      logger,
    });

    expect(sources.user).toEqual([]);
    expect(provenance).toEqual([]);
  });

  it('qualifies a single source for multiple entity types', async () => {
    const dataStream = 'logs-endpoint.events-default';
    const backingIndex = '.ds-logs-endpoint.events-default-2024.01.01-000001';
    const esClient = buildEsClient(
      { data_streams: [{ name: dataStream, backing_indices: [backingIndex] }] },
      {
        indices: [backingIndex],
        fields: {
          'user.name': { keyword: { type: 'keyword', indices: [backingIndex] } },
          'host.name': { keyword: { type: 'keyword', indices: [backingIndex] } },
        },
      }
    );

    const { sources } = await discoverPerTypeSourceIndices({
      esClient,
      namespace: NAMESPACE,
      logger,
    });

    expect(sources.user).toEqual([dataStream]);
    expect(sources.host).toEqual([dataStream]);
    expect(sources.service).toEqual([]);
  });

  it('qualifies disjoint sources per entity type so engines do not all scan the same indices', async () => {
    // Regression for the `include_unmapped: false` bug: when each identity field is
    // keyword in only a subset of the scope, `field_caps` (with `include_unmapped:
    // true`) reports per-field `indices`, so each engine must qualify only the
    // sources that actually carry its identity fields — not every source.
    const userStream = 'logs-okta.system-default';
    const userBacking = '.ds-logs-okta.system-default-2024.01.01-000001';
    const genericStream = 'logs-entityanalytics_okta.entity-default';
    const genericBacking = '.ds-logs-entityanalytics_okta.entity-default-2024.01.01-000001';
    const serviceStream = 'logs-apm.service-default';
    const serviceBacking = '.ds-logs-apm.service-default-2024.01.01-000001';
    const endpointStream = 'logs-endpoint.events-default';
    const endpointBacking = '.ds-logs-endpoint.events-default-2024.01.01-000001';

    const esClient = buildEsClient(
      {
        data_streams: [
          { name: userStream, backing_indices: [userBacking] },
          { name: genericStream, backing_indices: [genericBacking] },
          { name: serviceStream, backing_indices: [serviceBacking] },
          { name: endpointStream, backing_indices: [endpointBacking] },
        ],
      },
      {
        indices: [userBacking, genericBacking, serviceBacking, endpointBacking],
        fields: {
          'user.name': { keyword: { type: 'keyword', indices: [userBacking, endpointBacking] } },
          'host.name': { keyword: { type: 'keyword', indices: [endpointBacking] } },
          'service.name': { keyword: { type: 'keyword', indices: [serviceBacking] } },
          'entity.id': { keyword: { type: 'keyword', indices: [genericBacking] } },
        },
      }
    );

    const { sources } = await discoverPerTypeSourceIndices({
      esClient,
      namespace: NAMESPACE,
      logger,
    });

    expect(sources.user).toEqual([userStream, endpointStream]);
    expect(sources.host).toEqual([endpointStream]);
    expect(sources.service).toEqual([serviceStream]);
    expect(sources.generic).toEqual([genericStream]);

    // The bug symptom was all four engines resolving to the identical full set.
    expect(sources.generic).not.toEqual(sources.service);
    expect(sources.generic).not.toEqual(sources.user);
    expect(sources.host).not.toEqual(sources.user);
  });

  it('returns empty sources (and logs a warning) when Elasticsearch fails', async () => {
    const esClient = {
      indices: { resolveIndex: jest.fn().mockRejectedValue(new Error('cluster down')) },
      fieldCaps: jest.fn().mockRejectedValue(new Error('cluster down')),
    } as unknown as ElasticsearchClient;

    const { sources, provenance } = await discoverPerTypeSourceIndices({
      esClient,
      namespace: NAMESPACE,
      logger,
    });

    expect(sources).toEqual({ user: [], host: [], service: [], generic: [] });
    expect(provenance).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});
