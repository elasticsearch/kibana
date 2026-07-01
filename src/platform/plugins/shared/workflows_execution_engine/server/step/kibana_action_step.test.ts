/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { UIAM_INTERNAL_CLIENT_AUTH_HEADER } from '@kbn/core-security-server';
import type { KibanaGraphNode } from '@kbn/workflows/graph/types';

import { KibanaActionStepImpl } from './kibana_action_step';
import type { RunStepResult } from './node_implementation';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { WorkflowContextManager } from '../workflow_context_manager/workflow_context_manager';
import type { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../workflow_event_logger';

// Mock fetch globally
global.fetch = jest.fn();
const mockedFetch = global.fetch as jest.MockedFunction<typeof fetch>;

const runStep = (
  step: KibanaActionStepImpl,
  input?: Record<string, unknown>
): Promise<RunStepResult> =>
  (step as unknown as { _run(i?: Record<string, unknown>): Promise<RunStepResult> })._run(input);

function createMockReadableStream(data: string) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  let consumed = false;
  return {
    getReader: () => ({
      read: async () => {
        if (consumed) return { done: true, value: undefined };
        consumed = true;
        return { done: false, value: encoded };
      },
      releaseLock: () => {},
      cancel: jest.fn(),
    }),
  };
}

function createMockBinaryStream(data: Uint8Array) {
  let consumed = false;
  return {
    getReader: () => ({
      read: async () => {
        if (consumed) return { done: true, value: undefined };
        consumed = true;
        return { done: false, value: data };
      },
      releaseLock: () => {},
      cancel: jest.fn(),
    }),
  };
}

function createMockResponse(body: object, status = 200) {
  const json = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(json),
    body: createMockReadableStream(json),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as any;
}

function createMockBinaryResponse(data: Uint8Array, contentType: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: createMockBinaryStream(data),
    headers: new Headers({ 'content-type': contentType }),
  } as any;
}

// Mock undici
jest.mock('undici', () => ({
  Agent: jest.fn().mockImplementation((options) => ({
    _options: options, // Store options for testing
  })),
}));

describe('KibanaActionStepImpl - Fetcher Configuration', () => {
  let mockStepExecutionRuntime: jest.Mocked<StepExecutionRuntime>;
  let mockWorkflowRuntime: jest.Mocked<WorkflowExecutionRuntimeManager>;
  let mockWorkflowLogger: jest.Mocked<IWorkflowEventLogger>;
  let mockContextManager: jest.Mocked<WorkflowContextManager>;

  beforeEach(() => {
    mockContextManager = {
      renderValueAccordingToContext: jest.fn((value) => value),
      getWorkflowSpaceId: jest.fn().mockReturnValue('default'),
      getCoreStart: jest.fn().mockReturnValue({
        http: {
          basePath: { publicBaseUrl: 'https://localhost:5601' },
        },
      }),
      getFakeRequest: jest.fn().mockReturnValue({
        headers: { authorization: 'ApiKey test-key' },
      }),
      getDependencies: jest.fn().mockReturnValue({}),
    } as any;

    mockStepExecutionRuntime = {
      contextManager: mockContextManager,
      startStep: jest.fn().mockResolvedValue(undefined),
      finishStep: jest.fn().mockResolvedValue(undefined),
      failStep: jest.fn().mockResolvedValue(undefined),
      setInput: jest.fn().mockResolvedValue(undefined),
      stepExecutionId: 'test-step-exec-id',
      node: {},
    } as any;

    mockWorkflowRuntime = {
      navigateToNextNode: jest.fn(),
    } as any;

    mockWorkflowLogger = {
      logInfo: jest.fn(),
      logError: jest.fn(),
      logDebug: jest.fn(),
    } as any;

    // Mock successful fetch response with readable body stream
    mockedFetch.mockResolvedValue(createMockResponse({ success: true }));

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('fetcher options extraction', () => {
    it('should extract fetcher options and not include them in request body', async () => {
      const stepWith = {
        title: 'Test Case',
        description: 'Test Description',
        owner: 'securitySolution',
        fetcher: {
          skip_ssl_verification: true,
        },
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      // Verify fetch was called
      expect(mockedFetch).toHaveBeenCalled();

      // Get the request body from the fetch call
      const fetchCall = mockedFetch.mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;
      const requestBody = fetchOptions.body ? JSON.parse(fetchOptions.body as string) : {};

      // Verify fetcher is NOT in the request body
      expect(requestBody.fetcher).toBeUndefined();

      // Verify actual case parameters are in the body
      expect(requestBody.title).toBe('Test Case');
      expect(requestBody.description).toBe('Test Description');
      expect(requestBody.owner).toBe('securitySolution');
    });

    it('should handle raw API format and extract fetcher', async () => {
      const stepWith = {
        request: {
          method: 'POST',
          path: '/api/cases',
          body: { title: 'Test' },
        },
        fetcher: {
          skip_ssl_verification: true,
        },
      };
      const step = {
        id: 'test_step',
        type: 'kibana.api',
        stepId: 'test_step',
        stepType: 'kibana.api',
        configuration: { name: 'test_step', type: 'kibana.api', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      expect(mockedFetch).toHaveBeenCalled();

      const fetchCall = mockedFetch.mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;
      const requestBody = fetchOptions.body ? JSON.parse(fetchOptions.body as string) : {};

      // Verify fetcher is NOT in the request body
      expect(requestBody.fetcher).toBeUndefined();
      expect(requestBody.title).toBe('Test');
    });

    it('should work without fetcher options', async () => {
      const stepWith = {
        title: 'Test Case',
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      expect(mockedFetch).toHaveBeenCalled();

      const fetchCall = mockedFetch.mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;

      // Should not have dispatcher (Agent) when no fetcher options
      expect((fetchOptions as any).dispatcher).toBeUndefined();
    });
  });

  describe('SSL verification', () => {
    it('should create undici Agent with rejectUnauthorized: false when skip_ssl_verification is true', async () => {
      const { Agent } = await import('undici');
      const MockedAgent = Agent as jest.MockedClass<typeof Agent>;
      MockedAgent.mockClear();

      const stepWith = {
        title: 'Test',
        fetcher: {
          skip_ssl_verification: true,
        },
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      // Verify Agent was created with correct options
      expect(MockedAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          connect: expect.objectContaining({
            rejectUnauthorized: false,
          }),
        })
      );
    });

    it('should not create Agent when skip_ssl_verification is false or undefined', async () => {
      const { Agent } = await import('undici');
      const MockedAgent = Agent as jest.MockedClass<typeof Agent>;
      MockedAgent.mockClear();

      const stepWith = {
        title: 'Test',
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      // Agent should not be created
      expect(MockedAgent).not.toHaveBeenCalled();
    });
  });

  describe('other fetcher options', () => {
    it('should pass keep_alive option to Agent', async () => {
      const { Agent } = await import('undici');
      const MockedAgent = Agent as jest.MockedClass<typeof Agent>;
      MockedAgent.mockClear();

      const stepWith = {
        title: 'Test',
        fetcher: {
          keep_alive: true,
        },
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      expect(MockedAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          keepAliveTimeout: 60000,
          keepAliveMaxTimeout: 600000,
        })
      );
    });

    it('should set redirect mode when follow_redirects is false', async () => {
      const { Agent } = await import('undici');
      const MockedAgent = Agent as jest.MockedClass<typeof Agent>;
      MockedAgent.mockClear();

      const stepWith = {
        title: 'Test',
        fetcher: {
          follow_redirects: false,
        },
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      const fetchCall = mockedFetch.mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;

      expect(fetchOptions.redirect).toBe('manual');
    });

    it('should pass max_redirects to Agent', async () => {
      const { Agent } = await import('undici');
      const MockedAgent = Agent as jest.MockedClass<typeof Agent>;
      MockedAgent.mockClear();

      const stepWith = {
        title: 'Test',
        fetcher: {
          max_redirects: 10,
        },
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      expect(MockedAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRedirections: 10,
        })
      );
    });

    it('should pass through custom undici options', async () => {
      const { Agent } = await import('undici');
      const MockedAgent = Agent as jest.MockedClass<typeof Agent>;
      MockedAgent.mockClear();

      const stepWith = {
        title: 'Test',
        fetcher: {
          connections: 100,
          pipelining: 10,
        } as Record<string, unknown>,
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      expect(MockedAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          connections: 100,
          pipelining: 10,
        })
      );
    });
  });

  describe('use_server_info option', () => {
    it('should use server info URL when use_server_info is true', async () => {
      mockContextManager.getCoreStart.mockReturnValue({
        http: {
          basePath: {
            publicBaseUrl: 'https://public.kibana.example.com',
            prepend: jest.fn((path: string) => `/base${path}`),
          },
          getServerInfo: jest.fn(() => ({
            protocol: 'https',
            hostname: 'internal-host',
            port: 5601,
          })),
        },
      } as any);

      const stepWith = {
        method: 'GET',
        path: '/api/status',
        use_server_info: true,
      };
      const step = {
        id: 'test_step',
        type: 'kibana.request',
        stepId: 'test_step',
        stepType: 'kibana.request',
        configuration: { name: 'test_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      const fetchCall = mockedFetch.mock.calls[0];
      const fetchedUrl = fetchCall[0] as string;
      expect(fetchedUrl).toBe('https://internal-host:5601/base/api/status');
      expect(fetchedUrl).not.toContain('public.kibana.example.com');
    });
  });

  describe('use_localhost option', () => {
    it('should use localhost URL when use_localhost is true', async () => {
      const stepWith = {
        method: 'GET',
        path: '/api/status',
        use_localhost: true,
      };
      const step = {
        id: 'test_step',
        type: 'kibana.request',
        stepId: 'test_step',
        stepType: 'kibana.request',
        configuration: { name: 'test_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      const fetchCall = mockedFetch.mock.calls[0];
      const fetchedUrl = fetchCall[0] as string;
      expect(fetchedUrl).toBe('http://localhost:5601/api/status');
    });
  });

  describe('use_server_info and use_localhost mutual exclusion', () => {
    it('should throw an error when both use_server_info and use_localhost are true', async () => {
      const stepWith = {
        method: 'GET',
        path: '/api/status',
        use_server_info: true,
        use_localhost: true,
      };
      const step = {
        id: 'test_step',
        type: 'kibana.request',
        stepId: 'test_step',
        stepType: 'kibana.request',
        configuration: { name: 'test_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await expect(runStep(kibanaStep, stepWith)).rejects.toThrow(
        'Cannot set both use_server_info and use_localhost'
      );
      expect(mockedFetch).not.toHaveBeenCalled();
    });
  });

  it('should reject invalid HTTP method without calling fetch', async () => {
    const stepWith = {
      method: 'POSTs',
      path: '/api/status',
    };
    const step = {
      id: 'test_step',
      type: 'kibana.request',
      stepId: 'test_step',
      stepType: 'kibana.request',
      configuration: { name: 'test_step', type: 'kibana.request', with: stepWith },
    } as unknown as KibanaGraphNode;

    const kibanaStep = new KibanaActionStepImpl(
      step,
      mockStepExecutionRuntime,
      mockWorkflowRuntime,
      mockWorkflowLogger
    );

    const result = await runStep(kibanaStep, stepWith);

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain('Invalid HTTP method "POSTs"');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  describe('debug option', () => {
    it('should include _debug with fullUrl in output when debug is true', async () => {
      const stepWith = {
        method: 'POST',
        path: '/api/cases',
        body: { title: 'Test' },
        debug: true,
      };
      const step = {
        id: 'test_step',
        type: 'kibana.request',
        stepId: 'test_step',
        stepType: 'kibana.request',
        configuration: { name: 'test_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);
      const output = result.output as Record<string, any>;

      expect(output._debug).toBeDefined();
      expect(output._debug.fullUrl).toBe('https://localhost:5601/api/cases');
      expect(output._debug.method).toBe('POST');
    });

    it('should not include _debug when debug is false or absent', async () => {
      const stepWith = {
        method: 'GET',
        path: '/api/status',
      };
      const step = {
        id: 'test_step',
        type: 'kibana.request',
        stepId: 'test_step',
        stepType: 'kibana.request',
        configuration: { name: 'test_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);
      const output = result.output as Record<string, any>;

      expect(output._debug).toBeUndefined();
    });

    it('should include _debug in error details when debug is true and request fails', async () => {
      mockedFetch.mockResolvedValue(createMockResponse({}, 500));

      const stepWith = {
        method: 'POST',
        path: '/api/bad-endpoint',
        debug: true,
      };
      const step = {
        id: 'test_step',
        type: 'kibana.request',
        stepId: 'test_step',
        stepType: 'kibana.request',
        configuration: { name: 'test_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);

      expect(result.error).toBeDefined();
      const details = result.error!.details as Record<string, any>;
      expect(details._debug).toBeDefined();
      expect(details._debug.kibanaUrl).toBe('https://localhost:5601');
    });

    it('should include fullUrl with query params in _debug output', async () => {
      const stepWith = {
        method: 'GET',
        path: '/api/cases',
        query: { page: '1', perPage: '10' },
        debug: true,
      };
      const step = {
        id: 'test_step',
        type: 'kibana.request',
        stepId: 'test_step',
        stepType: 'kibana.request',
        configuration: { name: 'test_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);

      const output = result.output as Record<string, any>;
      expect(output._debug.fullUrl).toBe('https://localhost:5601/api/cases?page=1&perPage=10');
    });
  });

  describe('meta params not forwarded to HTTP request', () => {
    it('should not include use_server_info, use_localhost, or debug in request body', async () => {
      const stepWith = {
        title: 'Test Case',
        description: 'Test Description',
        owner: 'securitySolution',
        use_server_info: false,
        use_localhost: false,
        debug: true,
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      const fetchCall = mockedFetch.mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;
      const requestBody = fetchOptions.body ? JSON.parse(fetchOptions.body as string) : {};

      expect(requestBody.use_server_info).toBeUndefined();
      expect(requestBody.use_localhost).toBeUndefined();
      expect(requestBody.debug).toBeUndefined();
      expect(requestBody.title).toBe('Test Case');
    });
  });

  describe('combined fetcher options', () => {
    it('should handle multiple fetcher options together', async () => {
      const { Agent } = await import('undici');
      const MockedAgent = Agent as jest.MockedClass<typeof Agent>;
      MockedAgent.mockClear();

      const stepWith = {
        title: 'Test',
        fetcher: {
          skip_ssl_verification: true,
          keep_alive: true,
          max_redirects: 5,
          follow_redirects: false,
        },
      };
      const step = {
        id: 'test_step',
        type: 'kibana.createCase',
        stepId: 'test_step',
        stepType: 'kibana.createCase',
        configuration: { name: 'test_step', type: 'kibana.createCase', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      // Verify Agent was created with all options
      expect(MockedAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          connect: expect.objectContaining({
            rejectUnauthorized: false,
          }),
          keepAliveTimeout: 60000,
          keepAliveMaxTimeout: 600000,
          maxRedirections: 5,
        })
      );

      // Verify fetch options
      const fetchCall = mockedFetch.mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;

      expect(fetchOptions.redirect).toBe('manual');
    });
  });

  describe('response size limit enforcement (Layer 1)', () => {
    it('should abort fetch mid-stream when body exceeds max-step-size', async () => {
      const largeBody = JSON.stringify({ data: 'x'.repeat(500) });
      const cancelFn = jest.fn();
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: {
          getReader: () => {
            let consumed = false;
            return {
              read: async () => {
                if (consumed) return { done: true, value: undefined };
                consumed = true;
                return { done: false, value: new TextEncoder().encode(largeBody) };
              },
              releaseLock: () => {},
              cancel: cancelFn,
            };
          },
        },
      } as any);

      const stepWith = {
        request: { method: 'GET', path: '/api/status' },
      };
      const step = {
        id: 'size_limit_step',
        type: 'kibana.request',
        stepId: 'size_limit_step',
        stepType: 'kibana.request',
        configuration: {
          name: 'size_limit_step',
          type: 'kibana.request',
          'max-step-size': '100b',
          with: stepWith,
        },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);

      expect(result.error).toBeDefined();
      expect(result.error!.type).toBe('StepSizeLimitExceeded');
      expect(cancelFn).toHaveBeenCalled();
    });

    it('should truncate large error response bodies', async () => {
      const largeErrorBody = 'E'.repeat(2 * 1024 * 1024); // 2MB error
      mockedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        body: {
          getReader: () => {
            let consumed = false;
            return {
              read: async () => {
                if (consumed) return { done: true, value: undefined };
                consumed = true;
                return { done: false, value: new TextEncoder().encode(largeErrorBody) };
              },
              releaseLock: () => {},
              cancel: jest.fn(),
            };
          },
        },
      } as any);

      const stepWith = {
        request: { method: 'GET', path: '/api/broken' },
      };
      const step = {
        id: 'error_truncation_step',
        type: 'kibana.request',
        stepId: 'error_truncation_step',
        stepType: 'kibana.request',
        configuration: { name: 'error_truncation_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);

      expect(result.error).toBeDefined();
      expect(result.error!.message.length).toBeLessThan(1.5 * 1024 * 1024);
      expect(result.error!.message).toContain('... [truncated]');
    });
  });

  describe('empty response body handling (204 No Content)', () => {
    it('should succeed with empty output when response is 204 No Content', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 204,
      } as any);

      const stepWith = {
        request: { method: 'DELETE', path: '/api/alerting/rule/some-rule-id' },
      };
      const step = {
        id: 'delete_rule',
        type: 'kibana.request',
        stepId: 'delete_rule',
        stepType: 'kibana.request',
        configuration: { name: 'delete_rule', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);

      expect(result.error).toBeUndefined();
      expect(result.output).toEqual({});
    });

    it('should include _debug info for empty responses when debug is true', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 204,
      } as any);

      const stepWith = {
        request: {
          method: 'DELETE',
          path: '/api/alerting/rule/some-rule-id',
        },
        debug: true,
      };
      const step = {
        id: 'delete_rule',
        type: 'kibana.request',
        stepId: 'delete_rule',
        stepType: 'kibana.request',
        configuration: { name: 'delete_rule', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);

      expect(result.error).toBeUndefined();
      const output = result.output as Record<string, any>;
      expect(output._debug).toBeDefined();
      expect(output._debug.method).toBe('DELETE');
    });

    it('should still parse JSON normally when response body is non-empty', async () => {
      const jsonBody = JSON.stringify({ id: 'case-1', title: 'Test' });
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: {
          getReader: () => {
            let consumed = false;
            return {
              read: async () => {
                if (consumed) return { done: true, value: undefined };
                consumed = true;
                return { done: false, value: new TextEncoder().encode(jsonBody) };
              },
              releaseLock: () => {},
              cancel: jest.fn(),
            };
          },
        },
      } as any);

      const stepWith = {
        request: {
          method: 'POST',
          path: '/api/cases',
          body: { title: 'Test' },
        },
      };
      const step = {
        id: 'create_case',
        type: 'kibana.request',
        stepId: 'create_case',
        stepType: 'kibana.request',
        configuration: { name: 'create_case', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);

      expect(result.error).toBeUndefined();
      expect(result.output).toEqual({ id: 'case-1', title: 'Test' });
    });
  });

  describe('binary response handling', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]);

    const createKibanaRequestStep = (stepWith: Record<string, unknown>) => {
      const step = {
        id: 'binary_step',
        type: 'kibana.request',
        stepId: 'binary_step',
        stepType: 'kibana.request',
        configuration: { name: 'binary_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;
      return new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );
    };

    it('should return a Buffer for image/png responses', async () => {
      mockedFetch.mockResolvedValue(createMockBinaryResponse(pngBytes, 'image/png'));

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/reporting/jobs/download/abc' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/reporting/jobs/download/abc' },
      });

      expect(result.error).toBeUndefined();
      expect(Buffer.isBuffer(result.output)).toBe(true);
      expect(result.output).toEqual(Buffer.from(pngBytes));
    });

    it('should preserve exact bytes for binary content (no UTF-8 corruption)', async () => {
      mockedFetch.mockResolvedValue(createMockBinaryResponse(pngBytes, 'image/png'));

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/reporting/jobs/download/abc' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/reporting/jobs/download/abc' },
      });

      const outputBuffer = result.output as Buffer;
      expect(outputBuffer[0]).toBe(0x89);
      expect(outputBuffer[3]).toBe(0x47);
      expect(outputBuffer[8]).toBe(0xff);
      expect(outputBuffer[9]).toBe(0xfe);
      expect(outputBuffer.toString('base64')).toBe(Buffer.from(pngBytes).toString('base64'));
    });

    it('should return a Buffer for application/pdf responses', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff]);
      mockedFetch.mockResolvedValue(createMockBinaryResponse(pdfBytes, 'application/pdf'));

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/reporting/jobs/download/def' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/reporting/jobs/download/def' },
      });

      expect(result.error).toBeUndefined();
      expect(Buffer.isBuffer(result.output)).toBe(true);
      expect(result.output).toEqual(Buffer.from(pdfBytes));
    });

    it('should return a Buffer for application/octet-stream responses', async () => {
      mockedFetch.mockResolvedValue(createMockBinaryResponse(pngBytes, 'application/octet-stream'));

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/some-binary-endpoint' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/some-binary-endpoint' },
      });

      expect(result.error).toBeUndefined();
      expect(Buffer.isBuffer(result.output)).toBe(true);
    });

    it('should handle content-type with charset parameter', async () => {
      mockedFetch.mockResolvedValue(
        createMockBinaryResponse(pngBytes, 'image/png; charset=binary')
      );

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/reporting/jobs/download/abc' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/reporting/jobs/download/abc' },
      });

      expect(result.error).toBeUndefined();
      expect(Buffer.isBuffer(result.output)).toBe(true);
    });

    it('should still parse JSON for application/json responses', async () => {
      mockedFetch.mockResolvedValue(createMockResponse({ id: 'test' }));

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/cases/test' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/cases/test' },
      });

      expect(result.error).toBeUndefined();
      expect(Buffer.isBuffer(result.output)).toBe(false);
      expect(result.output).toEqual({ id: 'test' });
    });

    it('should treat unknown content types as binary', async () => {
      mockedFetch.mockResolvedValue(
        createMockBinaryResponse(pngBytes, 'application/x-custom-format')
      );

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/some-custom-endpoint' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/some-custom-endpoint' },
      });

      expect(result.error).toBeUndefined();
      expect(Buffer.isBuffer(result.output)).toBe(true);
    });

    it('should parse text/plain as text, not binary', async () => {
      const textBody = 'Hello plain text';
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        body: createMockReadableStream(textBody),
      } as any);

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/some-text-endpoint' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/some-text-endpoint' },
      });

      expect(result.error).toBeUndefined();
      expect(Buffer.isBuffer(result.output)).toBe(false);
      expect(result.output).toBe('Hello plain text');
    });

    it('should return a Buffer when Content-Type header is missing', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: createMockBinaryStream(pngBytes),
        headers: new Headers(),
      } as any);

      const kibanaStep = createKibanaRequestStep({
        request: { method: 'GET', path: '/api/reporting/jobs/download/abc' },
      });
      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/reporting/jobs/download/abc' },
      });

      expect(result.error).toBeUndefined();
      expect(Buffer.isBuffer(result.output)).toBe(true);
      expect(result.output).toEqual(Buffer.from(pngBytes));
    });

    it('should enforce size limits on binary responses', async () => {
      const largeBytes = new Uint8Array(500);
      largeBytes.fill(0xff);
      mockedFetch.mockResolvedValue(createMockBinaryResponse(largeBytes, 'image/png'));

      const step = {
        id: 'binary_size_step',
        type: 'kibana.request',
        stepId: 'binary_size_step',
        stepType: 'kibana.request',
        configuration: {
          name: 'binary_size_step',
          type: 'kibana.request',
          'max-step-size': '100b',
          with: { request: { method: 'GET', path: '/api/reporting/jobs/download/big' } },
        },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, {
        request: { method: 'GET', path: '/api/reporting/jobs/download/big' },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.type).toBe('StepSizeLimitExceeded');
    });
  });

  describe('JSON-body path integration', () => {
    it('propagates x-kibana-workflow-execution-id header on the JSON-body path', async () => {
      (mockStepExecutionRuntime as any).workflowExecution = { id: 'workflow-run-helper' };

      const stepWith = {
        request: { method: 'GET', path: '/api/status' },
      };
      const step = {
        id: 'status_step',
        type: 'kibana.request',
        stepId: 'status_step',
        stepType: 'kibana.request',
        configuration: { name: 'status_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      const fetchCall = mockedFetch.mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers['x-kibana-workflow-execution-id']).toBe('workflow-run-helper');
      expect(headers.Authorization).toBe('ApiKey test-key');
      expect(headers['x-elastic-internal-origin']).toBe('Kibana');
      expect(headers['kbn-xsrf']).toBe('true');
      // Non-UIAM credential must not be marked for UIAM client-auth forwarding.
      expect(headers[UIAM_INTERNAL_CLIENT_AUTH_HEADER]).toBeUndefined();
    });

    it('marks the request for UIAM client-auth when authenticating with a UIAM API key', async () => {
      mockContextManager.getFakeRequest.mockReturnValue({
        headers: { authorization: 'ApiKey essu_internal_api_key' },
      } as any);

      const stepWith = {
        request: { method: 'GET', path: '/api/status' },
      };
      const step = {
        id: 'status_step',
        type: 'kibana.request',
        stepId: 'status_step',
        stepType: 'kibana.request',
        configuration: { name: 'status_step', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      await runStep(kibanaStep, stepWith);

      const fetchOptions = mockedFetch.mock.calls[0][1] as RequestInit;
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers.Authorization).toBe('ApiKey essu_internal_api_key');
      expect(headers[UIAM_INTERNAL_CLIENT_AUTH_HEADER]).toBe('true');
    });

    it('preserves the raw body return shape on the JSON-body path (no envelope leak)', async () => {
      mockedFetch.mockResolvedValue(createMockResponse({ id: 'case-1', title: 'Helper Test' }));

      const stepWith = {
        request: { method: 'POST', path: '/api/cases', body: { title: 'Helper Test' } },
      };
      const step = {
        id: 'create_case',
        type: 'kibana.request',
        stepId: 'create_case',
        stepType: 'kibana.request',
        configuration: { name: 'create_case', type: 'kibana.request', with: stepWith },
      } as unknown as KibanaGraphNode;

      const kibanaStep = new KibanaActionStepImpl(
        step,
        mockStepExecutionRuntime,
        mockWorkflowRuntime,
        mockWorkflowLogger
      );

      const result = await runStep(kibanaStep, stepWith);

      expect(result.error).toBeUndefined();
      // Body returned directly, not as { status, headers, body }.
      expect(result.output).toEqual({ id: 'case-1', title: 'Helper Test' });
    });
  });
});
