/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TEMP_INDEX_PREFIX, createGcsRepository, replaySnapshot } from '@kbn/es-snapshot-loader';
import type { EsSnapshotSeedSource, SeedingDeps } from './types';

const describeLocation = ({ bucket, basePath, snapshotName }: EsSnapshotSeedSource): string =>
  `snapshot "${snapshotName}" in gs://${bucket}/${basePath}`;

/**
 * `replaySnapshot` deletes its own temporary restore indices, but a worker killed mid-restore
 * leaves them behind, where the next run's max-timestamp query would pick them up and shift
 * timestamps against the wrong baseline.
 */
const deleteStaleTemporaryIndices = async ({ esClient, log }: SeedingDeps): Promise<void> => {
  let staleIndices: string[];

  try {
    const { indices } = await esClient.indices.resolveIndex({ name: `${TEMP_INDEX_PREFIX}*` });
    staleIndices = indices.map(({ name }) => name);
  } catch (error) {
    log.warning(`Could not look for stale temporary indices: ${(error as Error).message}`);
    return;
  }

  if (staleIndices.length === 0) {
    return;
  }

  log.warning(`Deleting ${staleIndices.length} temporary index/indices from an interrupted run`);

  try {
    await esClient.indices.delete({ index: staleIndices.join(','), ignore_unavailable: true });
  } catch (error) {
    log.warning(`Could not delete stale temporary indices: ${(error as Error).message}`);
  }
};

/**
 * Replays a GCS-hosted snapshot into the eval cluster and returns the data streams it wrote.
 *
 * Replay rather than restore, because it rewrites `@timestamp` so the newest document lands at
 * "now" — without that, every document falls outside the time ranges the product queries.
 */
export const replayEsSnapshot = async ({
  source,
  esClient,
  log,
}: SeedingDeps & { source: EsSnapshotSeedSource }): Promise<readonly string[]> => {
  const { bucket, basePath, snapshotName, patterns } = source;

  log.info(`Replaying ${describeLocation(source)}`);

  await deleteStaleTemporaryIndices({ esClient, log });

  const result = await replaySnapshot({
    esClient,
    log,
    repository: createGcsRepository({ bucket, basePath }),
    snapshotName,
    patterns: [...patterns],
  });

  if (!result.success) {
    await deleteStaleTemporaryIndices({ esClient, log });

    throw new Error(
      `Failed to replay ${describeLocation(source)}: ` +
        `${result.errors.join('; ') || 'no error reported'}. ` +
        `Elasticsearch reads this bucket through its keystore, so check that GCS_CREDENTIALS is ` +
        `set and that the cluster was started with the "evals_tracing" Scout server config.`
    );
  }

  const indices = [...new Set(result.reindexedIndices ?? [])];

  // `replaySnapshot` reindexes without refreshing, so the documents are not searchable the instant
  // it resolves. A task that queries straight away sees an empty data stream, so refresh here and
  // let seeding mean "the data is queryable".
  if (indices.length > 0) {
    await esClient.indices.refresh({ index: indices.join(',') });
  }

  log.info(`Replayed ${indices.length} data stream(s): ${indices.join(', ')}`);

  return indices;
};
