/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import {
  createGcsRepository,
  replaySnapshot,
  TEMP_INDEX_PREFIX,
  type LoadResult,
} from '@kbn/es-snapshot-loader';
import type { ToolingLog } from '@kbn/tooling-log';
import type { RcaScenario } from '../scenarios/types';

async function deleteStaleTemporaryIndices(esClient: Client, log: ToolingLog): Promise<void> {
  let staleIndices: string[];
  try {
    const resolved = await esClient.indices.resolveIndex({ name: `${TEMP_INDEX_PREFIX}*` });
    staleIndices = resolved.indices.map((entry) => entry.name);
  } catch (error) {
    log.error(`Failed to resolve stale temporary indices: ${(error as Error).message}`);
    return;
  }

  if (staleIndices.length === 0) {
    return;
  }

  log.warning(`Found ${staleIndices.length} stale temporary indices from a previous run; deleting`);
  try {
    await esClient.indices.delete({ index: staleIndices.join(','), ignore_unavailable: true });
    log.info(`Deleted ${staleIndices.length} stale temporary indices`);
  } catch (error) {
    log.error(`Failed to delete stale temporary indices: ${(error as Error).message}`);
  }
}

export async function replayRcaBenchSnapshot(
  esClient: Client,
  log: ToolingLog,
  scenario: RcaScenario
): Promise<LoadResult> {
  log.debug(
    `Replaying snapshot "${scenario.snapshotName}" from ${scenario.gcs.bucket}/${scenario.gcs.basePath}`
  );

  await deleteStaleTemporaryIndices(esClient, log);

  return replaySnapshot({
    esClient,
    log,
    repository: createGcsRepository({
      bucket: scenario.gcs.bucket,
      basePath: scenario.gcs.basePath,
    }),
    snapshotName: scenario.snapshotName,
    patterns: ['logs-*', 'traces-*'],
  });
}

export async function cleanRcaBenchDataStreams(
  esClient: Client,
  replayResult: LoadResult,
  log?: ToolingLog
): Promise<void> {
  const indices = [...new Set(replayResult?.reindexedIndices ?? [])];
  if (indices.length === 0) {
    return;
  }

  await Promise.all(
    indices.map(async (index) => {
      try {
        await esClient.deleteByQuery({ index, query: { match_all: {} }, refresh: true });
      } catch (error) {
        log?.warning(`deleteByQuery cleanup failed for [${index}]; documents may remain.`);
      }
    })
  );
}
