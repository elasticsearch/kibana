/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { isNotFoundError } from '@kbn/es-errors';
import type { ToolingLog } from '@kbn/tooling-log';
import { createGcsRepository } from '@kbn/es-snapshot-loader';
import type { GcsConfig } from './snapshot_run_config';
import { resolveBasePath } from './snapshot_run_config';
import { ensureLogsIndexTemplate } from './logs_index_template';

const LOGS_STREAM_NAME = 'logs';
const REPLAY_TEMP_PREFIX = 'sigevents-replay-temp-';
const REINDEX_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_LOGGED_REINDEX_FAILURES = 5;

const replayTempPrefix = (runId: number): string => `${REPLAY_TEMP_PREFIX}${runId}-`;

const TIMESTAMP_TRANSFORM_SCRIPT = `
  // Reset the _id field to null to avoid conflicts with subsequent reindex operations
  ctx._id = null;
  if (ctx.containsKey('@timestamp') && ctx['@timestamp'] != null) {
    Instant maxTime = Instant.parse(params.max_timestamp);
    Instant originalTime = Instant.parse(ctx['@timestamp'].toString());
    long deltaMillis = maxTime.toEpochMilli() - originalTime.toEpochMilli();
    Instant now = Instant.ofEpochMilli(System.currentTimeMillis());
    ctx['@timestamp'] = now.minusMillis(deltaMillis).toString();
  }
`;

export interface ReplayStats {
  total: number;
  created: number;
  skipped: number;
}

interface ReplayArtifacts {
  runId: number;
  tempPrefix: string;
  repoName: string;
  pipelineName: string;
  tempIndices: string[];
  writeIndexName?: string;
  previousDefaultPipeline?: string;
}

interface LogsDataStream {
  indices: Array<{ index_name: string }>;
}

const createReplayArtifacts = (): ReplayArtifacts => {
  const runId = Date.now();
  return {
    runId,
    tempPrefix: replayTempPrefix(runId),
    repoName: `sigevents-replay-${runId}`,
    pipelineName: `sigevents-ts-transform-${runId}`,
    tempIndices: [],
  };
};

const getLogsIndicesFromSnapshot = async ({
  esClient,
  repoName,
  snapshotName,
}: {
  esClient: Client;
  repoName: string;
  snapshotName: string;
}): Promise<string[]> => {
  const snapshotInfo = await esClient.snapshot.get({
    repository: repoName,
    snapshot: snapshotName,
  });

  const snapshot = snapshotInfo.snapshots?.[0];
  if (!snapshot) {
    throw new Error(`Snapshot "${snapshotName}" not found in repository "${repoName}"`);
  }

  // Restrict to the `logs` data stream's own backing indices (`.ds-logs-<date>-<gen>`). The hyphen
  // matters: `.startsWith('.ds-logs')` would also match sibling streams like `logs.ecs`
  // (`.ds-logs.ecs-…`), which the discovery eval does not target — and restoring those extra backing
  // indices is what trips `index_not_found` at reindex. The agent reads `FROM logs`, so only `logs`.
  const logsIndices = (snapshot.indices ?? []).filter(
    (indexName) => indexName.startsWith('.ds-logs-') || indexName === LOGS_STREAM_NAME
  );
  if (logsIndices.length === 0) {
    throw new Error(`No logs indices found in snapshot "${snapshotName}"`);
  }

  return logsIndices;
};

const restoreLogsIndicesToTemp = async ({
  esClient,
  repoName,
  snapshotName,
  logsIndices,
  tempPrefix,
  log,
}: {
  esClient: Client;
  repoName: string;
  snapshotName: string;
  logsIndices: string[];
  tempPrefix: string;
  log: ToolingLog;
}): Promise<string[]> => {
  log.debug(`Restoring ${logsIndices.length} indices to temp location`);

  await esClient.snapshot.restore({
    repository: repoName,
    snapshot: snapshotName,
    wait_for_completion: true,
    indices: logsIndices.join(','),
    include_global_state: false,
    rename_pattern: '(.+)',
    rename_replacement: `${tempPrefix}$1`,
    // The snapshot's backing indices carry `index.lifecycle.*`; if restored intact, the cluster's
    // lifecycle sweep reaps the temp index (its origination date is already past the delete age)
    // before we can reindex from it — surfacing as `index_not_found` mid-replay on serverless.
    // Strip lifecycle so the temp index stays inert until cleanup deletes it.
    ignore_index_settings: ['index.lifecycle.name', 'index.lifecycle.prefer_ilm'],
  });

  return logsIndices.map((indexName) => `${tempPrefix}${indexName}`);
};

const getMaxTimestampFromTempIndices = async ({
  esClient,
  tempIndices,
  log,
}: {
  esClient: Client;
  tempIndices: string[];
  log: ToolingLog;
}): Promise<string> => {
  const maxTsResult = await esClient.search({
    index: tempIndices.join(','),
    size: 0,
    aggs: { max_ts: { max: { field: '@timestamp' } } },
  });

  const maxTsValue = (maxTsResult.aggregations?.max_ts as { value_as_string?: string })
    ?.value_as_string;

  if (!maxTsValue) {
    throw new Error('No @timestamp found in restored snapshot indices');
  }

  log.debug(`Max timestamp from snapshot data: ${maxTsValue}`);
  return maxTsValue;
};

const getLogsDataStream = async (esClient: Client): Promise<LogsDataStream | undefined> => {
  const dataStreams = await esClient.indices.getDataStream({ name: LOGS_STREAM_NAME });
  return dataStreams.data_streams[0] as LogsDataStream | undefined;
};

const ensureLogsDataStream = async ({
  esClient,
  log,
}: {
  esClient: Client;
  log: ToolingLog;
}): Promise<LogsDataStream> => {
  try {
    const logsDataStream = await getLogsDataStream(esClient);
    if (!logsDataStream) {
      throw new Error(`${LOGS_STREAM_NAME} data stream not found`);
    }
    return logsDataStream;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    log.debug(`${LOGS_STREAM_NAME} data stream not found - creating it for replay`);
    await ensureLogsIndexTemplate(esClient, log);
    await esClient.indices.createDataStream({ name: LOGS_STREAM_NAME });

    const logsDataStream = await getLogsDataStream(esClient);
    if (!logsDataStream) {
      throw new Error(`${LOGS_STREAM_NAME} data stream not found after creation`);
    }
    return logsDataStream;
  }
};

const getWriteIndexInfo = async ({
  esClient,
  log,
}: {
  esClient: Client;
  log: ToolingLog;
}): Promise<{ writeIndexName: string; previousDefaultPipeline: string }> => {
  const logsDataStream = await ensureLogsDataStream({ esClient, log });
  const writeIndex = logsDataStream.indices.at(-1);
  if (!writeIndex?.index_name) {
    throw new Error(`${LOGS_STREAM_NAME} data stream has no write index`);
  }

  const writeIndexName = writeIndex.index_name;
  const settings = await esClient.indices.getSettings({ index: writeIndexName });
  const previousDefaultPipeline =
    ((settings[writeIndexName]?.settings?.index as Record<string, unknown>)?.default_pipeline as
      | string
      | undefined) ?? '_none';

  return { writeIndexName, previousDefaultPipeline };
};

const getReplayChainPipeline = async ({
  esClient,
  log,
  previousDefaultPipeline,
}: {
  esClient: Client;
  log: ToolingLog;
  previousDefaultPipeline: string;
}): Promise<string | undefined> => {
  if (previousDefaultPipeline === '_none') {
    log.debug('Write index has no default_pipeline; replay will use timestamp transform only');
    return undefined;
  }

  try {
    await esClient.ingest.getPipeline({ id: previousDefaultPipeline });
    log.debug(`Chaining existing default_pipeline: ${previousDefaultPipeline}`);
    return previousDefaultPipeline;
  } catch {
    log.warning(
      `Write index default_pipeline "${previousDefaultPipeline}" not found; replay will run without it`
    );
    return undefined;
  }
};

const createReplayPipeline = async ({
  esClient,
  pipelineName,
  maxTimestamp,
  chainedPipelineName,
}: {
  esClient: Client;
  pipelineName: string;
  maxTimestamp: string;
  chainedPipelineName?: string;
}): Promise<void> => {
  await esClient.ingest.putPipeline({
    id: pipelineName,
    processors: [
      {
        script: {
          lang: 'painless',
          params: { max_timestamp: maxTimestamp },
          source: TIMESTAMP_TRANSFORM_SCRIPT,
        },
      },
      ...(chainedPipelineName
        ? [
            {
              pipeline: {
                name: chainedPipelineName,
                ignore_missing_pipeline: true,
              },
            },
          ]
        : []),
    ],
  });
};

const setWriteIndexDefaultPipeline = async ({
  esClient,
  writeIndexName,
  pipelineName,
  log,
}: {
  esClient: Client;
  writeIndexName: string;
  pipelineName: string;
  log: ToolingLog;
}): Promise<void> => {
  log.debug(`Setting default_pipeline on ${writeIndexName} to ${pipelineName}`);
  await esClient.indices.putSettings({
    index: writeIndexName,
    settings: { 'index.default_pipeline': pipelineName },
  });
};

const logReindexFailures = ({
  log,
  failures,
  skipped,
}: {
  log: ToolingLog;
  failures: Array<{ cause?: { reason?: string; type?: string } }>;
  skipped: number;
}): void => {
  log.warning(`Reindex: ${skipped} docs skipped due to mapping conflicts`);
  for (const failure of failures.slice(0, MAX_LOGGED_REINDEX_FAILURES)) {
    const reason = failure.cause?.reason?.split('\n')[0]?.slice(0, 150) ?? 'unknown';
    log.debug(`  - ${failure.cause?.type ?? 'error'}: ${reason}`);
  }
  if (failures.length > MAX_LOGGED_REINDEX_FAILURES) {
    log.debug(`  ... and ${failures.length - MAX_LOGGED_REINDEX_FAILURES} more`);
  }
};

const reindexTempIndicesIntoManagedStream = async ({
  esClient,
  tempIndices,
  log,
}: {
  esClient: Client;
  tempIndices: string[];
  log: ToolingLog;
}): Promise<ReplayStats> => {
  log.debug('Reindexing into managed logs stream via default_pipeline');
  const reindexResult = await esClient.reindex(
    {
      wait_for_completion: true,
      source: { index: tempIndices.join(',') },
      dest: { index: LOGS_STREAM_NAME, op_type: 'create' },
    },
    { requestTimeout: REINDEX_REQUEST_TIMEOUT_MS }
  );

  const total = reindexResult.total ?? 0;
  const created = reindexResult.created ?? 0;
  const failures = (reindexResult.failures ?? []) as Array<{
    cause?: { reason?: string; type?: string };
  }>;
  const skipped = total - created;

  if (failures.length > 0) {
    logReindexFailures({ log, failures, skipped });
  }

  return { total, created, skipped };
};

const cleanupReplayArtifacts = async ({
  esClient,
  log,
  artifacts,
}: {
  esClient: Client;
  log: ToolingLog;
  artifacts: ReplayArtifacts;
}): Promise<void> => {
  const { writeIndexName, tempIndices, pipelineName, repoName } = artifacts;

  if (writeIndexName) {
    try {
      // Reset to _none rather than restoring the streams pipeline so that
      // streams.disable() can delete the pipeline without ES rejecting it due
      // to an active index reference. streams.enable() will re-apply it.
      await esClient.indices.putSettings({
        index: writeIndexName,
        settings: { 'index.default_pipeline': '_none' },
      });
    } catch {
      log.warning('Failed to clear default_pipeline on write index');
    }
  }

  for (const indexName of tempIndices) {
    try {
      await esClient.indices.delete({ index: indexName, ignore_unavailable: true });
    } catch {
      log.warning(`Failed to delete temp index: ${indexName}`);
    }
  }

  try {
    await esClient.ingest.deletePipeline({ id: pipelineName });
  } catch {
    log.warning('Failed to delete timestamp pipeline');
  }

  try {
    await esClient.snapshot.deleteRepository({ name: repoName });
  } catch {
    log.warning('Failed to delete snapshot repository');
  }
};

export const deleteTemporaryReplayIndices = async (
  esClient: Client,
  log: ToolingLog,
  prefix: string = REPLAY_TEMP_PREFIX
): Promise<void> => {
  try {
    const resolved = await esClient.indices.get({
      index: `${prefix}*`,
      expand_wildcards: 'all',
      ignore_unavailable: true,
      allow_no_indices: true,
    });
    const indexNames = Object.keys(resolved);
    if (indexNames.length === 0) return;
    await esClient.indices.delete({
      index: indexNames,
      expand_wildcards: 'all',
      ignore_unavailable: true,
    });
    log.debug(`Deleted ${indexNames.length} temporary replay indices`);
  } catch (error) {
    log.warning(
      `Failed to delete temporary replay indices: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

/**
 * Replays a snapshot into the managed `logs` ES stream by setting a
 * `default_pipeline` on the write index rather than specifying a per-request
 * pipeline. ES streams reject per-request pipelines but honour the
 * `default_pipeline` index setting — the same mechanism the Streams plugin
 * itself uses for its own processing pipelines.
 *
 * Documents that fail due to mapping conflicts (e.g. `resource.attributes.app`
 * typed as string in one service and object in another) are skipped.  The
 * returned {@link ReplayStats} reports how many documents were indexed vs
 * skipped so callers can decide whether the drop rate is acceptable.
 */
export async function replayIntoManagedStream(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig
): Promise<ReplayStats> {
  log.debug(`Replaying snapshot "${snapshotName}" into managed logs stream`);

  const basePath = resolveBasePath(gcs);
  const repository = createGcsRepository({ bucket: gcs.bucket, basePath });
  const artifacts = createReplayArtifacts();

  try {
    log.info('Step 1/4: Registering snapshot repository...');
    repository.validate();
    await repository.register({ esClient, log, repoName: artifacts.repoName });

    log.info('Step 2/4: Restoring logs snapshot indices into temporary indices...');
    // A previously killed run may have left temp indices behind (the cleanup
    // `finally` never ran), which would collide with `restore` ("an open index
    // with same name already exists"). Delete any stale temp indices first.
    await deleteTemporaryReplayIndices(esClient, log);

    const logsIndices = await getLogsIndicesFromSnapshot({
      esClient,
      repoName: artifacts.repoName,
      snapshotName,
    });
    artifacts.tempIndices = await restoreLogsIndicesToTemp({
      esClient,
      repoName: artifacts.repoName,
      snapshotName,
      logsIndices,
      tempPrefix: artifacts.tempPrefix,
      log,
    });

    // Temp indices inherit default_pipeline from the snapshot, which points to the
    // Streams ingest pipeline. Clear it now so streams.disable() can delete that
    // pipeline without ES rejecting it due to an active index reference.
    if (artifacts.tempIndices.length > 0) {
      try {
        await esClient.indices.putSettings({
          index: artifacts.tempIndices,
          settings: { 'index.default_pipeline': '_none' },
        });
        log.debug('Cleared default_pipeline on temporary replay indices');
      } catch (clearError) {
        log.warning(
          `Failed to clear default_pipeline on temp indices: ${
            clearError instanceof Error ? clearError.message : String(clearError)
          }`
        );
      }
    }

    log.info('Step 3/4: Preparing replay pipeline and managed stream write index...');
    const maxTimestamp = await getMaxTimestampFromTempIndices({
      esClient,
      tempIndices: artifacts.tempIndices,
      log,
    });
    const { writeIndexName, previousDefaultPipeline } = await getWriteIndexInfo({ esClient, log });
    artifacts.writeIndexName = writeIndexName;

    const chainedPipelineName = await getReplayChainPipeline({
      esClient,
      log,
      previousDefaultPipeline,
    });

    await createReplayPipeline({
      esClient,
      pipelineName: artifacts.pipelineName,
      maxTimestamp,
      chainedPipelineName,
    });

    await setWriteIndexDefaultPipeline({
      esClient,
      writeIndexName,
      pipelineName: artifacts.pipelineName,
      log,
    });

    log.info('Step 4/4: Reindexing restored documents into managed logs stream...');
    const stats = await reindexTempIndicesIntoManagedStream({
      esClient,
      tempIndices: artifacts.tempIndices,
      log,
    });

    log.info(
      `Replay complete: ${stats.created}/${stats.total} docs indexed, ${stats.skipped} skipped`
    );
    return stats;
  } finally {
    await cleanupReplayArtifacts({ esClient, log, artifacts });
  }
}
