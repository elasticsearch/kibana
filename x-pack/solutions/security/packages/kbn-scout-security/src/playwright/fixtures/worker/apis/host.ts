/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ScoutLogger } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';

/** Host name indexed by the host fixture and rendered as a clickable cell in the alerts table. */
export const HOST_NAME = 'scout-host' as const;

const getSourceIndex = (spaceId: string) => `scout-host-source-${spaceId}`;

export interface HostFixture {
  /** Index containing the source event; pass as the detection rule's target index. */
  sourceIndex: string;
}

export interface HostApiService {
  /**
   * Indexes a source document containing `host.name` so that field renders as a clickable
   * host-details cell in the alerts table (the entry point to the host entity flyout).
   *
   * Index naming is space-scoped so parallel workers never collide.
   */
  createHostFixture: (spaceId: string) => Promise<HostFixture>;
  /**
   * Deletes the source index created by `createHostFixture`.
   * Safe to call even if the index was never created.
   */
  cleanupHostFixture: (spaceId: string) => Promise<void>;
}

export const getHostApiService = ({
  esClient,
  log,
}: {
  esClient: EsClient;
  log: ScoutLogger;
}): HostApiService => ({
  createHostFixture: async (spaceId) => {
    const sourceIndex = getSourceIndex(spaceId);

    await measurePerformanceAsync(log, 'security.host.createHostFixture', async () => {
      await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });

      await esClient.index({
        index: sourceIndex,
        document: {
          '@timestamp': new Date().toISOString(),
          host: { name: HOST_NAME },
          event: { kind: 'event' },
        },
        refresh: true,
      });
    });

    return { sourceIndex };
  },

  cleanupHostFixture: async (spaceId) => {
    const sourceIndex = getSourceIndex(spaceId);
    await measurePerformanceAsync(log, 'security.host.cleanupHostFixture', async () => {
      await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });
    });
  },
});
