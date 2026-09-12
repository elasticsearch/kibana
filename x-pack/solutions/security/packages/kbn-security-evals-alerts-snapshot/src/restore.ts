/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { createGcsRepository, restoreSnapshot } from '@kbn/es-snapshot-loader';
import type { AlertsSnapshotConfig } from './config';

const INDEX_REFRESH_WAIT_MS = 3_000;

const ALERT_INDICES_TO_RESTORE_AND_OVERWRITE = [
  '.internal.alerts-security.alerts-default-*',
  'insights-alerts-*',
] as const;

const resolveIndicesByPattern = async (esClient: Client, pattern: string): Promise<string[]> => {
  try {
    const response = (await esClient.indices.get({
      index: pattern,
      expand_wildcards: 'all',
      ignore_unavailable: true,
      allow_no_indices: true,
    })) as unknown as Record<string, unknown>;
    return Object.keys(response);
  } catch {
    return [];
  }
};

const deleteExistingAlertIndices = async (esClient: Client, log: ToolingLog): Promise<void> => {
  log.info('Resolving existing alert indices to delete before restore...');
  const resolved = (
    await Promise.all(
      ALERT_INDICES_TO_RESTORE_AND_OVERWRITE.map((pattern) =>
        resolveIndicesByPattern(esClient, pattern)
      )
    )
  ).flat();
  const unique = [...new Set(resolved)];

  if (unique.length === 0) {
    log.info('No existing alert indices matched for deletion');
    return;
  }

  log.info(`Deleting ${unique.length} existing indices before restore`);
  await esClient.indices.delete({
    index: unique,
    ignore_unavailable: true,
    allow_no_indices: true,
  });
};

// Kibana's boot-time alerting init can recreate the Security Solution alert
// index between our delete and the restore's alias wiring. When it does, the
// restore surfaces one of two conflict shapes:
//   - "open index with same name already exists" (index recreated)
//   - "alias [...] has more than one write index" (recreated index + restored
//     backing index both claim the write alias)
// Both are the same boot race; both are cleared by delete + re-restore, which
// is safe because the init fires once per boot.
const isOpenIndexConflictError = (errors: string[]): boolean =>
  errors.some(
    (e) =>
      e.includes('open index with same name already exists in the cluster') ||
      e.includes('has more than one write index')
  );

/**
 * Restore the shared security-alerts snapshot from GCS into the local
 * Scout-managed ES cluster.
 *
 * Scout's Kibana boot eagerly creates the Security Solution alert index, so
 * we delete any matching indices before restore to avoid `restore` conflicts.
 * This is safe in the disposable eval cluster (and only there) — never call
 * this against a production cluster.
 *
 * If restore fails with an open-index conflict (rare race when the alert
 * index is recreated between the delete and the restore), we delete and
 * retry once before failing hard.
 */
export const restoreAlertsSnapshot = async ({
  esClient,
  log,
  config,
}: {
  esClient: Client;
  log: ToolingLog;
  config: AlertsSnapshotConfig;
}): Promise<void> => {
  const repository = createGcsRepository({
    bucket: config.bucket,
    basePath: config.basePath,
  });

  log.info(
    `Restoring alerts snapshot from gs://${config.bucket}/${config.basePath}${
      config.snapshotName ? ` (snapshot: ${config.snapshotName})` : ' (latest)'
    }`
  );

  try {
    await deleteExistingAlertIndices(esClient, log);
  } catch (err) {
    log.warning(
      `Failed to delete existing alert indices (continuing with restore attempt): ${String(err)}`
    );
  }

  let result = await restoreSnapshot({
    esClient,
    log,
    repository,
    snapshotName: config.snapshotName,
    indices: [...ALERT_INDICES_TO_RESTORE_AND_OVERWRITE],
  });

  if (!result.success && isOpenIndexConflictError(result.errors)) {
    log.warning('Snapshot restore failed due to existing indices. Retrying once after deletion.');
    await deleteExistingAlertIndices(esClient, log);
    result = await restoreSnapshot({
      esClient,
      log,
      repository,
      snapshotName: config.snapshotName,
      indices: [...ALERT_INDICES_TO_RESTORE_AND_OVERWRITE],
    });
  }

  if (!result.success) {
    throw new Error(`Snapshot restore failed: ${result.errors.join('; ')}`);
  }

  log.info(
    `Restored ${result.restoredIndices.length} indices: ${result.restoredIndices.join(', ')}`
  );

  log.debug('Waiting for restored indices to refresh');
  await new Promise((resolve) => setTimeout(resolve, INDEX_REFRESH_WAIT_MS));
  await esClient.indices.refresh({ index: '_all' });
};
