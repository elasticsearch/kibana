/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { Client } from '@elastic/elasticsearch';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { ToolingLog } from '@kbn/tooling-log';
import { createGcsRepository, restoreSnapshot } from '@kbn/es-snapshot-loader';
import type { Detection, Discovery, Feature } from '@kbn/significant-events-schema';
import type { GcsConfig } from './snapshot_run_config';
import { resolveBasePath } from './snapshot_run_config';
import {
  getSnapshotKIFeaturesIndex,
  getSnapshotDiscoveriesIndex,
  getSnapshotDetectionsIndex,
  getSnapshotKnowledgeIndicatorsIndex,
} from './snapshot_indices';
import { DEFAULT_LOGS_INDEX } from '../constants';

/**
 * Raw query knowledge-indicator doc as captured from the KI data stream. Carries
 * `query.rule_id`, which the investigator/judge match against `detection.rule_uuid`.
 */
export interface SnapshotQueryKi {
  id?: string;
  type?: string;
  query?: { rule_id?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * The full knowledge-indicator set fed to the discovery agents: KI features (flattened from the
 * features API) plus query KIs (raw from the KI data stream). Heterogeneous by design — the agents
 * filter it in-memory via `search_knowledge_indicators`.
 */
export type SnapshotKnowledgeIndicator = Feature | SnapshotQueryKi;

const SEARCH_LIMIT = 1000;

/**
 * Restores a sigevents-captured snapshot index into a throwaway temp index and returns its
 * documents. Shared by the KI-features / discoveries / detections loaders, which differ only
 * in the source index, the temp-index prefix, an optional query filter, and the log label.
 *
 * `allowNoMatches` makes a missing index return `[]` (old snapshots). The temp index is
 * always cleaned up, even if the search throws.
 */
async function loadDocsFromSnapshot<T>({
  esClient,
  log,
  snapshotName,
  gcs,
  index,
  tempIndexPrefix,
  label,
  query,
}: {
  esClient: Client;
  log: ToolingLog;
  snapshotName: string;
  gcs: GcsConfig;
  index: string;
  tempIndexPrefix: string;
  label: string;
  query?: QueryDslQueryContainer;
}): Promise<T[]> {
  const basePath = resolveBasePath(gcs);
  const repository = createGcsRepository({ bucket: gcs.bucket, basePath });
  const tempIndex = `${tempIndexPrefix}-${randomUUID()}`;

  try {
    await esClient.indices.delete({ index: tempIndex, ignore_unavailable: true });

    const restoreResult = await restoreSnapshot({
      esClient,
      log,
      repository,
      snapshotName,
      indices: [index],
      renamePattern: '(.+)',
      renameReplacement: tempIndex,
      allowNoMatches: true,
    });

    if (!restoreResult.success) {
      throw new Error(
        `Failed to restore snapshot "${snapshotName}": ${restoreResult.errors.join('; ')}`
      );
    }

    if (restoreResult.restoredIndices.length === 0) {
      return [];
    }

    if (!restoreResult.restoredIndices.includes(tempIndex)) {
      throw new Error(
        `Snapshot "${snapshotName}" restore did not produce expected temp index "${tempIndex}". ` +
          `Restored indices: ${restoreResult.restoredIndices.join(', ')}`
      );
    }

    const searchResult = await esClient.search<Record<string, unknown>>({
      index: tempIndex,
      size: SEARCH_LIMIT,
      track_total_hits: true,
      ...(query ? { query } : {}),
    });

    const total =
      typeof searchResult.hits.total === 'number'
        ? searchResult.hits.total
        : searchResult.hits.total?.value ?? 0;
    if (total > SEARCH_LIMIT) {
      throw new Error(
        `${label}: ${total} docs in snapshot "${snapshotName}" exceed the load limit of ${SEARCH_LIMIT}; ` +
          `the result would be truncated. Add pagination before loading.`
      );
    }

    const docs = searchResult.hits.hits.map((hit) => hit._source as T).filter(Boolean) as T[];

    log.info(
      `Loaded ${docs.length} ${label} from snapshot "${snapshotName}" (search limit: ${SEARCH_LIMIT})`
    );
    return docs;
  } finally {
    try {
      await esClient.indices.delete({ index: tempIndex, ignore_unavailable: true });
    } catch {
      log.debug(`Failed to delete temp ${label} index`);
    }
  }
}

/**
 * Restores sigevents-captured KI features for the given stream and returns all
 * {@link Feature} documents.
 */
export async function loadKIFeaturesFromSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig,
  streamName: string = DEFAULT_LOGS_INDEX
): Promise<Feature[]> {
  return loadDocsFromSnapshot<Feature>({
    esClient,
    log,
    snapshotName,
    gcs,
    index: getSnapshotKIFeaturesIndex(snapshotName),
    tempIndexPrefix: 'sigevents-replay-temp-features',
    label: 'KI feature(s)',
    query: { term: { stream_name: streamName } },
  });
}

/**
 * Restores the sigevents-captured raw knowledge-indicators index (features + queries together, in
 * KI data-stream doc shape) and returns the docs. The capture is already per-stream, so no stream
 * filter is needed. Used for inspection/parity.
 */
export async function loadKnowledgeIndicatorsFromSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig
): Promise<SnapshotKnowledgeIndicator[]> {
  return loadDocsFromSnapshot<SnapshotKnowledgeIndicator>({
    esClient,
    log,
    snapshotName,
    gcs,
    index: getSnapshotKnowledgeIndicatorsIndex(snapshotName),
    tempIndexPrefix: 'sigevents-replay-temp-knowledge-indicators',
    label: 'knowledge indicator(s)',
  });
}

/**
 * Restores sigevents-captured discovery documents and returns all {@link Discovery} documents.
 */
export async function loadDiscoveriesFromSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig
): Promise<Discovery[]> {
  return loadDocsFromSnapshot<Discovery>({
    esClient,
    log,
    snapshotName,
    gcs,
    index: getSnapshotDiscoveriesIndex(snapshotName),
    tempIndexPrefix: 'sigevents-replay-temp-discoveries',
    label: 'discovery document(s)',
  });
}

/**
 * Restores sigevents-captured detection {@link Detection} documents .
 */
export async function loadDetectionsFromSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig,
  options: { kinds?: Array<Detection['kind']> } = {}
): Promise<Detection[]> {
  return loadDocsFromSnapshot<Detection>({
    esClient,
    log,
    snapshotName,
    gcs,
    index: getSnapshotDetectionsIndex(snapshotName),
    tempIndexPrefix: 'sigevents-replay-temp-detections',
    label: 'detection document(s)',
    query:
      options.kinds && options.kinds.length > 0 ? { terms: { kind: options.kinds } } : undefined,
  });
}
