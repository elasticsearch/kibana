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
import {
  EXTERNAL_RESUME_API_PATH,
  getAuthenticatedExternalResumeApiKeyId,
} from '@kbn/workflows/server';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { createExternalResumeApiKeyRequest } from './create_external_resume_api_key_request';
import { ExternalResumeError } from './external_resume_error';
import {
  buildExternalResumeFormFieldsHtml,
  parseExternalResumeFormBody,
  validateExternalResumeInput,
} from './external_resume_form_fields';
import { renderExternalResumeFormPage } from './render_external_resume_page';
import type { WorkflowsService } from '../workflows_management_service';

export interface ExternalResumeWorkflowExecutionParams {
  apiKey: string;
  approved: boolean;
  executionId: string;
  spaceId: string;
}

export interface ExternalResumeViaGetParams {
  apiKey: string;
  executionId: string;
  spaceId: string;
  query: Record<string, unknown>;
}

export interface ExternalResumeWorkflowExecutionWithInputParams {
  apiKey: string;
  executionId: string;
  spaceId: string;
  input: Record<string, unknown>;
}

export interface ExternalResumeFormPageParams {
  apiKey: string;
  executionId: string;
  spaceId: string;
  basePath: string;
}

interface ApiKeyAuthenticateResponse {
  api_key?: {
    id?: string;
    name?: string;
  };
}

interface ResolvedExternalResumeContext {
  authenticatedApiKeyId: string;
  execution: NonNullable<Awaited<ReturnType<WorkflowsService['getWorkflowExecution']>>>;
  stepExecution: WorkflowStepExecutionDto;
}

export async function resumeWorkflowExecutionExternally(
  workflowsService: WorkflowsService,
  { apiKey, approved, executionId, spaceId }: ExternalResumeWorkflowExecutionParams
): Promise<ResumeWorkflowExecutionResponseDto> {
  return resumeWorkflowExecutionExternallyViaGet(workflowsService, {
    apiKey,
    executionId,
    spaceId,
    query: { apiKey, approved },
  });
}

export async function resumeWorkflowExecutionExternallyViaGet(
  workflowsService: WorkflowsService,
  { apiKey, executionId, spaceId, query }: ExternalResumeViaGetParams
): Promise<ResumeWorkflowExecutionResponseDto> {
  const { authenticatedApiKeyId, stepExecution } = await resolveExternalResumeContext(
    workflowsService,
    { apiKey, executionId, spaceId }
  );

  if (stepExecution.stepType === 'waitForApproval') {
    if (!Object.hasOwn(query, 'approved')) {
      throw new ExternalResumeError('approved query parameter is required', 400);
    }

    return resumeWorkflowExecutionWithResolvedContext(workflowsService, {
      authenticatedApiKeyId,
      executionId,
      spaceId,
      input: { approved: parseApprovedQueryParam(query.approved) },
    });
  }

  if (stepExecution.stepType === 'waitForInput') {
    const schema = getStepInputSchema(stepExecution.input);
    const validatedInput = parseExternalResumeFormSubmission(
      getExternalResumeInputFromQuery(query),
      schema
    );

    return resumeWorkflowExecutionWithResolvedContext(workflowsService, {
      authenticatedApiKeyId,
      executionId,
      spaceId,
      input: validatedInput,
    });
  }

  throw new ExternalResumeError('This workflow step does not support external resume', 400);
}

export async function resumeWorkflowExecutionExternallyWithInput(
  workflowsService: WorkflowsService,
  { apiKey, executionId, spaceId, input }: ExternalResumeWorkflowExecutionWithInputParams
): Promise<ResumeWorkflowExecutionResponseDto> {
  const { authenticatedApiKeyId, stepExecution } = await resolveExternalResumeContext(
    workflowsService,
    { apiKey, executionId, spaceId }
  );

  if (stepExecution.stepType !== 'waitForInput') {
    throw new ExternalResumeError(
      'This workflow step does not accept structured external input',
      400
    );
  }

  const schema = getStepInputSchema(stepExecution.input);
  const validatedInput = parseExternalResumeFormSubmission(input, schema);

  return resumeWorkflowExecutionWithResolvedContext(workflowsService, {
    authenticatedApiKeyId,
    executionId,
    spaceId,
    input: validatedInput,
  });
}

export async function getExternalResumeFormPage(
  workflowsService: WorkflowsService,
  { apiKey, executionId, spaceId, basePath }: ExternalResumeFormPageParams
): Promise<string> {
  const { stepExecution } = await resolveExternalResumeContext(workflowsService, {
    apiKey,
    executionId,
    spaceId,
  });

  if (stepExecution.stepType !== 'waitForInput') {
    throw new ExternalResumeError('This workflow step does not expose an external input form', 400);
  }

  const stepInput = getStepInputRecord(stepExecution.input);
  const schema = getStepInputSchema(stepExecution.input);
  const message = typeof stepInput.message === 'string' ? stepInput.message : undefined;

  return renderExternalResumeFormPage({
    message,
    formActionUrl: buildExternalResumePublicPath({ basePath, executionId, apiKey }),
    fieldsHtml: buildExternalResumeFormFieldsHtml(schema),
  });
}

export function buildExternalResumePublicPath({
  basePath,
  executionId,
  apiKey,
  approved,
}: {
  basePath: string;
  executionId: string;
  apiKey?: string;
  approved?: boolean;
}): string {
  const path = EXTERNAL_RESUME_API_PATH.replace('{executionId}', executionId);
  const params = new URLSearchParams();
  if (apiKey) {
    params.set('apiKey', apiKey);
  }
  if (approved !== undefined) {
    params.set('approved', String(approved));
  }
  const query = params.toString();
  return query.length > 0 ? `${basePath}${path}?${query}` : `${basePath}${path}`;
}

export function parseExternalResumeFormSubmission(
  body: Record<string, unknown>,
  schema: JsonModelSchemaType | undefined
): Record<string, unknown> {
  try {
    const parsed = parseExternalResumeFormBody(body, schema);
    return validateExternalResumeInput(parsed, schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid form submission';
    throw new ExternalResumeError(message, 400);
  }
}

async function resolveExternalResumeContext(
  workflowsService: WorkflowsService,
  {
    apiKey,
    executionId,
    spaceId,
  }: {
    apiKey: string;
    executionId: string;
    spaceId: string;
  }
): Promise<ResolvedExternalResumeContext> {
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

  return { authenticatedApiKeyId, execution, stepExecution };
}

async function resumeWorkflowExecutionWithResolvedContext(
  workflowsService: WorkflowsService,
  {
    authenticatedApiKeyId,
    executionId,
    spaceId,
    input,
  }: {
    authenticatedApiKeyId: string;
    executionId: string;
    spaceId: string;
    input: Record<string, unknown>;
  }
): Promise<ResumeWorkflowExecutionResponseDto> {
  const coreStart = await workflowsService.getCoreStart();
  const workflowsExecutionEngine = await workflowsService.getWorkflowsExecutionEngine();
  const resumedBy = `api_key:${authenticatedApiKeyId}`;

  try {
    const result = await workflowsExecutionEngine.resumeWorkflowExecution(
      executionId,
      spaceId,
      input,
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

function getStepInputRecord(input: unknown): Record<string, unknown> {
  if (input != null && typeof input === 'object') {
    return input as Record<string, unknown>;
  }
  return {};
}

function getStepInputSchema(input: unknown): JsonModelSchemaType | undefined {
  const stepInput = getStepInputRecord(input);
  const schema = stepInput.schema;
  if (schema != null && typeof schema === 'object') {
    return schema as JsonModelSchemaType;
  }
  return undefined;
}

function getExternalResumeInputFromQuery(query: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(query)) {
    if (key !== 'apiKey') {
      input[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  return input;
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

export function parseExternalResumeApiKeyFromAuthorization(
  authorization: string | undefined
): string {
  const prefix = 'ApiKey ';
  if (authorization == null || !authorization.startsWith(prefix)) {
    throw new ExternalResumeError('Missing or invalid Authorization header', 401);
  }

  const apiKey = authorization.slice(prefix.length).trim();
  if (apiKey.length === 0) {
    throw new ExternalResumeError('Missing or invalid Authorization header', 401);
  }

  return apiKey;
}

export function resolveExternalResumeApiKey({
  authorization,
  queryApiKey,
}: {
  authorization?: string | string[];
  queryApiKey?: string;
}): string {
  const authorizationHeader = Array.isArray(authorization) ? authorization[0] : authorization;
  if (authorizationHeader != null && authorizationHeader.trim().length > 0) {
    return parseExternalResumeApiKeyFromAuthorization(authorizationHeader);
  }

  if (typeof queryApiKey === 'string' && queryApiKey.length > 0) {
    return queryApiKey;
  }

  throw new ExternalResumeError(
    'External resume API key must be provided via Authorization header or apiKey query parameter',
    401
  );
}
