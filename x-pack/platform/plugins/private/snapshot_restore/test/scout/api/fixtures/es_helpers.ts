/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import type { EsClient } from '@kbn/scout';

export interface SeedSlmPolicy {
  policyName: string;
  snapshotName: string;
  schedule: string;
  repository: string;
  config?: {
    indices?: string | string[];
    ignoreUnavailable?: boolean;
  };
}

/** Registers a local `fs` snapshot repository (only usable on non-Cloud deployments). */
export const createFsRepository = (esClient: EsClient, name: string, location: string) =>
  esClient.snapshot.createRepository({
    name,
    verify: false,
    repository: { type: 'fs', settings: { location } },
  });

export const deleteRepository = (esClient: EsClient, name: string) =>
  esClient.snapshot.deleteRepository({ name });

export const putSlmPolicy = (esClient: EsClient, policy: SeedSlmPolicy) =>
  esClient.slm.putLifecycle({
    policy_id: policy.policyName,
    name: policy.snapshotName,
    schedule: policy.schedule,
    repository: policy.repository,
    ...(policy.config
      ? {
          config: {
            indices: policy.config.indices,
            ignore_unavailable: policy.config.ignoreUnavailable,
          },
        }
      : {}),
  });

export const deleteSlmPolicy = (esClient: EsClient, policyName: string) =>
  esClient.slm.deleteLifecycle({ policy_id: policyName });

/** Triggers an SLM policy run and returns the generated snapshot name. */
export const executeSlmPolicy = async (esClient: EsClient, policyName: string): Promise<string> => {
  const { snapshot_name: snapshotName } = await esClient.slm.executeLifecycle({
    policy_id: policyName,
  });
  return snapshotName;
};

/** Creates a snapshot and blocks until it completes so list/sort assertions are deterministic. */
export const createSnapshot = (esClient: EsClient, snapshot: string, repository: string) =>
  esClient.snapshot.create({ snapshot, repository, wait_for_completion: true });

export const deleteAllSnapshotsInRepo = (esClient: EsClient, repository: string) =>
  esClient.snapshot.delete({ repository, snapshot: '*' });

/**
 * Waits for a specific snapshot to reach a terminal state. SLM runs are asynchronous, so this
 * replaces the FTR suite's fixed `setTimeout` with a deterministic poll before assertions.
 */
export const waitForSnapshotToFinish = async (
  esClient: EsClient,
  repository: string,
  snapshot: string,
  timeout = 30_000
): Promise<void> => {
  const readState = async () => {
    const snapshots = await esClient.snapshot
      .get({ repository, snapshot, ignore_unavailable: true })
      .then((response) => response.snapshots)
      .catch(() => undefined);
    return snapshots?.[0]?.state;
  };

  await expect
    .poll(readState, { timeout, intervals: [500, 1_000, 2_000] })
    .toMatch(/SUCCESS|PARTIAL|FAILED/);

  expect(
    await readState(),
    `snapshot "${snapshot}" in repository "${repository}" did not complete successfully`
  ).toMatch(/SUCCESS|PARTIAL/);
};
