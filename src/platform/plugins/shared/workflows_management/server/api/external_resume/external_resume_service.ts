/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus, isHitlWaitStepType } from '@kbn/workflows';
import type { ResumeWorkflowExecutionResponseDto, WorkflowStepExecutionDto } from '@kbn/workflows';
import {
  WorkflowExecutionInvalidStatusError,
  WorkflowExecutionNotFoundError,
} from '@kbn/workflows/common/errors';
import { getAuthenticatedExternalResumeApiKeyId } from '@kbn/workflows/server';
import { createExternalResumeApiKeyRequest } from './create_external_resume_api_key_request';
import { ExternalResumeError } from './external_resume_error';
import type { WorkflowsService } from '../workflows_management_service';

export interface ExternalResumeWorkflowExecutionParams {
  apiKey: string;
  approved: boolean;
  executionId: string;
  spaceId: string;
}

interface ApiKeyAuthenticateResponse {
  api_key?: {
    id?: string;
    name?: string;
  };
}

export async function resumeWorkflowExecutionExternally(
  workflowsService: WorkflowsService,
  { apiKey, approved, executionId, spaceId }: ExternalResumeWorkflowExecutionParams
): Promise<ResumeWorkflowExecutionResponseDto> {
  const coreStart = await workflowsService.getCoreStart();
  const apiKeyRequest = createExternalResumeApiKeyRequest(apiKey, spaceId);

  let authentication: ApiKeyAuthenticateResponse;
  try {
    authentication = (await coreStart.elasticsearch.client
      .asScoped(apiKeyRequest)
      .asCurrentUser.security.authenticate()) as ApiKeyAuthenticateResponse;
  } catch {
    throw new ExternalResumeError('Invalid external resume API key', 401);
  }

  const authenticatedApiKeyId = getAuthenticatedExternalResumeApiKeyId(authentication);
  if (!authenticatedApiKeyId) {
    throw new ExternalResumeError('Invalid external resume API key', 401);
  }

  const execution = await workflowsService.getWorkflowExecution(executionId, spaceId, {
    includeInput: true,
  });

  if (!execution) {
    throw new ExternalResumeError('Workflow execution not found', 404);
  }

  const stepExecution = getExternalResumeStepExecution(execution, authenticatedApiKeyId);

  if (!stepExecution) {
    throw new ExternalResumeError('API key does not match this workflow execution', 403);
  }

  if (stepExecution.finishedAt || stepExecution.error) {
    throw new ExternalResumeError('This workflow response link is no longer valid', 409);
  }

  const workflowsExecutionEngine = await workflowsService.getWorkflowsExecutionEngine();
  const resumedBy = `api_key:${authenticatedApiKeyId}`;

  try {
    const result = await workflowsExecutionEngine.resumeWorkflowExecution(
      executionId,
      spaceId,
      { approved },
      undefined,
      { resumedBy }
    );

    await coreStart.security.authc.apiKeys.invalidateAsInternalUser({
      ids: [authenticatedApiKeyId],
    });

    return result;
  } catch (error) {
    if (error instanceof WorkflowExecutionNotFoundError) {
      throw new ExternalResumeError('Workflow execution not found', 404);
    }
    if (error instanceof WorkflowExecutionInvalidStatusError) {
      throw new ExternalResumeError('Workflow execution is not waiting for external input', 409);
    }
    throw error;
  }
}

function getExternalResumeStepExecution(
  execution: {
    id: string;
    status: ExecutionStatus;
    finishedAt?: string;
    stepExecutions: WorkflowStepExecutionDto[];
  },
  apiKeyId: string
): WorkflowStepExecutionDto | undefined {
  if (execution.status !== ExecutionStatus.WAITING_FOR_INPUT) {
    return undefined;
  }

  if (execution.finishedAt) {
    return undefined;
  }

  return execution.stepExecutions.find(
    (stepExecution) =>
      stepExecution.workflowRunId === execution.id &&
      isHitlWaitStepType(stepExecution.stepType) &&
      stepExecution.status === ExecutionStatus.WAITING_FOR_INPUT &&
      getExternalResumeApiKeyId(stepExecution.input) === apiKeyId
  );
}

export function getExternalResumeApiKeyId(input: unknown): string | undefined {
  if (input == null || typeof input !== 'object' || !('externalResumeApiKeyId' in input)) {
    return undefined;
  }

  const apiKeyId = (input as { externalResumeApiKeyId?: unknown }).externalResumeApiKeyId;
  return typeof apiKeyId === 'string' && apiKeyId.length > 0 ? apiKeyId : undefined;
}

export function parseApprovedQueryParam(value: unknown): boolean {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  throw new ExternalResumeError('approved query parameter must be true or false', 400);
}
