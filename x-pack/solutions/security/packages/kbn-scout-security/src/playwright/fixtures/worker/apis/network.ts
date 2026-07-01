/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ScoutLogger } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';

/** IP address indexed by the network fixture and rendered as a clickable cell in the alerts table. */
export const NETWORK_SOURCE_IP = '1.2.3.4' as const;

export interface NetworkFixture {
  /** Index containing the source event; pass as the detection rule's target index. */
  sourceIndex: string;
}

export interface NetworkApiService {
  /**
   * Indexes a source document containing `source.ip` so that field renders as a clickable
   * network-details cell in the alerts table (the entry point to the network flyout).
   *
   * Index naming is space-scoped so parallel workers never collide.
   */
  createNetworkFixture: (spaceId: string) => Promise<NetworkFixture>;
  /**
   * Deletes the source index created by `createNetworkFixture`.
   * Safe to call even if the index was never created.
   */
  cleanupNetworkFixture: (spaceId: string) => Promise<void>;
}

const getSourceIndex = (spaceId: string) => `scout-network-source-${spaceId}`;

export const getNetworkApiService = ({
  esClient,
  log,
}: {
  esClient: EsClient;
  log: ScoutLogger;
}): NetworkApiService => ({
  createNetworkFixture: async (spaceId) => {
    const sourceIndex = getSourceIndex(spaceId);

    await measurePerformanceAsync(log, 'security.network.createNetworkFixture', async () => {
      await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });

      await esClient.index({
        index: sourceIndex,
        document: {
          '@timestamp': new Date().toISOString(),
          source: { ip: NETWORK_SOURCE_IP },
          event: { kind: 'event' },
        },
        refresh: true,
      });
    });

    return { sourceIndex };
  },

  cleanupNetworkFixture: async (spaceId) => {
    const sourceIndex = getSourceIndex(spaceId);
    await measurePerformanceAsync(log, 'security.network.cleanupNetworkFixture', async () => {
      await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });
    });
  },
});
