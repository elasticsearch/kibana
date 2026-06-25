/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IRouter } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { WorkflowsManagementApiActions } from '@kbn/workflows';
import {
  WorkflowExecutionNotFoundError,
  WorkflowNotFoundError,
} from '@kbn/workflows/common/errors';
import { registerExecutionRoutes } from '.';
import { ManagedWorkflowExecutionReadForbiddenError } from '../../managed_workflow_execution_read_error';
import type { RouteDependencies } from '../types';
import { createWorkflowManagementAuditLogMock } from '../utils/workflow_audit_logging.mock';

describe('Execution Routes', () => {
  let routeHandlers: Record<string, { handler: (...args: any[]) => Promise<any> }>;
  let mockApi: Record<string, jest.Mock>;
  let mockSpaces: { getSpaceId: jest.Mock };

  const mockContext = {
    workflows: Promise.resolve({
      isWorkflowsAvailable: true,
      emitEvent: jest.fn(),
      managedWorkflows: {
        install: jest.fn(),
        uninstall: jest.fn(),
        getWorkflowStatus: jest.fn(),
        execute: jest.fn(),
      },
    }),
    licensing: Promise.resolve({
      license: {
        isAvailable: true,
        isActive: true,
        hasAtLeast: jest.fn().mockReturnValue(true),
        type: 'enterprise',
      },
    }),
    core: Promise.resolve({
      security: {
        audit: {
          logger: {
            enabled: false,
            log: jest.fn(),
            includeSavedObjectNames: false,
          },
        },
      },
    }),
  };

  const mockResponse = {
    ok: jest.fn((params?: any) => ({ type: 'ok', ...params })),
    notFound: jest.fn((params?: any) => ({ type: 'notFound', ...params })),
    badRequest: jest.fn((params?: any) => ({ type: 'badRequest', ...params })),
    customError: jest.fn((params?: any) => ({ type: 'customError', ...params })),
    forbidden: jest.fn((params?: any) => ({ type: 'forbidden', ...params })),
    conflict: jest.fn((params?: any) => ({ type: 'conflict', ...params })),
  };
  const defaultAuthzResult = {
    [WorkflowsManagementApiActions.readExecution]: true,
    [WorkflowsManagementApiActions.readManagedExecution]: true,
  };

  const mockWorkflow = {
    id: 'wf-1',
    name: 'Test',
    enabled: true,
    definition: { steps: [] },
    yaml: 'steps: []',
    valid: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routeHandlers = {};
    mockSpaces = { getSpaceId: jest.fn().mockReturnValue('default') };
    mockApi = {
      getWorkflow: jest.fn(),
      runWorkflow: jest.fn(),
      testWorkflow: jest.fn(),
      testStep: jest.fn(),
      getWorkflowExecutions: jest.fn(),
      searchStepExecutions: jest.fn(),
      getWorkflowExecution: jest.fn(),
      getWorkflowExecutionLogs: jest.fn(),
      cancelWorkflowExecution: jest.fn(),
      cancelAllActiveWorkflowExecutions: jest.fn(),
      getStepExecution: jest.fn(),
      resumeWorkflowExecution: jest.fn(),
      getChildWorkflowExecutions: jest.fn(),
    };
    mockApi.getWorkflowExecution.mockResolvedValue({ id: 'ex-1', managed: false });

    const createVersionedRoute = (method: string, path: string) => ({
      addVersion: jest
        .fn()
        .mockImplementation((_config: unknown, handler: (...args: any[]) => Promise<any>) => {
          routeHandlers[`${method}:${path}`] = {
            handler: async (context, request, response) => {
              request.authzResult ??= defaultAuthzResult;
              return handler(context, request, response);
            },
          };
          return { addVersion: jest.fn() };
        }),
    });

    const mockRouter = {
      versioned: {
        get: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('GET', config.path)
          ),
        post: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('POST', config.path)
          ),
        put: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('PUT', config.path)
          ),
        delete: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('DELETE', config.path)
          ),
      },
    } as unknown as jest.Mocked<IRouter>;

    registerExecutionRoutes({
      router: mockRouter,
      api: mockApi as any,
      logger: loggingSystemMock.createLogger(),
      spaces: mockSpaces as any,
      audit: createWorkflowManagementAuditLogMock(),
    } as unknown as RouteDependencies);
  });

  const handler = (method: string, path: string) => routeHandlers[`${method}:${path}`]?.handler;

  describe('POST /api/workflows/workflow/{id}/run (run_workflow)', () => {
    const path = '/api/workflows/workflow/{id}/run';

    it('should register the route handler', () => {
      expect(handler('POST', path)).toBeDefined();
    });

    it('should call api methods with correct arguments when workflow is valid', async () => {
      mockApi.getWorkflow.mockResolvedValue(mockWorkflow);
      mockApi.runWorkflow.mockResolvedValue('exec-1');
      const h = handler('POST', path)!;
      const request = {
        params: { id: 'wf-1' },
        body: { inputs: { k: 'v' }, metadata: { src: 'ui' } },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.getWorkflow).toHaveBeenCalledWith('wf-1', 'default');
      expect(mockApi.runWorkflow).toHaveBeenCalledWith(
        {
          id: 'wf-1',
          name: 'Test',
          enabled: true,
          definition: mockWorkflow.definition,
          yaml: mockWorkflow.yaml,
        },
        'default',
        { k: 'v' },
        request,
        undefined,
        { src: 'ui' }
      );
      expect(result).toEqual({ type: 'ok', body: { workflowExecutionId: 'exec-1' } });
    });

    it('should return not found when workflow does not exist', async () => {
      mockApi.getWorkflow.mockResolvedValue(undefined);
      const h = handler('POST', path)!;
      const request = { params: { id: 'missing' }, body: { inputs: {} } };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.notFound).toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'notFound' });
      expect(mockApi.runWorkflow).not.toHaveBeenCalled();
    });

    it('should return bad request when workflow is not valid', async () => {
      mockApi.getWorkflow.mockResolvedValue({ ...mockWorkflow, valid: false });
      const h = handler('POST', path)!;
      const request = { params: { id: 'wf-1' }, body: { inputs: {} } };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: { message: 'Workflow is not valid.' },
      });
    });

    it('should return custom error when workflow definition is missing', async () => {
      mockApi.getWorkflow.mockResolvedValue({ ...mockWorkflow, definition: undefined });
      const h = handler('POST', path)!;
      const request = { params: { id: 'wf-1' }, body: { inputs: {} } };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: { message: 'Workflow definition is missing.' },
      });
    });

    it('should return bad request when workflow is disabled', async () => {
      mockApi.getWorkflow.mockResolvedValue({ ...mockWorkflow, enabled: false });
      const h = handler('POST', path)!;
      const request = { params: { id: 'wf-1' }, body: { inputs: {} } };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: { message: 'Workflow is disabled. Enable it to run it.' },
      });
    });

    it('should return custom error when api.runWorkflow throws', async () => {
      mockApi.getWorkflow.mockResolvedValue(mockWorkflow);
      mockApi.runWorkflow.mockRejectedValue(new Error('engine failed'));
      const h = handler('POST', path)!;
      const request = { params: { id: 'wf-1' }, body: { inputs: {} } };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.customError).toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'customError', body: expect.objectContaining({}) });
    });
  });

  describe('POST /api/workflows/test (test_workflow)', () => {
    const path = '/api/workflows/test';

    it('should register the route handler', () => {
      expect(handler('POST', path)).toBeDefined();
    });

    it('should call api.testWorkflow with workflow id, inputs, space, and request', async () => {
      mockApi.testWorkflow.mockResolvedValue('test-exec-1');
      const h = handler('POST', path)!;
      const request = {
        body: {
          workflowId: 'wf-1',
          inputs: { a: 1 },
        },
      };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.testWorkflow).toHaveBeenCalledWith({
        workflowId: 'wf-1',
        workflowYaml: undefined,
        inputs: { a: 1 },
        spaceId: 'default',
        request,
      });
    });

    it('should return bad request when neither workflowId nor workflowYaml is provided', async () => {
      const h = handler('POST', path)!;
      const request = { body: { inputs: {} } };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.testWorkflow).not.toHaveBeenCalled();
      expect(mockResponse.badRequest).toHaveBeenCalledWith({
        body: {
          message: "Either 'workflowId' or 'workflowYaml' or both must be provided",
        },
      });
    });
  });

  describe('POST /api/workflows/step/test (test_step)', () => {
    const path = '/api/workflows/step/test';

    it('should register the route handler', () => {
      expect(handler('POST', path)).toBeDefined();
    });

    it('should call api.testStep with yaml, ids, executionContext, contextOverride, space, and request', async () => {
      mockApi.testStep.mockResolvedValue('step-exec-1');
      const h = handler('POST', path)!;
      const request = {
        body: {
          stepId: 'step-1',
          workflowId: 'wf-1',
          workflowYaml: 'steps: []',
          executionContext: { inputs: { foo: 'bar' }, event: { type: 'test' } },
          contextOverride: { x: 1 },
        },
      };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.testStep).toHaveBeenCalledWith(
        'steps: []',
        'step-1',
        'wf-1',
        { inputs: { foo: 'bar' }, event: { type: 'test' } },
        { x: 1 },
        'default',
        request
      );
    });
  });

  describe('GET /api/workflows/workflow/{workflowId}/executions (get_workflow_executions)', () => {
    const path = '/api/workflows/workflow/{workflowId}/executions';

    it('should register the route handler', () => {
      expect(handler('GET', path)).toBeDefined();
    });

    it('should call api.getWorkflowExecutions with search params and space id', async () => {
      mockApi.getWorkflowExecutions.mockResolvedValue({ executions: [] });
      const h = handler('GET', path)!;
      const request = {
        params: { workflowId: 'wf-1' },
        query: {
          statuses: 'running',
          page: 2,
          size: 5,
          omitStepRuns: true,
          startedAfter: 'now-1w',
          startedBefore: 'now',
          finishedAfter: '2026-05-01T00:00:00.000Z',
          finishedBefore: '2026-05-14T00:00:00.000Z',
          collapse: 'concurrencyGroupKey',
          sortField: 'finishedAt',
          sortOrder: 'desc',
          concurrencyGroupKey: 'streams-ki-onboarding-my-stream',
        },
      };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'wf-1',
          statuses: ['running'],
          executionTypes: undefined,
          executedBy: undefined,
          concurrencyGroupKey: 'streams-ki-onboarding-my-stream',
          page: 2,
          size: 5,
          omitStepRuns: true,
          startedAfter: 'now-1w',
          startedBefore: 'now',
          finishedAfter: '2026-05-01T00:00:00.000Z',
          finishedBefore: '2026-05-14T00:00:00.000Z',
          collapse: 'concurrencyGroupKey',
          sortField: 'finishedAt',
          sortOrder: 'desc',
        }),
        'default'
      );
    });
  });

  describe('GET /api/workflows/workflow/{workflowId}/executions/steps (get_workflow_step_executions)', () => {
    const path = '/api/workflows/workflow/{workflowId}/executions/steps';

    it('should register the route handler', () => {
      expect(handler('GET', path)).toBeDefined();
    });

    it('should call api.searchStepExecutions with params and space id', async () => {
      mockApi.searchStepExecutions.mockResolvedValue({ stepExecutions: [] });
      const h = handler('GET', path)!;
      const request = {
        params: { workflowId: 'wf-1' },
        query: {
          stepId: 's1',
          includeInput: true,
          includeOutput: false,
          page: 1,
          size: 10,
        },
      };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.searchStepExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'wf-1',
          stepId: 's1',
          includeInput: true,
          includeOutput: false,
          page: 1,
          size: 10,
        }),
        'default'
      );
    });

    it('should forward startedAfter and startedBefore query params to api.searchStepExecutions', async () => {
      mockApi.searchStepExecutions.mockResolvedValue({ stepExecutions: [] });
      const h = handler('GET', path)!;
      const request = {
        params: { workflowId: 'wf-1' },
        query: {
          stepId: 's1',
          startedAfter: 'now-1w',
          startedBefore: 'now',
        },
      };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.searchStepExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'wf-1',
          stepId: 's1',
          startedAfter: 'now-1w',
          startedBefore: 'now',
        }),
        'default'
      );
    });
  });

  describe('GET /api/workflows/executions/{executionId} (get_execution)', () => {
    const path = '/api/workflows/executions/{executionId}';

    it('should register the route handler', () => {
      expect(handler('GET', path)).toBeDefined();
    });

    it('should call api.getWorkflowExecution with execution id, space, and include flags', async () => {
      const execution = { id: 'ex-1' };
      mockApi.getWorkflowExecution.mockResolvedValue(execution);
      const h = handler('GET', path)!;
      const request = {
        params: { executionId: 'ex-1' },
        query: { includeInput: true, includeOutput: false },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.getWorkflowExecution).toHaveBeenCalledWith('ex-1', 'default', {
        includeInput: true,
        includeOutput: false,
      });
      expect(result).toEqual({ type: 'ok', body: execution });
    });

    it('should return not found when execution does not exist', async () => {
      mockApi.getWorkflowExecution.mockResolvedValue(undefined);
      const h = handler('GET', path)!;
      const request = {
        params: { executionId: 'missing' },
        query: { includeInput: false, includeOutput: false },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.notFound).toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'notFound' });
    });

    it('should reject managed executions without managed execution read privilege', async () => {
      mockApi.getWorkflowExecution.mockResolvedValue({ id: 'ex-1', managed: true });
      const h = handler('GET', path)!;
      const request = {
        params: { executionId: 'ex-1' },
        query: { includeInput: false, includeOutput: false },
        authzResult: {
          [WorkflowsManagementApiActions.readExecution]: true,
        },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.forbidden).toHaveBeenCalledWith({
        body: {
          message: new ManagedWorkflowExecutionReadForbiddenError().message,
        },
      });
      expect(result).toMatchObject({ type: 'forbidden' });
    });
  });

  describe('POST /api/workflows/executions/{executionId}/cancel (cancel_execution)', () => {
    const path = '/api/workflows/executions/{executionId}/cancel';

    it('should register the route handler', () => {
      expect(handler('POST', path)).toBeDefined();
    });

    it('should call api.cancelWorkflowExecution with execution id and space id', async () => {
      mockApi.cancelWorkflowExecution.mockResolvedValue(undefined);
      const h = handler('POST', path)!;
      const request = { params: { executionId: 'ex-1' } };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.cancelWorkflowExecution).toHaveBeenCalledWith(
        'ex-1',
        'default',
        expect.anything()
      );
      expect(mockResponse.ok).toHaveBeenCalled();
    });

    it('should return not found when cancelWorkflowExecution throws WorkflowExecutionNotFoundError', async () => {
      mockApi.cancelWorkflowExecution.mockRejectedValue(new WorkflowExecutionNotFoundError('ex-1'));
      const h = handler('POST', path)!;
      const request = { params: { executionId: 'ex-1' } };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.notFound).toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'notFound' });
    });
  });

  describe('POST /api/workflows/workflow/{workflowId}/executions/cancel (cancel_workflow_executions)', () => {
    const path = '/api/workflows/workflow/{workflowId}/executions/cancel';

    it('should register the route handler', () => {
      expect(handler('POST', path)).toBeDefined();
    });

    it('should call api.cancelAllActiveWorkflowExecutions with workflow id and space id', async () => {
      mockApi.cancelAllActiveWorkflowExecutions.mockResolvedValue(undefined);
      const h = handler('POST', path)!;
      const request = { params: { workflowId: 'wf-1' } };

      await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.cancelAllActiveWorkflowExecutions).toHaveBeenCalledWith('wf-1', 'default');
      expect(mockResponse.ok).toHaveBeenCalled();
    });

    it('should return not found when cancelAllActiveWorkflowExecutions throws WorkflowNotFoundError', async () => {
      mockApi.cancelAllActiveWorkflowExecutions.mockRejectedValue(
        new WorkflowNotFoundError('wf-missing')
      );
      const h = handler('POST', path)!;
      const request = { params: { workflowId: 'wf-missing' } };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.notFound).toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'notFound' });
    });

    it('should return custom error when cancelAllActiveWorkflowExecutions throws a generic error', async () => {
      mockApi.cancelAllActiveWorkflowExecutions.mockRejectedValue(new Error('engine failed'));
      const h = handler('POST', path)!;
      const request = { params: { workflowId: 'wf-1' } };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.customError).toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'customError', body: expect.objectContaining({}) });
    });
  });

  describe('GET /api/workflows/executions/{executionId}/step/{stepExecutionId} (get_step_execution)', () => {
    const path = '/api/workflows/executions/{executionId}/step/{stepExecutionId}';

    it('should register the route handler', () => {
      expect(handler('GET', path)).toBeDefined();
    });

    it('should call api.getStepExecution with execution and step ids and space id', async () => {
      const step = { id: 'se-1' };
      mockApi.getStepExecution.mockResolvedValue(step);
      const h = handler('GET', path)!;
      const request = {
        params: { executionId: 'ex-1', stepExecutionId: 'se-1' },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.getStepExecution).toHaveBeenCalledWith(
        { executionId: 'ex-1', id: 'se-1' },
        'default'
      );
      expect(result).toEqual({ type: 'ok', body: step });
    });

    it('should return not found when step execution does not exist', async () => {
      mockApi.getStepExecution.mockResolvedValue(undefined);
      const h = handler('GET', path)!;
      const request = {
        params: { executionId: 'ex-1', stepExecutionId: 'missing' },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockResponse.notFound).toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'notFound' });
    });
  });

  describe('POST /api/workflows/executions/{executionId}/resume (resume_execution)', () => {
    const path = '/api/workflows/executions/{executionId}/resume';

    it('should register the route handler', () => {
      expect(handler('POST', path)).toBeDefined();
    });

    it('should call api.resumeWorkflowExecution with execution id, space, input, and request', async () => {
      mockApi.resumeWorkflowExecution.mockResolvedValue({
        resumedBy: 'user',
      });
      const h = handler('POST', path)!;
      const request = {
        params: { executionId: 'ex-1' },
        body: { input: { resume: true } },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.resumeWorkflowExecution).toHaveBeenCalledWith(
        'ex-1',
        'default',
        { resume: true },
        request
      );
      expect(result).toMatchObject({
        type: 'ok',
        body: {
          success: true,
          executionId: 'ex-1',
          message: 'Workflow resume scheduled',
        },
      });
    });
  });

  describe('GET /api/workflows/executions/{executionId}/logs (get_execution_logs)', () => {
    const path = '/api/workflows/executions/{executionId}/logs';

    it('should register the route handler', () => {
      expect(handler('GET', path)).toBeDefined();
    });

    it('should call api.getWorkflowExecutionLogs with execution id, space, and query params', async () => {
      const logsResponse = {
        logs: [{ id: 'log-1', timestamp: '2025-01-01T00:00:00Z', message: 'test' }],
        total: 1,
        size: 100,
        page: 1,
      };
      mockApi.getWorkflowExecutionLogs.mockResolvedValue(logsResponse);
      const h = handler('GET', path)!;
      const request = {
        params: { executionId: 'ex-1' },
        query: {
          stepExecutionId: 'step-ex-1',
          size: 50,
          page: 2,
          sortField: 'timestamp',
          sortOrder: 'desc',
        },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.getWorkflowExecutionLogs).toHaveBeenCalledWith({
        executionId: 'ex-1',
        spaceId: 'default',
        size: 50,
        page: 2,
        sortField: 'timestamp',
        sortOrder: 'desc',
        stepExecutionId: 'step-ex-1',
      });
      expect(result).toEqual({ type: 'ok', body: logsResponse });
    });

    it('should call api.getWorkflowExecutionLogs with defaults when optional params are omitted', async () => {
      const logsResponse = { logs: [], total: 0, size: 100, page: 1 };
      mockApi.getWorkflowExecutionLogs.mockResolvedValue(logsResponse);
      const h = handler('GET', path)!;
      const request = {
        params: { executionId: 'ex-1' },
        query: { size: 100, page: 1 },
      };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.getWorkflowExecutionLogs).toHaveBeenCalledWith({
        executionId: 'ex-1',
        spaceId: 'default',
        size: 100,
        page: 1,
        sortField: undefined,
        sortOrder: undefined,
        stepExecutionId: undefined,
      });
      expect(result).toEqual({ type: 'ok', body: logsResponse });
    });
  });

  describe('GET /api/workflows/executions/{executionId}/children (get_children_executions)', () => {
    const path = '/api/workflows/executions/{executionId}/children';

    it('should register the route handler', () => {
      expect(handler('GET', path)).toBeDefined();
    });

    it('should call api.getChildWorkflowExecutions with execution id and space id', async () => {
      const children = [{ id: 'child-1' }];
      mockApi.getChildWorkflowExecutions.mockResolvedValue(children);
      const h = handler('GET', path)!;
      const request = { params: { executionId: 'ex-1' } };

      const result = await h(mockContext, request as any, mockResponse as any);

      expect(mockApi.getChildWorkflowExecutions).toHaveBeenCalledWith('ex-1', 'default');
      expect(result).toEqual({ type: 'ok', body: children });
    });
  });
});
