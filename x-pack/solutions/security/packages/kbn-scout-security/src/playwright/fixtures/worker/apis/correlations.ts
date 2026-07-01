/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ScoutLogger } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';

export interface CorrelationsFixture {
  /** Index containing the source events; pass as the detection rule's target index. */
  sourceIndex: string;
}

export interface CorrelationsApiService {
  /**
   * Indexes a source document giving the detection rule enough material to trigger:
   *   - "Related alerts by session" (process.entry_leader.entity_id)
   *   - "Related alerts by source event" (always present for alert documents)*
   */
  createCorrelationsFixture: (spaceId: string) => Promise<CorrelationsFixture>;
  /**
   * Deletes the source index created by `createCorrelationsFixture`.
   * Safe to call even if the index was never created.
   */
  cleanupCorrelationsFixture: (spaceId: string) => Promise<void>;
}

export const getCorrelationsApiService = ({
  esClient,
  log,
}: {
  esClient: EsClient;
  log: ScoutLogger;
}): CorrelationsApiService => {
  const service: CorrelationsApiService = {
    createCorrelationsFixture: async (spaceId) => {
      const sourceIndex = `scout-correlations-source-${spaceId}`;

      await measurePerformanceAsync(
        log,
        'security.correlations.createCorrelationsFixture',
        async () => {
          // Remove stale data before creating fresh docs.
          await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });

          const sourceDoc = {
            '@timestamp': new Date().toISOString(),
            process: {
              // Required for "Related alerts by session" section:
              //   useShowRelatedAlertsBySession checks process.entry_leader.entity_id != null
              entry_leader: { entity_id: `scout-entry-leader-${spaceId}` },
            },
            event: { kind: 'event' },
          };

          await esClient.index({ index: sourceIndex, document: sourceDoc, refresh: true });
        }
      );

      return { sourceIndex };
    },

    cleanupCorrelationsFixture: async (spaceId) => {
      const sourceIndex = `scout-correlations-source-${spaceId}`;
      await measurePerformanceAsync(
        log,
        'security.correlations.cleanupCorrelationsFixture',
        async () => {
          await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });
        }
      );
    },
  };

  return service;
};
