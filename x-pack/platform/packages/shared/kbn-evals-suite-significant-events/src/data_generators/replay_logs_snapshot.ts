/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { isNotFoundError, isResponseError } from '@kbn/es-errors';
import type { ToolingLog } from '@kbn/tooling-log';
import { createGcsRepository, replaySnapshot, TEMP_INDEX_PREFIX } from '@kbn/es-snapshot-loader';
import { deleteLogsIndexTemplate, ensureLogsIndexTemplate } from './logs_index_template';
import type { GcsConfig } from './snapshot_run_config';
import { resolveBasePath } from './snapshot_run_config';

const LOGS_STREAM_NAME = 'logs';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const isDataStreamDeleteConflict = (error: unknown): boolean => {
  if (!isResponseError(error) || error.statusCode !== 400) {
    return false;
  }

  const reason =
    typeof error.body?.error?.reason === 'string'
      ? error.body.error.reason
      : getErrorMessage(error);
  const message = reason.toLowerCase();
  return message.includes('data stream') && message.includes('cannot be deleted');
};

export async function replaySignificantEventsSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig
) {
  log.debug(`Replaying significant events data from snapshot: ${snapshotName}`);

  await cleanSignificantEventsDataStreams(esClient, log);
  await deleteStaleSnapshotLoaderIndices(esClient, log);
  await ensureLogsIndexTemplate(esClient, log);

  const basePath = resolveBasePath(gcs);
  await replaySnapshot({
    esClient,
    log,
    repository: createGcsRepository({ bucket: gcs.bucket, basePath }),
    snapshotName,
    patterns: [LOGS_STREAM_NAME],
  });
}

async function deleteStaleSnapshotLoaderIndices(esClient: Client, log: ToolingLog): Promise<void> {
  try {
    const resolved = await esClient.indices.get({
      index: `${TEMP_INDEX_PREFIX}*`,
      expand_wildcards: 'all',
      ignore_unavailable: true,
      allow_no_indices: true,
    });
    const staleIndices = Object.keys(resolved);
    if (staleIndices.length === 0) return;

    await esClient.indices.delete({
      index: staleIndices,
      expand_wildcards: 'all',
      ignore_unavailable: true,
    });
    log.debug(`Deleted ${staleIndices.length} stale snapshot-loader temp indices`);
  } catch (error) {
    log.warning(`Failed to delete stale snapshot-loader temp indices: ${getErrorMessage(error)}`);
  }
}

export async function cleanSignificantEventsDataStreams(
  esClient: Client,
  log: ToolingLog
): Promise<void> {
  const [deleteDataStreamResult, deleteIndexResult] = await Promise.allSettled([
    esClient.indices.deleteDataStream({ name: LOGS_STREAM_NAME }),
    esClient.indices.delete({ index: LOGS_STREAM_NAME, ignore_unavailable: true }),
  ]);

  if (
    deleteDataStreamResult.status === 'rejected' &&
    !isNotFoundError(deleteDataStreamResult.reason)
  ) {
    log.debug(
      `Failed to delete ${LOGS_STREAM_NAME} data stream: ${getErrorMessage(
        deleteDataStreamResult.reason
      )}`
    );
  }

  if (
    deleteIndexResult.status === 'rejected' &&
    !isNotFoundError(deleteIndexResult.reason) &&
    !isDataStreamDeleteConflict(deleteIndexResult.reason)
  ) {
    log.debug(
      `Failed to delete ${LOGS_STREAM_NAME} index: ${getErrorMessage(deleteIndexResult.reason)}`
    );
  }

  await deleteLogsIndexTemplate(esClient, log);
}
