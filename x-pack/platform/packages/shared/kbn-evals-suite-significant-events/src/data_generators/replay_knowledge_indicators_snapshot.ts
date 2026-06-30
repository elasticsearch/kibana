/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { createGcsRepository, restoreSnapshot } from '@kbn/es-snapshot-loader';
import type { GcsConfig } from './snapshot_run_config';
import { resolveBasePath } from './snapshot_run_config';
import {
  getSnapshotKnowledgeIndicatorsIndex,
  KNOWLEDGE_INDICATORS_DATA_STREAM,
} from './snapshot_indices';

const REINDEX_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
// Generous TTL so replayed KIs aren't filtered out by the reader's `expires_at >= NOW()` gate
// during the eval run.
const TTL_MILLIS = 30 * 24 * 60 * 60 * 1000;

const KI_REPLAY_SCRIPT = `
  // Reset the _id field to null to avoid conflicts with subsequent reindex operations
  ctx._id = null;
  Instant now = Instant.ofEpochMilli(System.currentTimeMillis());
  ctx._source['@timestamp'] = now.toString();
  ctx._source['expires_at'] = now.plusMillis(params.ttl_millis).toString();
  // skip semantic search;
  ctx._source.remove('search_embedding');
`;

export interface KnowledgeIndicatorReplayStats {
  total: number;
  created: number;
}

export async function replayKnowledgeIndicatorsSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig
): Promise<KnowledgeIndicatorReplayStats> {
  const basePath = resolveBasePath(gcs);
  const repository = createGcsRepository({ bucket: gcs.bucket, basePath });
  const snapshotIndex = getSnapshotKnowledgeIndicatorsIndex(snapshotName);
  const tempIndex = `sigevents-replay-temp-knowledge-indicators-${randomUUID()}`;

  try {
    await esClient.indices.delete({ index: tempIndex, ignore_unavailable: true });

    const restoreResult = await restoreSnapshot({
      esClient,
      log,
      repository,
      snapshotName,
      indices: [snapshotIndex],
      renamePattern: '(.+)',
      renameReplacement: tempIndex,
      allowNoMatches: true,
    });

    if (!restoreResult.success) {
      throw new Error(
        `Failed to restore KI snapshot "${snapshotName}": ${restoreResult.errors.join('; ')}`
      );
    }

    if (!restoreResult.restoredIndices.includes(tempIndex)) {
      log.info(
        `No knowledge-indicators index in snapshot "${snapshotName}" — skipping KI replay (older snapshot?)`
      );
      return { total: 0, created: 0 };
    }

    const reindexResult = await esClient.reindex(
      {
        wait_for_completion: true,
        source: { index: tempIndex },
        dest: { index: KNOWLEDGE_INDICATORS_DATA_STREAM, op_type: 'create' },
        script: { lang: 'painless', source: KI_REPLAY_SCRIPT, params: { ttl_millis: TTL_MILLIS } },
      },
      { requestTimeout: REINDEX_REQUEST_TIMEOUT_MS }
    );

    await esClient.indices.refresh({ index: KNOWLEDGE_INDICATORS_DATA_STREAM });

    const stats = { total: reindexResult.total ?? 0, created: reindexResult.created ?? 0 };
    log.info(
      `Replayed ${stats.created}/${stats.total} knowledge indicators into ${KNOWLEDGE_INDICATORS_DATA_STREAM}`
    );
    return stats;
  } finally {
    try {
      await esClient.indices.delete({ index: tempIndex, ignore_unavailable: true });
    } catch {
      log.debug('Failed to delete temp knowledge-indicators replay index');
    }
  }
}
