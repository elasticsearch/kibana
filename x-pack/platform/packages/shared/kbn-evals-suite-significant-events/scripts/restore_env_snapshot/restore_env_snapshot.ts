/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { ToolingLog } from '@kbn/tooling-log';
import { Client, errors } from '@elastic/elasticsearch';
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { LoadResult } from '@kbn/es-snapshot-loader';
import { createGcsRepository, replaySnapshot, restoreSnapshot } from '@kbn/es-snapshot-loader';
import type { ConnectionConfig } from '../lib/get_connection_config';
import { getConnectionConfig } from '../lib/get_connection_config';
import { GCS_BUCKET, KNOWLEDGE_INDICATORS_DATA_STREAM } from '../lib/constants';
import {
  ensureCleanEnvironment,
  ensureKnownAliases,
  ensureStreamsEnabled,
  getEnabledStreams,
  parseCommonSnapshotFlags,
  toSnapshotName,
} from '../lib/snapshot_utils';
import { promoteQueries, resetQueriesPromotion } from '../lib/significant_events_workflow';
import { withTempSuperuser } from '../lib/user_utils';

const SIGEVENTS_INDEX_TEMPLATE = 'sigevents-logs-template';

async function extractMappingFromTempIndex(
  esClient: Client,
  log: ToolingLog,
  tempIndex: string
): Promise<MappingTypeMapping | undefined> {
  try {
    const response = await esClient.indices.getMapping({ index: tempIndex });
    const mapping = response[tempIndex]?.mappings;
    if (mapping) {
      log.info(`Extracted mapping from "${tempIndex}"`);
    }
    return mapping;
  } catch (err) {
    log.warning(
      `Failed to extract mapping from "${tempIndex}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  }
}

async function repromoteQueries({
  esClient,
  log,
  config,
}: {
  esClient: Client;
  log: ToolingLog;
  config: ConnectionConfig;
}): Promise<void> {
  log.debug('Resetting query promotion state...');
  await resetQueriesPromotion({ esClient });
  log.debug('Repromoting queries...');
  await promoteQueries(config);
}

async function restoreKiDataStream({
  esClient,
  log,
  repository,
  snapshotName,
}: {
  esClient: Client;
  log: ToolingLog;
  repository: ReturnType<typeof createGcsRepository>;
  snapshotName: string;
}): Promise<string> {
  const snapshotIndex = toSnapshotName(KNOWLEDGE_INDICATORS_DATA_STREAM);
  const tempIndex = `restore-temp-ki-${randomUUID()}`;

  try {
    const restoreResult = await restoreSnapshot({
      esClient,
      log,
      repository,
      snapshotName,
      indices: [snapshotIndex],
      renamePattern: '(.+)',
      renameReplacement: tempIndex,
      allowNoMatches: true, // old snapshots predate KI capture
    });

    if (!restoreResult.success) {
      throw new Error(
        `Failed to restore KI data stream from snapshot "${snapshotName}": ${restoreResult.errors.join(
          '; '
        )}`
      );
    }

    if (restoreResult.restoredIndices.length === 0) {
      log.info(`KI store not in snapshot "${snapshotName}" — skipping (old snapshot).`);
      return 'skipped (not in snapshot)';
    }

    // Reindex into the data-stream name. ES auto-creates the data stream from the
    // streams-owned template; reindex into a data-stream dest uses op_type: create.
    const reindexResult = await esClient.reindex({
      wait_for_completion: true,
      source: { index: tempIndex },
      dest: { index: KNOWLEDGE_INDICATORS_DATA_STREAM, op_type: 'create' },
    });

    if ((reindexResult.version_conflicts ?? 0) > 0) {
      log.warning(
        `KI data stream restore had ${reindexResult.version_conflicts} version conflicts — some documents may have been skipped.`
      );
    }

    const created = reindexResult.created ?? 0;
    log.info(`Restored KI data stream "${KNOWLEDGE_INDICATORS_DATA_STREAM}" (${created} docs)`);
    return `restored (${created} docs)`;
  } finally {
    await esClient.indices.delete({ index: tempIndex, ignore_unavailable: true }).catch(() => {
      log.debug(`Failed to delete temp KI index "${tempIndex}"`);
    });
  }
}

async function ensureLogsIndexTemplate({
  esClient,
  log,
  streamName,
  mappings,
}: {
  esClient: Client;
  log: ToolingLog;
  streamName: string;
  mappings?: MappingTypeMapping;
}): Promise<void> {
  log.info(`Creating temporary index template "${SIGEVENTS_INDEX_TEMPLATE}" for "${streamName}"`);

  await esClient.indices.putIndexTemplate({
    name: SIGEVENTS_INDEX_TEMPLATE,
    index_patterns: [streamName],
    data_stream: {},
    template: {
      settings: {
        index: {
          mapping: { ignore_malformed: true },
        },
      },
      mappings: mappings ?? { subobjects: false },
    },
    priority: 501,
  });
}

async function deleteLogsIndexTemplate({
  esClient,
  log,
}: {
  esClient: Client;
  log: ToolingLog;
}): Promise<void> {
  try {
    await esClient.indices.getIndexTemplate({
      name: SIGEVENTS_INDEX_TEMPLATE,
    });
  } catch (err) {
    if (err instanceof errors.ResponseError && err.statusCode === 404) {
      log.debug(`Index template "${SIGEVENTS_INDEX_TEMPLATE}" not found`);
      return;
    }
    throw err;
  }

  try {
    await esClient.indices.deleteIndexTemplate({ name: SIGEVENTS_INDEX_TEMPLATE });
    log.debug(`Deleted temporary index template "${SIGEVENTS_INDEX_TEMPLATE}"`);
  } catch (err) {
    log.warning(
      `Failed to delete temporary index template "${SIGEVENTS_INDEX_TEMPLATE}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

export const restoreEnvSnapshot = async ({
  log,
  flags,
}: {
  log: ToolingLog;
  flags: Record<string, unknown>;
}): Promise<void> => {
  const config = await getConnectionConfig(flags, log);
  const esClient = new Client({
    node: config.esUrl,
    auth: { username: config.username, password: config.password },
  });

  const gcsBucket = String(flags['gcs-bucket'] || GCS_BUCKET);
  const gcsBasePath = String(flags['gcs-base-path'] || '');
  if (!gcsBasePath) {
    throw new Error('Required: --gcs-base-path <path>');
  }

  const clean = Boolean(flags.clean);
  const { snapshotName, systemIndices, alertIndices, logsIndex } = parseCommonSnapshotFlags(flags);

  log.info(`Restore: ${snapshotName} | ES: ${config.esUrl} | Kibana: ${config.kibanaUrl}`);
  log.info(`GCS bucket: ${gcsBucket} | Base path: ${gcsBasePath}`);
  log.info(`Data indices: ${[logsIndex, ...alertIndices].join(', ')}`);
  log.info(`System indices: ${systemIndices.join(', ')}`);

  const repository = createGcsRepository({ bucket: gcsBucket, basePath: gcsBasePath });

  await withTempSuperuser(esClient, log, config, async (sysClient) => {
    await ensureCleanEnvironment({
      esClient: sysClient,
      log,
      systemIndices: [...systemIndices, KNOWLEDGE_INDICATORS_DATA_STREAM],
      alertIndices,
      logsIndex,
      clean,
    });

    // Plain `.kibana` system indices are captured as snapshot-* via reindex
    // (e.g. .kibana_streams_tasks → snapshot-kibana_streams_tasks) so we match the
    // snapshot-* names and rename them back on restore. The KI data stream is NOT here —
    // it is re-materialized as a data stream after streams is enabled (Step 3b).
    const snapshotSystemIndices = systemIndices.map(toSnapshotName);

    log.info('');
    log.info('Step 1/7 — Restoring system indices (with rename snapshot-* → .*)...');
    // restoreSnapshot and replaySnapshot use the caller's esClient intentionally:
    // the snapshot/replay APIs work with the caller's privileges, and keeping them
    // outside sysClient avoids creating the temp superuser a second time.
    // No allowNoMatches here — these plain system indices must be present; a genuinely
    // missing one should fail loudly rather than restore an incomplete environment.
    const restoreResult = await restoreSnapshot({
      esClient,
      log,
      repository,
      snapshotName,
      indices: snapshotSystemIndices,
      renamePattern: 'snapshot-(.*)',
      renameReplacement: '.$1',
    });

    if (!restoreResult.success) {
      throw new Error(
        `Failed to restore system indices from snapshot "${snapshotName}": ${restoreResult.errors.join(
          '; '
        )}`
      );
    }

    log.info('');
    log.info('Step 2/7 — Ensuring system-index aliases...');
    await ensureKnownAliases({
      esClient: sysClient,
      log,
      systemIndices,
      alertIndices: [],
    });

    log.info('');
    log.info('Step 3/7 — Enabling streams...');
    await ensureStreamsEnabled(config, log);

    log.info('');
    log.info('Step 4/7 — Restoring KI data stream (reindex into data stream)...');
    const kiRestoreStatus = await restoreKiDataStream({ esClient, log, repository, snapshotName });

    const enabledStreams = await getEnabledStreams(esClient, log);
    const enabledStreamsSet = new Set(enabledStreams);
    const isManagedByStreams = (index: string) =>
      enabledStreamsSet.has(index) || enabledStreams.some((s) => index.startsWith(`${s}.`));

    const dataIndexPatterns = [logsIndex, ...alertIndices];
    let replayResult: LoadResult;

    try {
      log.info('');
      log.info('Step 5/7 — Replaying data indices (with timestamp transformation)...');

      replayResult = await replaySnapshot({
        esClient, // caller's client — see comment at Step 1/7
        log,
        repository,
        snapshotName,
        patterns: dataIndexPatterns,
        shouldUseInlineScript: isManagedByStreams,
        async beforeReindex({ esClient: client, log: logger, restoredIndices }) {
          if (isManagedByStreams(logsIndex)) {
            return;
          }

          const tempIndex = restoredIndices.find((name) => name.includes(logsIndex));
          const mapping = tempIndex
            ? await extractMappingFromTempIndex(client, logger, tempIndex)
            : undefined;

          await ensureLogsIndexTemplate({
            esClient: client,
            log: logger,
            streamName: logsIndex,
            mappings: mapping,
          });
        },
      });
    } finally {
      log.info('');
      log.info('Cleaning up temporary index templates...');
      await deleteLogsIndexTemplate({ esClient, log });
    }

    if (!replayResult.success) {
      throw new Error(
        `Failed to replay data indices from snapshot "${snapshotName}": ${replayResult.errors.join(
          '; '
        )}`
      );
    }

    log.info('');
    log.info('Step 6/7 — Ensuring alert-index aliases...');
    await ensureKnownAliases({ esClient: sysClient, log, systemIndices: [], alertIndices });

    log.info('');
    log.info('Step 7/7 — Repromoting queries...');
    await repromoteQueries({ esClient: sysClient, log, config });

    log.info('');
    log.info('='.repeat(70));
    log.info('RESTORE COMPLETE');
    log.info('='.repeat(70));
    log.info(`Snapshot: ${snapshotName}`);
    log.info(`Restored system indices: ${restoreResult.restoredIndices.join(', ')}`);
    log.info(`KI data stream: ${kiRestoreStatus}`);
    log.info(`Replayed data indices: ${replayResult.restoredIndices.join(', ')}`);
  });
};
