/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { runLeadGenerationPipeline, type RunPipelineParams } from './run_pipeline';
import { upsertLeadGenerationConfig } from './saved_object';

export interface RunLeadGenerationInBackgroundArgs {
  readonly pipelineArgs: RunPipelineParams;
  readonly savedObjectsClient: SavedObjectsClientContract;
  readonly connectorId: string;
  readonly executionUuid: string;
}

/**
 * Fires runLeadGenerationPipeline in a background IIFE and persists
 * success/error status via upsertLeadGenerationConfig. Errors thrown by
 * createLeads (including ES security_exception) are caught here and surface
 * via the status endpoint's `lastError` field rather than propagating to the caller.
 */
export const runLeadGenerationInBackground = ({
  pipelineArgs,
  savedObjectsClient,
  connectorId,
  executionUuid,
}: RunLeadGenerationInBackgroundArgs): void => {
  const { logger, spaceId } = pipelineArgs;

  void (async () => {
    try {
      await runLeadGenerationPipeline(pipelineArgs);
      await upsertLeadGenerationConfig(savedObjectsClient, spaceId, {
        connectorId,
        lastExecutionUuid: executionUuid,
        lastError: null,
      }).catch((err: Error) =>
        logger.warn(
          `[LeadGeneration] Failed to persist success status (executionUuid=${executionUuid}): ${err.message}`
        )
      );
      logger.info(
        `[LeadGeneration] Background generation completed (connectorId=${connectorId}, executionUuid=${executionUuid})`
      );
    } catch (pipelineError) {
      const errorMessage =
        pipelineError instanceof Error ? pipelineError.message : String(pipelineError);
      logger.error(
        `[LeadGeneration] Background generation failed (executionUuid=${executionUuid}): ${errorMessage}`
      );
      await upsertLeadGenerationConfig(savedObjectsClient, spaceId, {
        connectorId,
        lastExecutionUuid: executionUuid,
        lastError: errorMessage,
      }).catch((err: Error) =>
        logger.warn(
          `[LeadGeneration] Failed to persist error status (executionUuid=${executionUuid}): ${err.message}`
        )
      );
    }
  })();
};
