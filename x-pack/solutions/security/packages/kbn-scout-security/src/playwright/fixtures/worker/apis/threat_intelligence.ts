/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ScoutLogger } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';

/** Threat feed name written by the indicator fixture; asserted by the TI/IOC specs. */
export const THREAT_FEED_NAME = 'Scout Test Feed' as const;

export interface FileIndicatorFixture {
  /** Index containing the source event; pass as a detection rule's target index for enrichment. */
  sourceIndex: string;
  /** Index the threat indicator was written to. */
  indicatorIndex: string;
  /** Unique indicator name (also the file sha256); use it to filter the indicators table. */
  indicatorName: string;
}

// Index the source event is written to (a plain index, not part of the threat pattern).
const sourceIndexName = (spaceId: string) => `scout-ti-source-${spaceId}`;
// Index the threat indicator is written to. Matches `logs-ti_*` (the default threat index
// pattern) so both investigation-time enrichment and the indicators table pick it up. Scoped
// per space so parallel workers never collide with each other or pre-existing cluster data.
const indicatorIndexName = (spaceId: string) => `logs-ti_scout_${spaceId}`;

export interface ThreatIntelligenceApiService {
  /**
   * Indexes a source event document with `file.hash.sha256` into the given index.
   * Use this to create a document that a detection rule can match, so the resulting
   * alert inherits the hash field for investigation-time enrichment.
   */
  indexSourceEvent: (options: { index: string; sha256: string }) => Promise<void>;
  /**
   * Indexes a single, fully-populated file threat indicator into the given index. Sets every
   * field the indicators table and IOC flyout render (name, name_origin, type, file hashes,
   * feed, first/last seen, TLP marking, confidence) as well as the `file.hash.sha256` that
   * investigation-time enrichment matches against. The indicator name is the sha256.
   *
   * The index should match `logs-ti_*` (the default threat index pattern).
   */
  indexFileIndicator: (options: { index: string; sha256: string }) => Promise<void>;
  /**
   * Deletes one or more indices, ignoring missing ones. Use in teardown to clean up
   * test-only indices created by the methods above.
   */
  deleteIndices: (indices: string[]) => Promise<void>;
  /**
   * Creates a space-isolated source event and a matching, uniquely-named file indicator. Returns
   * everything either consumer needs:
   *  - `sourceIndex` — target it from a detection rule so the resulting alert enriches against the
   *    indicator (investigation-time threat intelligence).
   *  - `indicatorName` — filter the indicators table down to this single indicator. The table is
   *    NOT space-scoped (it queries the global `logs-ti_*` pattern), so isolation relies on the
   *    unique name rather than the Kibana space.
   */
  createFileIndicatorFixture: (spaceId: string) => Promise<FileIndicatorFixture>;
  /**
   * Deletes the source and indicator indices created by `createFileIndicatorFixture`.
   * Safe to call even if the indices were never created (`ignore_unavailable: true`).
   * Call this unconditionally in `afterEach` so cleanup always runs, even when
   * `createFileIndicatorFixture` throws partway through.
   */
  cleanupFileIndicatorFixture: (spaceId: string) => Promise<void>;
}

export const getThreatIntelligenceApiService = ({
  esClient,
  log,
}: {
  esClient: EsClient;
  log: ScoutLogger;
}): ThreatIntelligenceApiService => {
  const service: ThreatIntelligenceApiService = {
    indexSourceEvent: async ({ index, sha256 }) => {
      await measurePerformanceAsync(
        log,
        'security.threatIntelligence.indexSourceEvent',
        async () => {
          await esClient.index({
            index,
            document: {
              '@timestamp': new Date().toISOString(),
              file: { hash: { sha256 } },
            },
            refresh: true,
          });
        }
      );
    },

    indexFileIndicator: async ({ index, sha256 }) => {
      await measurePerformanceAsync(
        log,
        'security.threatIntelligence.indexFileIndicator',
        async () => {
          const now = new Date().toISOString();
          const indexResponse = await esClient.index({
            index,
            document: {
              '@timestamp': now,
              event: { kind: 'enrichment', category: 'threat', type: 'indicator' },
              threat: {
                feed: { name: THREAT_FEED_NAME },
                indicator: {
                  type: 'file',
                  // `name` is what the table column and flyout title display; `name_origin`
                  // tells the UI which field it was derived from. Use the sha256 as the name
                  // so the value is consistent across the table and the flyout.
                  name: sha256,
                  name_origin: 'threat.indicator.file.hash.sha256',
                  file: {
                    hash: {
                      sha256,
                      md5: `${sha256}-md5`,
                      sha1: `${sha256}-sha1`,
                    },
                  },
                  first_seen: now,
                  last_seen: now,
                  confidence: 'High',
                  marking: { tlp: 'RED' },
                },
              },
            },
            refresh: true,
          });

          // Guardrail: the indicators table and IOC flyout render nothing if the doc never landed.
          if (indexResponse.result !== 'created') {
            throw new Error(
              `Failed to index threat indicator "${sha256}" into "${index}": unexpected index result "${indexResponse.result}"`
            );
          }
        }
      );
    },

    deleteIndices: async (indices) => {
      await measurePerformanceAsync(log, 'security.threatIntelligence.deleteIndices', async () => {
        // Indices matching logs-* are auto-created as data streams by the Fleet index
        // template. Data streams are silently ignored by indices.delete, so we attempt
        // a data stream deletion first, then fall back to regular index deletion.
        await esClient.indices.deleteDataStream({ name: indices }).catch(() => {});
        await esClient.indices.delete({ index: indices, ignore_unavailable: true });
      });
    },

    createFileIndicatorFixture: async (spaceId) => {
      const sourceIndex = sourceIndexName(spaceId);
      const indicatorIndex = indicatorIndexName(spaceId);
      // The sha256 doubles as the indicator name. Unique per worker so the (globally-scoped)
      // indicators table can be filtered down to this single indicator.
      const indicatorName = `scout-ioc-${spaceId}-${Date.now()}`;

      // Delete before creating so stale documents from a crashed prior run don't accumulate.
      await service.deleteIndices([sourceIndex, indicatorIndex]);
      await service.indexSourceEvent({ index: sourceIndex, sha256: indicatorName });
      await service.indexFileIndicator({ index: indicatorIndex, sha256: indicatorName });

      return { sourceIndex, indicatorIndex, indicatorName };
    },

    cleanupFileIndicatorFixture: async (spaceId) => {
      await service.deleteIndices([sourceIndexName(spaceId), indicatorIndexName(spaceId)]);
    },
  };

  return service;
};
