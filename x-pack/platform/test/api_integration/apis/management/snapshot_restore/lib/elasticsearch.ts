/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';

export interface SlmPolicy {
  policyName: string;
  // snapshot name
  name: string;
  schedule: string;
  repository: string;
  isManagedPolicy: boolean;
  config?: {
    indices: string | string[];
    ignoreUnavailable?: boolean;
    includeGlobalState?: boolean;
    partial?: boolean;
    metadata?: Record<string, string>;
  };
  retention?: {
    expireAfterValue?: number | '';
    expireAfterUnit?: string;
    maxCount?: number | '';
    minCount?: number | '';
  };
}

/**
 * Helpers to create and delete SLM policies, repositories and snapshots on the Elasticsearch instance
 * during our tests.
 */
export const registerEsHelpers = (getService: FtrProviderContext['getService']) => {
  let policiesCreated: string[] = [];

  const es = getService('es');

  const createRepository = (repoName: string, repoPath?: string) => {
    return es.snapshot.createRepository({
      name: repoName,
      body: {
        type: 'fs',
        settings: {
          location: repoPath ?? '/tmp/repo',
        },
      },
      verify: false,
    });
  };

  const createPolicy = (policy: SlmPolicy, cachePolicy?: boolean) => {
    if (cachePolicy) {
      policiesCreated.push(policy.policyName);
    }

    return es.slm.putLifecycle({
      policy_id: policy.policyName,
      // TODO: bring {@link SlmPolicy} in line with {@link PutSnapshotLifecycleRequest['body']}
      // @ts-expect-error
      body: policy,
    });
  };

  const getPolicy = (policyName: string) => {
    return es.slm.getLifecycle({
      policy_id: policyName,
      human: true,
    });
  };

  const deletePolicy = (policyName: string) => es.slm.deleteLifecycle({ policy_id: policyName });

  const cleanupPolicies = () =>
    Promise.all(policiesCreated.map(deletePolicy))
      .then(() => {
        policiesCreated = [];
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.log(`[Cleanup error] Error deleting ES resources: ${err.message}`);
      });

  const executePolicy = (policyName: string) => {
    return es.slm.executeLifecycle({ policy_id: policyName });
  };

  const createSnapshot = (snapshotName: string, repositoryName: string) => {
    return es.snapshot.create({ snapshot: snapshotName, repository: repositoryName });
  };

  const deleteSnapshots = (repositoryName: string) => {
    // return the promise so the after hook waits for deletion before the cluster is torn down
    return es.snapshot
      .delete({ repository: repositoryName, snapshot: '*' })
      .then(() => {})
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.log(`[Cleanup error] Error deleting snapshots: ${err.message}`);
      });
  };

  const startSlm = () => {
    return es.slm.start();
  };

  return {
    createRepository,
    createPolicy,
    deletePolicy,
    cleanupPolicies,
    getPolicy,
    executePolicy,
    createSnapshot,
    deleteSnapshots,
    startSlm,
  };
};
