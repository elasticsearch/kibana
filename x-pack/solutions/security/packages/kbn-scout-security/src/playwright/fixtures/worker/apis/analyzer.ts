/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ScoutLogger } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';

/**
 * Process name of the origin event. The detection rule query targets this name so exactly one
 * alert is generated (from the origin process), while its ancestors stay in the index purely to
 * let the resolver build the process tree.
 */
export const ANALYZER_ORIGIN_PROCESS_NAME = 'origin.exe' as const;

export interface AnalyzerFixture {
  /** Index containing the source process events; pass as the detection rule's target index. */
  sourceIndex: string;
}

export interface AnalyzerApiService {
  /**
   * Indexes an endpoint process tree (grandparent → parent → origin) so the analyzer/resolver can
   * render a multi-node graph for the resulting alert.
   *
   * The index name matches `logs-*` so it is part of the analyzer data view (which the resolver
   * queries for ancestors/descendants), while staying space-scoped to avoid parallel-worker
   * collisions. Entity ids are space-scoped so each worker's tree stays isolated even though the
   * resolver queries the broad `logs-*` pattern.
   */
  createAnalyzerFixture: (spaceId: string) => Promise<AnalyzerFixture>;
  /**
   * Deletes the source index created by `createAnalyzerFixture`.
   * Safe to call even if the index was never created (`ignore_unavailable: true`).
   * Call this unconditionally in `afterEach` so cleanup always runs, even when
   * `createAnalyzerFixture` throws partway through.
   */
  cleanupAnalyzerFixture: (spaceId: string) => Promise<void>;
}

const getSourceIndex = (spaceId: string) => `logs-scout.analyzer-${spaceId}`;

export const getAnalyzerApiService = ({
  esClient,
  log,
}: {
  esClient: EsClient;
  log: ScoutLogger;
}): AnalyzerApiService => {
  // The source index matches `logs-*`, so the Fleet index template auto-creates it as a data
  // stream. `indices.delete` silently ignores data streams, so we must delete the data stream
  // first, then fall back to a regular index delete.
  const deleteSourceIndex = async (sourceIndex: string) => {
    await esClient.indices.deleteDataStream({ name: sourceIndex }).catch(() => {});
    await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });
  };

  const service: AnalyzerApiService = {
    createAnalyzerFixture: async (spaceId) => {
      const sourceIndex = getSourceIndex(spaceId);

      await measurePerformanceAsync(log, 'security.analyzer.createAnalyzerFixture', async () => {
        // Remove stale data before creating fresh docs.
        await deleteSourceIndex(sourceIndex);

        const timestamp = new Date().toISOString();
        const agentId = `scout-analyzer-agent-${spaceId}`;
        const hostName = `scout-analyzer-host-${spaceId}`;

        // Space-scoped entity ids keep each worker's process tree isolated.
        const grandparentEntityId = `ga-${spaceId}`;
        const parentEntityId = `pa-${spaceId}`;
        const originEntityId = `or-${spaceId}`;

        const baseFields = {
          '@timestamp': timestamp,
          agent: { type: 'endpoint', id: agentId },
          host: { name: hostName },
          event: { category: ['process'], kind: 'event', type: ['start'], action: 'exec' },
        };

        // grandparent → parent → origin. `process.Ext.ancestry` lists ancestors closest-first,
        // matching the endpoint resolver schema.
        const documents = [
          {
            ...baseFields,
            process: {
              entity_id: grandparentEntityId,
              name: 'grandparent.exe',
              pid: 1000,
            },
          },
          {
            ...baseFields,
            process: {
              entity_id: parentEntityId,
              parent: { entity_id: grandparentEntityId },
              Ext: { ancestry: [grandparentEntityId] },
              name: 'parent.exe',
              pid: 1001,
            },
          },
          {
            ...baseFields,
            process: {
              entity_id: originEntityId,
              parent: { entity_id: parentEntityId },
              Ext: { ancestry: [parentEntityId, grandparentEntityId] },
              name: ANALYZER_ORIGIN_PROCESS_NAME,
              pid: 1002,
            },
          },
        ];

        const bulkResponse = await esClient.bulk({
          index: sourceIndex,
          refresh: true,
          operations: documents.flatMap((document) => [{ create: {} }, document]),
        });

        // `bulk` returns HTTP 200 even when individual items fail (e.g. a mapping conflict), which
        // would leave the resolver without data and surface later as a confusing UI assertion
        // failure. Fail fast here with the first item error instead.
        if (bulkResponse.errors) {
          const firstError = bulkResponse.items.find((item) => item.create?.error)?.create?.error;
          throw new Error(
            `Failed to index analyzer process tree into "${sourceIndex}": ${JSON.stringify(
              firstError
            )}`
          );
        }
      });

      return { sourceIndex };
    },

    cleanupAnalyzerFixture: async (spaceId) => {
      const sourceIndex = getSourceIndex(spaceId);
      await measurePerformanceAsync(log, 'security.analyzer.cleanupAnalyzerFixture', async () => {
        await deleteSourceIndex(sourceIndex);
      });
    },
  };

  return service;
};
