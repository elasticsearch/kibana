/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { INFERENCE_PII_ANONYMIZATION_WORKFLOW_ID } from '@kbn/workflows/managed';
import type { PluginScopedManagedWorkflowsApi } from '@kbn/workflows/server/types';
import { managedWorkflowInstallationsCounter } from './anonymization_metrics';

export interface InferenceAnonymizationManagedWorkflowInstaller {
  initialize(spaceIds: Promise<readonly string[]>): Promise<void>;
  ensureInstalled(spaceId: string): Promise<void>;
}

export const createInferenceAnonymizationManagedWorkflowInstaller = ({
  getClient,
  logger,
}: {
  getClient: () => Promise<PluginScopedManagedWorkflowsApi>;
  logger: Logger;
}): InferenceAnonymizationManagedWorkflowInstaller => {
  const installations = new Map<string, Promise<void>>();
  const clientPromise = getClient();
  let initialization: Promise<void> | undefined;

  const install = (spaceId: string): Promise<void> => {
    const existing = installations.get(spaceId);
    if (existing) {
      return existing;
    }

    const installation = clientPromise
      .then((client) =>
        client.install(INFERENCE_PII_ANONYMIZATION_WORKFLOW_ID, {
          spaceId,
          // Workflow document ids are global in storage. The suffix prevents two spaces from
          // contending for the same managed document while retaining the canonical definition id.
          workflowIdSuffix: spaceId,
        })
      )
      .then(() => {
        managedWorkflowInstallationsCounter.add(1);
      })
      .catch((error: unknown) => {
        installations.delete(spaceId);
        throw error;
      });
    installations.set(spaceId, installation);
    return installation;
  };

  return {
    initialize: (spaceIds) => {
      if (initialization) {
        return initialization;
      }

      initialization = spaceIds.then(async (resolvedSpaceIds) => {
        const uniqueSpaceIds = [...new Set(resolvedSpaceIds)];
        await Promise.all(uniqueSpaceIds.map(install));
        const client = await clientPromise;
        await client.ready();
        logger.info(
          `Inference anonymization managed workflow installed in ${uniqueSpaceIds.length} space(s)`
        );
      });
      return initialization;
    },
    ensureInstalled: async (spaceId) => {
      if (!initialization) {
        throw new Error('Inference anonymization managed workflow installer is not initialized');
      }
      await initialization;
      await install(spaceId);
    },
  };
};
