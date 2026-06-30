/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { WORKFLOW_EXTERNAL_RESUME_APPLICATION } from './constants';

export interface ExternalResumeApiKeyMetadata {
  application: string;
  workflow_execution_id: string;
  workflow_id: string;
  workflow_space_id: string;
  workflow_step_id: string;
}

interface ApiKeyAuthenticateResponse {
  api_key?: {
    id?: string;
    name?: string;
  };
}

export class ExternalResumeApiKeyMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalResumeApiKeyMetadataError';
  }
}

export function getAuthenticatedExternalResumeApiKeyId(
  authentication: ApiKeyAuthenticateResponse
): string | undefined {
  return authentication.api_key?.id;
}

export function parseExternalResumeApiKeyMetadata(metadata: unknown): ExternalResumeApiKeyMetadata {
  if (metadata == null || typeof metadata !== 'object') {
    throw new ExternalResumeApiKeyMetadataError('Invalid external resume API key');
  }

  const record = metadata as Record<string, unknown>;
  const application = record.application;
  const workflowExecutionId = record.workflow_execution_id;
  const workflowId = record.workflow_id;
  const workflowSpaceId = record.workflow_space_id;
  const workflowStepId = record.workflow_step_id;

  if (
    application !== WORKFLOW_EXTERNAL_RESUME_APPLICATION ||
    typeof workflowExecutionId !== 'string' ||
    workflowExecutionId.length === 0 ||
    typeof workflowId !== 'string' ||
    workflowId.length === 0 ||
    typeof workflowSpaceId !== 'string' ||
    workflowSpaceId.length === 0 ||
    typeof workflowStepId !== 'string' ||
    workflowStepId.length === 0
  ) {
    throw new ExternalResumeApiKeyMetadataError('Invalid external resume API key');
  }

  return {
    application,
    workflow_execution_id: workflowExecutionId,
    workflow_id: workflowId,
    workflow_space_id: workflowSpaceId,
    workflow_step_id: workflowStepId,
  };
}

export async function loadExternalResumeApiKeyMetadata(
  esClient: ElasticsearchClient,
  apiKeyId: string
): Promise<ExternalResumeApiKeyMetadata> {
  const response = await esClient.security.getApiKey({ id: apiKeyId });
  const apiKey = response.api_keys?.[0];

  if (!apiKey) {
    throw new ExternalResumeApiKeyMetadataError('Invalid external resume API key');
  }

  return parseExternalResumeApiKeyMetadata(apiKey.metadata);
}
