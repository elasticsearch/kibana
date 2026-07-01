/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createExternalResumeApiKey } from '@kbn/workflows/server';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { ContextDependencies } from '../../workflow_context_manager/types';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';

export async function mintHitlExternalResumeApiKey({
  stepExecutionRuntime,
  execution,
  stepId,
  spaceId,
  timeout,
}: {
  stepExecutionRuntime: StepExecutionRuntime;
  execution: ReturnType<WorkflowExecutionRuntimeManager['getWorkflowExecution']>;
  stepId: string;
  spaceId: string;
  timeout: string;
}): Promise<{ id: string; encoded: string }> {
  const esClient = stepExecutionRuntime.contextManager.getEsClientAsUser();
  return createExternalResumeApiKey({
    esClient,
    executionId: execution.id,
    stepId,
    workflowId: execution.workflowId,
    spaceId,
    expiration: timeout,
  });
}

export async function invalidateHitlExternalResumeApiKeyIfPresent({
  stepExecutionRuntime,
  dependencies,
  workflowLogger,
}: {
  stepExecutionRuntime: StepExecutionRuntime;
  dependencies: ContextDependencies;
  workflowLogger: IWorkflowEventLogger;
}): Promise<void> {
  const input = stepExecutionRuntime.stepExecution?.input;
  if (input == null || typeof input !== 'object' || !('externalResumeApiKeyId' in input)) {
    return;
  }

  const apiKeyId = (input as { externalResumeApiKeyId?: unknown }).externalResumeApiKeyId;
  if (typeof apiKeyId !== 'string' || apiKeyId.length === 0) {
    return;
  }

  try {
    await dependencies.coreStart.security.authc.apiKeys.invalidateAsInternalUser({
      ids: [apiKeyId],
    });
  } catch (error) {
    workflowLogger.logWarn(
      `Failed to invalidate external resume API key (${apiKeyId}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
