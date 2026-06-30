/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import { discoverPerTypeSourceIndices } from './discover_per_type_source_indices';
import type { DiscoveredPerTypeSources } from './identity_fields';
import {
  DISCOVERED_SOURCE_CACHE_TTL_MS,
  clearDiscoveredSourceCache,
  getCachedPerTypeSourceIndices,
} from './source_discovery_cache';

jest.mock('./discover_per_type_source_indices');
const mockDiscover = discoverPerTypeSourceIndices as jest.MockedFunction<
  typeof discoverPerTypeSourceIndices
>;

const esClient = {} as ElasticsearchClient;
const logger = loggerMock.create();

const sourcesNamed = (name: string): DiscoveredPerTypeSources => ({
  sources: { user: [name], host: [], service: [], generic: [] },
  provenance: [],
});

describe('getCachedPerTypeSourceIndices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDiscoveredSourceCache();
  });

  it('discovers once and serves later calls from cache within the TTL', async () => {
    mockDiscover.mockResolvedValue(sourcesNamed('logs-a'));
    let nowMs = 1_000;
    const now = () => nowMs;

    const first = await getCachedPerTypeSourceIndices({
      esClient,
      namespace: 'default',
      logger,
      now,
    });
    nowMs += DISCOVERED_SOURCE_CACHE_TTL_MS - 1;
    const second = await getCachedPerTypeSourceIndices({
      esClient,
      namespace: 'default',
      logger,
      now,
    });

    expect(first).toEqual(sourcesNamed('logs-a'));
    expect(second).toEqual(sourcesNamed('logs-a'));
    expect(mockDiscover).toHaveBeenCalledTimes(1);
  });

  it('re-discovers after the TTL expires', async () => {
    mockDiscover
      .mockResolvedValueOnce(sourcesNamed('logs-a'))
      .mockResolvedValueOnce(sourcesNamed('logs-b'));
    let nowMs = 1_000;
    const now = () => nowMs;

    await getCachedPerTypeSourceIndices({ esClient, namespace: 'default', logger, now });
    nowMs += DISCOVERED_SOURCE_CACHE_TTL_MS + 1;
    const second = await getCachedPerTypeSourceIndices({
      esClient,
      namespace: 'default',
      logger,
      now,
    });

    expect(second).toEqual(sourcesNamed('logs-b'));
    expect(mockDiscover).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent refreshes for the same namespace onto a single discovery', async () => {
    let resolveDiscovery: (value: DiscoveredPerTypeSources) => void = () => {};
    mockDiscover.mockReturnValue(
      new Promise<DiscoveredPerTypeSources>((resolve) => {
        resolveDiscovery = resolve;
      })
    );

    const inFlight = [
      getCachedPerTypeSourceIndices({ esClient, namespace: 'default', logger }),
      getCachedPerTypeSourceIndices({ esClient, namespace: 'default', logger }),
      getCachedPerTypeSourceIndices({ esClient, namespace: 'default', logger }),
    ];
    resolveDiscovery(sourcesNamed('logs-a'));
    const results = await Promise.all(inFlight);

    expect(mockDiscover).toHaveBeenCalledTimes(1);
    results.forEach((result) => expect(result).toEqual(sourcesNamed('logs-a')));
  });

  it('keeps independent cache entries per namespace', async () => {
    mockDiscover.mockImplementation(async ({ namespace }) => sourcesNamed(`logs-${namespace}`));

    const def = await getCachedPerTypeSourceIndices({ esClient, namespace: 'default', logger });
    const space = await getCachedPerTypeSourceIndices({ esClient, namespace: 'space-1', logger });

    expect(def.sources.user).toEqual(['logs-default']);
    expect(space.sources.user).toEqual(['logs-space-1']);
    expect(mockDiscover).toHaveBeenCalledTimes(2);
  });

  it('forces re-discovery after clearDiscoveredSourceCache', async () => {
    mockDiscover.mockResolvedValue(sourcesNamed('logs-a'));

    await getCachedPerTypeSourceIndices({ esClient, namespace: 'default', logger });
    clearDiscoveredSourceCache('default');
    await getCachedPerTypeSourceIndices({ esClient, namespace: 'default', logger });

    expect(mockDiscover).toHaveBeenCalledTimes(2);
  });
});
