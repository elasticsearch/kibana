/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { RepositoryStrategy } from '@kbn/es-snapshot-loader';
import { createGcsRepository, createSnapshot } from '@kbn/es-snapshot-loader';
import type { ToolingLog } from '@kbn/tooling-log';
import type { EsSnapshotSeedSource, SeedingDeps } from './types';

interface PublishEsSnapshotOptions extends SeedingDeps {
  source: EsSnapshotSeedSource;
  /** Indices or data streams to capture, as they exist in the cluster being snapshotted. */
  indices: readonly string[];
  /**
   * Overwrite a snapshot that already carries this name. Off by default: an eval dataset finds
   * its snapshot by name, so publishing cannot sidestep a clash by picking a new one, and the
   * data it would destroy may be labelled ground truth that took real effort to produce.
   */
  replaceExisting?: boolean;
}

const snapshotExists = async ({
  esClient,
  repoName,
  snapshotName,
}: {
  esClient: Client;
  repoName: string;
  snapshotName: string;
}): Promise<boolean> => {
  const { snapshots } = await esClient.snapshot.get({
    repository: repoName,
    snapshot: snapshotName,
    ignore_unavailable: true,
  });

  return (snapshots ?? []).some((snapshot) => snapshot.snapshot === snapshotName);
};

/**
 * Frees up the snapshot name, refusing unless overwriting was asked for.
 *
 * Elasticsearch rejects a snapshot whose name is taken, so publishing over an existing dataset
 * has to delete first. That makes it worth a deliberate decision rather than a side effect.
 */
const claimSnapshotName = async ({
  esClient,
  log,
  repository,
  snapshotName,
  location,
  replaceExisting,
}: {
  esClient: Client;
  log: ToolingLog;
  repository: RepositoryStrategy;
  snapshotName: string;
  location: string;
  replaceExisting: boolean;
}): Promise<void> => {
  const repoName = `seed-data-publish-${Date.now()}`;

  await repository.register({ esClient, log, repoName, verify: true });

  try {
    if (!(await snapshotExists({ esClient, repoName, snapshotName }))) {
      return;
    }

    if (!replaceExisting) {
      throw new Error(
        `Snapshot "${snapshotName}" already exists in ${location}. Publishing would delete it, ` +
          `and the data is not recoverable afterwards. Re-run with --replace to overwrite it on ` +
          `purpose, or publish under a different name.`
      );
    }

    log.warning(`Overwriting the existing "${snapshotName}" snapshot in ${location}`);
    await esClient.snapshot.delete({ repository: repoName, snapshot: snapshotName });
  } finally {
    await esClient.snapshot.deleteRepository({ name: repoName });
  }
};

/**
 * Captures indices into the snapshot that `replayEsSnapshot` later reads, and returns the backing
 * indices that were captured. Fails rather than overwrite an existing snapshot unless
 * `replaceExisting` says otherwise.
 *
 * Taking the seed source itself is the point of this function: the publisher and the eval read
 * bucket, base path and snapshot name from one declaration, so the write side cannot drift away
 * from the read side. Elasticsearch — not this process — uploads to GCS, so the cluster needs
 * write credentials in its keystore.
 */
export const publishEsSnapshot = async ({
  source,
  indices,
  esClient,
  log,
  replaceExisting = false,
}: PublishEsSnapshotOptions): Promise<readonly string[]> => {
  const { bucket, basePath, snapshotName } = source;
  const location = `gs://${bucket}/${basePath}`;
  const repository = createGcsRepository({ bucket, basePath });

  await claimSnapshotName({ esClient, log, repository, snapshotName, location, replaceExisting });

  const result = await createSnapshot({
    esClient,
    log,
    repository,
    snapshotName,
    indices: [...indices],
  });

  if (!result.success) {
    throw new Error(
      `Failed to publish "${snapshotName}" to ${location}: ` +
        `${result.errors.join('; ') || 'no error reported'}. ` +
        `Elasticsearch writes to GCS through its keystore, so check that the cluster was started ` +
        `with GCS_CREDENTIALS holding a service account that can write to this bucket.`
    );
  }

  log.success(`Published "${snapshotName}" to ${location}`);

  return result.indices;
};
