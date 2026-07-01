/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { coreMock } from '@kbn/core/server/mocks';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowExecutionDto, WorkflowStepExecutionDto } from '@kbn/workflows';
import { WorkflowExecutionInvalidStatusError } from '@kbn/workflows/common/errors';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import { ExternalResumeError } from './external_resume_error';
import {
  buildExternalResumePublicPath,
  getExternalResumeFormPage,
  parseApprovedQueryParam,
  parseExternalResumeApiKeyFromAuthorization,
  resolveExternalResumeApiKey,
  resumeWorkflowExecutionExternally,
  resumeWorkflowExecutionExternallyViaGet,
  resumeWorkflowExecutionExternallyWithInput,
} from './external_resume_service';
import type { WorkflowsService } from '../workflows_management_service';

const ENCODED_API_KEY = Buffer.from('api-key-id:secret').toString('base64');

describe('resumeWorkflowExecutionExternally', () => {
  const invalidateAsInternalUser = jest.fn();

  const workflowsService = {
    getCoreStart: jest.fn(),
    getWorkflowExecution: jest.fn(),
    getWorkflowsExecutionEngine: jest.fn(),
  } as unknown as jest.Mocked<WorkflowsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    const coreStart = coreMock.createStart();
    invalidateAsInternalUser.mockResolvedValue({});
    coreStart.security.authc.apiKeys.invalidateAsInternalUser = invalidateAsInternalUser;
    coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
      asCurrentUser: {
        security: {
          authenticate: jest.fn().mockResolvedValue({
            api_key: {
              id: 'api-key-id',
            },
          }),
        },
      },
    });
    workflowsService.getCoreStart.mockResolvedValue(coreStart);
    workflowsService.getWorkflowExecution.mockResolvedValue({
      id: 'exec-1',
      status: ExecutionStatus.WAITING_FOR_INPUT,
      stepExecutions: [
        {
          workflowRunId: 'exec-1',
          stepId: 'request-approval',
          stepType: 'waitForApproval',
          status: ExecutionStatus.WAITING_FOR_INPUT,
          input: {
            externalResumeApiKeyId: 'api-key-id',
          },
        } as unknown as WorkflowStepExecutionDto,
      ],
    } as unknown as WorkflowExecutionDto);
    workflowsService.getWorkflowsExecutionEngine.mockResolvedValue({
      resumeWorkflowExecution: jest.fn().mockResolvedValue({ resumedBy: 'api_key:api-key-id' }),
    } as unknown as WorkflowsExecutionEnginePluginStart);
  });

  it('resumes a waiting step after authenticating the API key', async () => {
    await resumeWorkflowExecutionExternally(workflowsService, {
      approved: true,
      executionId: 'exec-1',
      spaceId: 'default',
      apiKey: ENCODED_API_KEY,
    });

    expect(workflowsService.getWorkflowExecution).toHaveBeenCalledWith('exec-1', 'default', {
      includeInput: true,
    });

    const engine = await workflowsService.getWorkflowsExecutionEngine();
    expect(engine.resumeWorkflowExecution).toHaveBeenCalledWith(
      'exec-1',
      'default',
      { approved: true },
      undefined,
      { resumedBy: 'api_key:api-key-id' }
    );

    expect(invalidateAsInternalUser).toHaveBeenCalledWith({ ids: ['api-key-id'] });
  });

  it('rejects when API key authentication fails', async () => {
    const coreStart = await workflowsService.getCoreStart();
    coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
      asCurrentUser: {
        security: {
          authenticate: jest.fn().mockRejectedValue(new Error('invalid api key')),
        },
      },
    });

    await expect(
      resumeWorkflowExecutionExternally(workflowsService, {
        approved: true,
        executionId: 'exec-1',
        spaceId: 'default',
        apiKey: ENCODED_API_KEY,
      })
    ).rejects.toEqual(new ExternalResumeError('Invalid external resume API key', 401));
  });

  it('rejects when the API key does not match a waiting step', async () => {
    workflowsService.getWorkflowExecution.mockResolvedValue(null);

    await expect(
      resumeWorkflowExecutionExternally(workflowsService, {
        approved: true,
        executionId: 'other-exec',
        spaceId: 'default',
        apiKey: ENCODED_API_KEY,
      })
    ).rejects.toEqual(new ExternalResumeError('Workflow execution not found', 404));
  });

  it('rejects when the API key does not match any waiting step on the execution', async () => {
    workflowsService.getWorkflowExecution.mockResolvedValue({
      id: 'exec-1',
      status: ExecutionStatus.WAITING_FOR_INPUT,
      stepExecutions: [
        {
          workflowRunId: 'exec-1',
          stepType: 'waitForApproval',
          status: ExecutionStatus.WAITING_FOR_INPUT,
          input: {
            externalResumeApiKeyId: 'different-api-key-id',
          },
        } as unknown as WorkflowStepExecutionDto,
      ],
    } as unknown as WorkflowExecutionDto);

    await expect(
      resumeWorkflowExecutionExternally(workflowsService, {
        approved: true,
        executionId: 'exec-1',
        spaceId: 'default',
        apiKey: ENCODED_API_KEY,
      })
    ).rejects.toEqual(
      new ExternalResumeError('API key does not match this workflow execution', 403)
    );
  });

  it('maps engine invalid-status errors to ExternalResumeError', async () => {
    workflowsService.getWorkflowsExecutionEngine.mockResolvedValue({
      resumeWorkflowExecution: jest
        .fn()
        .mockRejectedValue(
          new WorkflowExecutionInvalidStatusError('exec-1', 'running', 'waiting_for_input')
        ),
    } as unknown as WorkflowsExecutionEnginePluginStart);

    await expect(
      resumeWorkflowExecutionExternally(workflowsService, {
        approved: true,
        executionId: 'exec-1',
        spaceId: 'default',
        apiKey: ENCODED_API_KEY,
      })
    ).rejects.toEqual(
      new ExternalResumeError('Workflow execution is not waiting for external input', 409)
    );
  });
});

describe('resumeWorkflowExecutionExternallyWithInput', () => {
  const invalidateAsInternalUser = jest.fn();

  const workflowsService = {
    getCoreStart: jest.fn(),
    getWorkflowExecution: jest.fn(),
    getWorkflowsExecutionEngine: jest.fn(),
  } as unknown as jest.Mocked<WorkflowsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    const coreStart = coreMock.createStart();
    invalidateAsInternalUser.mockResolvedValue({});
    coreStart.security.authc.apiKeys.invalidateAsInternalUser = invalidateAsInternalUser;
    coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
      asCurrentUser: {
        security: {
          authenticate: jest.fn().mockResolvedValue({
            api_key: {
              id: 'api-key-id',
            },
          }),
        },
      },
    });
    workflowsService.getCoreStart.mockResolvedValue(coreStart);
    workflowsService.getWorkflowExecution.mockResolvedValue({
      id: 'exec-1',
      status: ExecutionStatus.WAITING_FOR_INPUT,
      stepExecutions: [
        {
          workflowRunId: 'exec-1',
          stepId: 'request-input',
          stepType: 'waitForInput',
          status: ExecutionStatus.WAITING_FOR_INPUT,
          input: {
            externalResumeApiKeyId: 'api-key-id',
            schema: {
              type: 'object',
              properties: {
                severity: { type: 'string' },
              },
            },
          },
        } as unknown as WorkflowStepExecutionDto,
      ],
    } as unknown as WorkflowExecutionDto);
    workflowsService.getWorkflowsExecutionEngine.mockResolvedValue({
      resumeWorkflowExecution: jest.fn().mockResolvedValue({ resumedBy: 'api_key:api-key-id' }),
    } as unknown as WorkflowsExecutionEnginePluginStart);
  });

  it('resumes a waiting waitForInput step with validated input', async () => {
    await resumeWorkflowExecutionExternallyWithInput(workflowsService, {
      executionId: 'exec-1',
      spaceId: 'default',
      apiKey: ENCODED_API_KEY,
      input: { severity: 'high' },
    });

    const engine = await workflowsService.getWorkflowsExecutionEngine();
    expect(engine.resumeWorkflowExecution).toHaveBeenCalledWith(
      'exec-1',
      'default',
      { severity: 'high' },
      undefined,
      { resumedBy: 'api_key:api-key-id' }
    );
    expect(invalidateAsInternalUser).toHaveBeenCalledWith({ ids: ['api-key-id'] });
  });

  it('rejects waitForInput GET resume when required schema fields are missing', async () => {
    workflowsService.getWorkflowExecution.mockResolvedValue({
      id: 'exec-1',
      status: ExecutionStatus.WAITING_FOR_INPUT,
      stepExecutions: [
        {
          workflowRunId: 'exec-1',
          stepId: 'request-input',
          stepType: 'waitForInput',
          status: ExecutionStatus.WAITING_FOR_INPUT,
          input: {
            externalResumeApiKeyId: 'api-key-id',
            schema: {
              type: 'object',
              properties: {
                severity: { type: 'string' },
              },
              required: ['severity'],
            },
          },
        } as unknown as WorkflowStepExecutionDto,
      ],
    } as unknown as WorkflowExecutionDto);

    await expect(
      resumeWorkflowExecutionExternallyViaGet(workflowsService, {
        executionId: 'exec-1',
        spaceId: 'default',
        apiKey: ENCODED_API_KEY,
        query: { apiKey: ENCODED_API_KEY, approved: 'true' },
      })
    ).rejects.toThrow(ExternalResumeError);
  });

  it('resumes a waiting waitForInput step via GET query params', async () => {
    await resumeWorkflowExecutionExternallyViaGet(workflowsService, {
      executionId: 'exec-1',
      spaceId: 'default',
      apiKey: ENCODED_API_KEY,
      query: { apiKey: ENCODED_API_KEY, severity: 'high' },
    });

    const engine = await workflowsService.getWorkflowsExecutionEngine();
    expect(engine.resumeWorkflowExecution).toHaveBeenCalledWith(
      'exec-1',
      'default',
      { severity: 'high' },
      undefined,
      { resumedBy: 'api_key:api-key-id' }
    );
  });
});

describe('getExternalResumeFormPage', () => {
  const workflowsService = {
    getCoreStart: jest.fn(),
    getWorkflowExecution: jest.fn(),
  } as unknown as jest.Mocked<WorkflowsService>;

  beforeEach(() => {
    jest.clearAllMocks();
    const coreStart = coreMock.createStart();
    coreStart.elasticsearch.client.asScoped = jest.fn().mockReturnValue({
      asCurrentUser: {
        security: {
          authenticate: jest.fn().mockResolvedValue({
            api_key: {
              id: 'api-key-id',
            },
          }),
        },
      },
    });
    workflowsService.getCoreStart.mockResolvedValue(coreStart);
    workflowsService.getWorkflowExecution.mockResolvedValue({
      id: 'exec-1',
      status: ExecutionStatus.WAITING_FOR_INPUT,
      stepExecutions: [
        {
          workflowRunId: 'exec-1',
          stepType: 'waitForInput',
          status: ExecutionStatus.WAITING_FOR_INPUT,
          input: {
            externalResumeApiKeyId: 'api-key-id',
            message: 'Please respond',
            schema: {
              type: 'object',
              properties: {
                severity: { type: 'string', title: 'Severity' },
              },
            },
          },
        } as unknown as WorkflowStepExecutionDto,
      ],
    } as unknown as WorkflowExecutionDto);
  });

  it('returns an HTML form page', async () => {
    const html = await getExternalResumeFormPage(workflowsService, {
      executionId: 'exec-1',
      spaceId: 'default',
      apiKey: ENCODED_API_KEY,
      basePath: '',
    });

    expect(html).toContain('Submit your response');
    expect(html).toContain('Please respond');
    expect(html).toContain('name="severity"');
    expect(html).toContain(
      `action="${buildExternalResumePublicPath({
        basePath: '',
        executionId: 'exec-1',
        apiKey: ENCODED_API_KEY,
      })}"`
    );
  });

  it('includes Kibana basePath in the form action URL', async () => {
    const html = await getExternalResumeFormPage(workflowsService, {
      executionId: 'exec-1',
      spaceId: 'default',
      apiKey: ENCODED_API_KEY,
      basePath: '/kbn',
    });

    expect(html).toContain(
      `action="${buildExternalResumePublicPath({
        basePath: '/kbn',
        executionId: 'exec-1',
        apiKey: ENCODED_API_KEY,
      })}"`
    );
  });
});

describe('resolveExternalResumeApiKey', () => {
  it('prefers the Authorization header when present', () => {
    expect(
      resolveExternalResumeApiKey({
        authorization: 'ApiKey header-key',
        queryApiKey: 'query-key',
      })
    ).toBe('header-key');
  });

  it('falls back to the apiKey query parameter', () => {
    expect(
      resolveExternalResumeApiKey({
        queryApiKey: 'query-key',
      })
    ).toBe('query-key');
  });

  it('rejects requests with no credential', () => {
    expect(() => resolveExternalResumeApiKey({})).toThrow(
      new ExternalResumeError(
        'External resume API key must be provided via Authorization header or apiKey query parameter',
        401
      )
    );
  });
});

describe('parseExternalResumeApiKeyFromAuthorization', () => {
  it('extracts the encoded API key credential', () => {
    expect(parseExternalResumeApiKeyFromAuthorization('ApiKey abc123')).toBe('abc123');
  });

  it('rejects missing or invalid Authorization headers', () => {
    expect(() => parseExternalResumeApiKeyFromAuthorization(undefined)).toThrow(
      new ExternalResumeError('Missing or invalid Authorization header', 401)
    );
    expect(() => parseExternalResumeApiKeyFromAuthorization('Bearer token')).toThrow(
      new ExternalResumeError('Missing or invalid Authorization header', 401)
    );
  });
});

describe('parseApprovedQueryParam', () => {
  it('parses boolean and string values', () => {
    expect(parseApprovedQueryParam(true)).toBe(true);
    expect(parseApprovedQueryParam('true')).toBe(true);
    expect(parseApprovedQueryParam(false)).toBe(false);
    expect(parseApprovedQueryParam('false')).toBe(false);
  });

  it('rejects invalid values', () => {
    expect(() => parseApprovedQueryParam('maybe')).toThrow(
      new ExternalResumeError('approved query parameter must be true or false', 400)
    );
  });
});
