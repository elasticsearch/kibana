/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { GCS_BUCKET, OTEL_DEMO_NAMESPACE } from './constants';
import { getSigeventsSnapshotKIFeaturesIndex } from '../../src/data_generators/sigevents_ki_features_index';

export function generateGcsBasePath({
  runId,
  appNamespace,
}: {
  runId: string;
  appNamespace?: string;
}): string {
  const dataset = appNamespace ?? OTEL_DEMO_NAMESPACE;
  return `${runId}/${dataset}`;
}

export function generateGcsRepoName({ runId }: { runId: string }): string {
  return `sigevents-${runId}`;
}

export async function registerGcsRepository(
  esClient: Client,
  log: ToolingLog,
  runId: string,
  appNamespace?: string
): Promise<void> {
  const repoName = generateGcsRepoName({ runId });
  const basePath = generateGcsBasePath({ runId, appNamespace });
  log.info(`Registering GCS snapshot repository "${repoName}" → ${GCS_BUCKET}/${basePath}`);

  await esClient.snapshot.createRepository({
    name: repoName,
    repository: { type: 'gcs', settings: { bucket: GCS_BUCKET, base_path: basePath } },
  });

  log.info('GCS repository registered');
}

export async function createSnapshot({
  esClient,
  log,
  snapshotName,
  runId,
  indices,
}: {
  esClient: Client;
  log: ToolingLog;
  snapshotName: string;
  runId: string;
  indices?: string;
}): Promise<string[]> {
  const repoName = generateGcsRepoName({ runId });
  const kiFeaturesIndex = getSigeventsSnapshotKIFeaturesIndex(snapshotName);
  const indicesToCapture = indices ?? `logs*,${kiFeaturesIndex}`;

  try {
    await esClient.snapshot.get({ repository: repoName, snapshot: snapshotName });
    throw new Error(
      `Snapshot "${repoName}/${snapshotName}" already exists. ` +
        `Use a different --run-id or delete it manually:\n` +
        `  DELETE _snapshot/${repoName}/${snapshotName}`
    );
  } catch (err) {
    const statusCode = (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
    if (statusCode !== 404) {
      throw err;
    }
  }

  log.info(`Creating snapshot "${repoName}/${snapshotName}" (indices: ${indicesToCapture})`);

  const result = await esClient.snapshot.create({
    repository: repoName,
    snapshot: snapshotName,
    wait_for_completion: true,
    indices: indicesToCapture,
    include_global_state: false,
    // Tolerate any requested index that doesn't exist (e.g. the KI data stream on a
    // fresh env) instead of failing the whole snapshot. Callers should log the
    // snapshot's actual contents so a silently-partial capture stays visible.
    ignore_unavailable: true,
  });

  const shards = result.snapshot?.shards;
  log.info(
    `Snapshot "${snapshotName}" created — ${shards?.successful ?? '?'}/${
      shards?.total ?? '?'
    } shards`
  );

  return result.snapshot?.indices ?? [];
}
