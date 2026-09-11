/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getInferenceExecutorMock,
  getInferenceAdapterMock,
  resolveInferenceEndpointMock,
  createInferenceEndpointExecutorMock,
  inferenceEndpointAdapterMock,
} from './api.test.mocks';

import {
  concat,
  filter,
  firstValueFrom,
  isObservable,
  of,
  Subject,
  throwError,
  toArray,
} from 'rxjs';
import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';
import { httpServerMock } from '@kbn/core/server/mocks';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import {
  type ChatCompleteAPI,
  type ChatCompletionChunkEvent,
  MessageRole,
  isChatCompletionChunkEvent,
  isChatCompletionTokenCountEvent,
  createInferenceProviderError,
  InferenceTaskErrorCode,
} from '@kbn/inference-common';
import {
  createInferenceConnectorAdapterMock,
  createInferenceConnectorMock,
  createInferenceExecutorMock,
  createRegexWorkerServiceMock,
  chunkEvent,
  tokensEvent,
} from '../test_utils';
import { createChatCompleteApi } from './api';
import { createChatCompleteCallbackApi } from './callback_api';
import { InferenceEndpointIdCache } from '../util/inference_endpoint_id_cache';
import type { WorkflowAnonymizationProvider } from '../workflow_anonymization_provider';

describe('createChatCompleteApi', () => {
  let request: ReturnType<typeof httpServerMock.createKibanaRequest>;
  let logger: MockedLogger;
  let actions: ReturnType<typeof actionsMock.createStart>;
  let inferenceAdapter: ReturnType<typeof createInferenceConnectorAdapterMock>;
  let inferenceConnector: ReturnType<typeof createInferenceConnectorMock>;
  let inferenceExecutor: ReturnType<typeof createInferenceExecutorMock>;
  let regexWorker: ReturnType<typeof createRegexWorkerServiceMock>;
  let endpointIdCache: InferenceEndpointIdCache;

  let chatComplete: ChatCompleteAPI;
  const mockEsClient = {
    get: jest.fn().mockResolvedValue({
      _source: {
        id: 'existing-replacements-id',
        namespace: 'default',
        replacements: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'inference',
      },
    }),
    index: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    indices: {
      exists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({}),
    },
    ml: {
      inferTrainedModel: jest.fn(),
    },
    inference: {
      get: jest.fn().mockResolvedValue({ endpoints: [] }),
    },
  } as any;
  beforeEach(() => {
    request = httpServerMock.createKibanaRequest();
    logger = loggerMock.create();
    actions = actionsMock.createStart();
    regexWorker = createRegexWorkerServiceMock();
    endpointIdCache = new InferenceEndpointIdCache({ esClient: mockEsClient });
    const callbackApi = createChatCompleteCallbackApi({
      request,
      namespace: 'default',
      actions,
      logger,
      anonymizationRulesPromise: Promise.resolve([]),
      regexWorker,
      esClient: mockEsClient,
      endpointIdCache,
    });
    chatComplete = createChatCompleteApi({
      callbackApi,
    });

    inferenceAdapter = createInferenceConnectorAdapterMock();
    inferenceAdapter.chatComplete.mockReturnValue(of(chunkEvent('chunk-1')));
    getInferenceAdapterMock.mockReturnValue(inferenceAdapter);

    inferenceConnector = createInferenceConnectorMock();

    inferenceExecutor = createInferenceExecutorMock({ connector: inferenceConnector });
    getInferenceExecutorMock.mockResolvedValue(inferenceExecutor);
  });

  afterEach(() => {
    getInferenceExecutorMock.mockReset();
    getInferenceAdapterMock.mockReset();
    mockEsClient.get.mockClear();
    mockEsClient.index.mockClear();
    mockEsClient.update.mockClear();
    resolveInferenceEndpointMock.mockReset();
    createInferenceEndpointExecutorMock.mockReset();
    inferenceEndpointAdapterMock.chatComplete.mockReset();
  });

  it('calls `getInferenceExecutor` with the right parameters', async () => {
    await chatComplete({
      connectorId: 'connectorId',
      messages: [{ role: MessageRole.User, content: 'question' }],
      maxRetries: 0,
    });

    expect(getInferenceExecutorMock).toHaveBeenCalledTimes(1);
    expect(getInferenceExecutorMock).toHaveBeenCalledWith({
      connectorId: 'connectorId',
      request,
      actions,
      esClient: mockEsClient,
      logger,
    });
  });

  it('calls `getInferenceAdapter` with the right parameters', async () => {
    await chatComplete({
      connectorId: 'connectorId',
      messages: [{ role: MessageRole.User, content: 'question' }],
      maxRetries: 0,
    });

    expect(getInferenceAdapterMock).toHaveBeenCalledTimes(1);
    expect(getInferenceAdapterMock).toHaveBeenCalledWith(inferenceConnector.type);
  });

  it('calls `inferenceAdapter.chatComplete` with the right parameters', async () => {
    await chatComplete({
      connectorId: 'connectorId',
      messages: [{ role: MessageRole.User, content: 'question' }],
      temperature: 0.7,
      modelName: 'gpt-4o',
      maxRetries: 0,
    });

    expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(1);
    expect(inferenceAdapter.chatComplete).toHaveBeenCalledWith({
      messages: [{ role: MessageRole.User, content: 'question' }],
      executor: inferenceExecutor,
      logger,
      temperature: 0.7,
      modelName: 'gpt-4o',
    });
  });

  it('uses original event data and workflow-transformed connector input in workflow mode', async () => {
    const protectedMessages = [{ role: MessageRole.User, content: 'protected question' }] as const;
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async ({ event, namespace, proceed }) => {
        expect(event).toEqual({
          system: 'original system',
          messages: [{ role: MessageRole.User, content: 'original question' }],
          sessionId: 'session-a',
          agentId: 'agent-a',
        });
        expect(namespace).toBe('space-a');
        await proceed.invoke({ messages: protectedMessages, tokenMap: {} });
        return { matched: true, content: 'workflow restored' };
      }),
    };
    const workflowCallbackApi = createChatCompleteCallbackApi({
      request,
      namespace: 'space-a',
      actions,
      logger,
      // Workflow mode must not wait for or consume the legacy anonymization rule source.
      anonymizationRulesPromise: new Promise<never>(() => {}),
      regexWorker,
      esClient: mockEsClient,
      endpointIdCache,
      anonymization: { saltPromise: Promise.resolve('server-managed-salt') },
      workflowAnonymization: { provider, failureMode: 'block', preLLMTimeoutMs: 0 },
    });
    const workflowChatComplete = createChatCompleteApi({ callbackApi: workflowCallbackApi });

    await expect(
      workflowChatComplete({
        connectorId: 'connectorId',
        system: 'original system',
        messages: [{ role: MessageRole.User, content: 'original question' }],
        sessionId: 'session-a',
        metadata: { agentId: 'agent-a' },
        maxRetries: 0,
      })
    ).resolves.toEqual(expect.objectContaining({ content: 'workflow restored' }));
    expect(inferenceAdapter.chatComplete).toHaveBeenCalledWith(
      expect.objectContaining({ messages: protectedMessages })
    );
  });

  it('does not retry a workflow connector call after streaming has started', async () => {
    const providerError = createInferenceProviderError('stream failed', { status: 500 });
    inferenceAdapter.chatComplete.mockReturnValue(
      concat(
        of(chunkEvent('partial')),
        throwError(() => providerError)
      )
    );
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async ({ proceed }) => {
        await proceed.invoke({
          messages: [{ role: MessageRole.User, content: 'protected question' }],
          tokenMap: {},
        });
        return { matched: true, content: 'unreachable' };
      }),
    };
    const workflowChatComplete = createChatCompleteApi({
      callbackApi: createChatCompleteCallbackApi({
        request,
        namespace: 'space-a',
        actions,
        logger,
        anonymizationRulesPromise: Promise.resolve([]),
        regexWorker,
        esClient: mockEsClient,
        endpointIdCache,
        anonymization: { saltPromise: Promise.resolve('server-managed-salt') },
        workflowAnonymization: { provider, failureMode: 'allow_unsafe', preLLMTimeoutMs: 0 },
      }),
    });

    await expect(
      workflowChatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'original question' }],
        maxRetries: 1,
        retryConfiguration: { retryOn: 'all', initialDelay: 0 },
      })
    ).rejects.toBe(providerError);
    expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(1);
  });

  it('forwards `maxContentLength` down to `inferenceAdapter.chatComplete`', async () => {
    await chatComplete({
      connectorId: 'connectorId',
      messages: [{ role: MessageRole.User, content: 'question' }],
      maxContentLength: 10 * 1024 * 1024,
      maxRetries: 0,
    });

    expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(1);
    expect(inferenceAdapter.chatComplete).toHaveBeenCalledWith(
      expect.objectContaining({ maxContentLength: 10 * 1024 * 1024 })
    );
  });

  it('throws if the connector is not compatible', async () => {
    getInferenceAdapterMock.mockReturnValue(undefined);

    await expect(
      chatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"Adapter for type .gen-ai not implemented"`);
  });

  describe('response mode', () => {
    it('reuses carried replacementsId when found', async () => {
      inferenceAdapter.chatComplete.mockReturnValue(of(chunkEvent('chunk-1')));

      const response = await chatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        metadata: {
          anonymization: {
            replacementsId: 'existing-replacements-id',
          },
        },
        maxRetries: 0,
      });

      expect(mockEsClient.get).toHaveBeenCalled();
      expect(mockEsClient.get.mock.calls[0][0]).toEqual(
        expect.objectContaining({ id: 'existing-replacements-id' })
      );
      expect(mockEsClient.update).toHaveBeenCalledTimes(1);
      expect(mockEsClient.index).toHaveBeenCalledTimes(0);
      expect(response.metadata?.anonymization?.replacementsId).toBe('existing-replacements-id');
    });

    it('falls back to a new replacementsId when carried one is missing', async () => {
      mockEsClient.get.mockRejectedValueOnce({ meta: { statusCode: 404 } });
      inferenceAdapter.chatComplete.mockReturnValue(of(chunkEvent('chunk-1')));

      const response = await chatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        metadata: {
          anonymization: {
            replacementsId: 'stale-replacements-id',
          },
        },
        maxRetries: 0,
      });

      expect(mockEsClient.get).toHaveBeenCalledTimes(1);
      expect(mockEsClient.update).toHaveBeenCalledTimes(0);
      expect(mockEsClient.index).toHaveBeenCalledTimes(1);
      expect(response.metadata?.anonymization?.replacementsId).not.toBe('stale-replacements-id');
      expect(response.metadata?.anonymization?.replacementsId).toEqual(expect.any(String));
    });

    it('does not persist replacements when there is no anonymization and no carried id', async () => {
      inferenceAdapter.chatComplete.mockReturnValue(of(chunkEvent('chunk-1')));

      const turn1 = await chatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'turn-1' }],
        maxRetries: 0,
      });

      await chatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'turn-2' }],
        maxRetries: 0,
      });

      expect(turn1.metadata?.anonymization?.replacementsId).toBeUndefined();
      expect(mockEsClient.get).toHaveBeenCalledTimes(0);
      expect(mockEsClient.index).toHaveBeenCalledTimes(0);
      expect(mockEsClient.update).toHaveBeenCalledTimes(0);
    });

    it('returns a promise resolving with the response', async () => {
      inferenceAdapter.chatComplete.mockReturnValue(
        of(chunkEvent('chunk-1'), chunkEvent('chunk-2'))
      );

      const response = await chatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(response).toEqual({
        content: 'chunk-1chunk-2',
        metadata: undefined,
        toolCalls: [],
      });
    });

    it('implicitly retries errors when configured to', async () => {
      let count = 0;
      inferenceAdapter.chatComplete.mockImplementation(() => {
        if (++count < 3) {
          throw new Error(`Failing on attempt ${count}`);
        }
        return of(chunkEvent('chunk-1'), chunkEvent('chunk-2'));
      });

      const response = await chatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 2,
        retryConfiguration: {
          retryOn: 'all',
          initialDelay: 1,
          backoffMultiplier: 1,
        },
      });

      expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(3);

      expect(response).toEqual({
        content: 'chunk-1chunk-2',
        metadata: undefined,
        toolCalls: [],
      });
    });

    it('returns the successful attempt token counts when a tool validation error is retried', async () => {
      let count = 0;
      inferenceAdapter.chatComplete.mockImplementation(() => {
        count++;
        const isFirstAttempt = count === 1;
        return of(
          chunkEvent('', [
            {
              index: 0,
              toolCallId: `call-${count}`,
              function: {
                name: 'myTool',
                arguments: isFirstAttempt ? 'not-valid-json{' : '{}',
              },
            },
          ]),
          tokensEvent(
            isFirstAttempt
              ? { prompt: 1, completion: 2, total: 3 }
              : { prompt: 4, completion: 5, total: 6 },
            { model: isFirstAttempt ? 'failed_attempt_model' : 'success_attempt_model' }
          )
        );
      });

      const response = await chatComplete({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        tools: {
          myTool: {
            description: 'my tool',
            schema: { type: 'object', properties: {} },
          },
        },
        maxRetries: 1,
        retryConfiguration: {
          initialDelay: 1,
          backoffMultiplier: 1,
        },
      });

      expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(2);
      expect(response.tokens).toEqual({ prompt: 4, completion: 5, total: 6 });
      expect(response.model).toBe('success_attempt_model');
      expect(response.toolCalls).toEqual([
        { toolCallId: 'call-2', function: { name: 'myTool', arguments: {} } },
      ]);
    });

    describe('request cancellation', () => {
      it('passes the abortSignal down to `inferenceAdapter.chatComplete`', async () => {
        const abortController = new AbortController();

        await chatComplete({
          connectorId: 'connectorId',
          messages: [{ role: MessageRole.User, content: 'question' }],
          abortSignal: abortController.signal,
          maxRetries: 0,
        });

        expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(1);
        expect(inferenceAdapter.chatComplete).toHaveBeenCalledWith({
          messages: [{ role: MessageRole.User, content: 'question' }],
          executor: inferenceExecutor,
          abortSignal: abortController.signal,
          logger,
        });
      });

      it('throws an error when the signal is triggered', async () => {
        const abortController = new AbortController();

        const subject = new Subject<ChatCompletionChunkEvent>();
        inferenceAdapter.chatComplete.mockReturnValue(subject.asObservable());

        subject.next(chunkEvent('chunk-1'));

        let caughtError: any;

        const promise = chatComplete({
          connectorId: 'connectorId',
          messages: [{ role: MessageRole.User, content: 'question' }],
          abortSignal: abortController.signal,
          maxRetries: 1,
        }).catch((err) => {
          caughtError = err;
        });

        abortController.abort();

        await promise;

        expect(caughtError).toBeInstanceOf(Error);
        expect(caughtError.message).toContain('Request was aborted');
      });
    });
  });

  describe('stream mode', () => {
    it('returns an observable of events', async () => {
      inferenceAdapter.chatComplete.mockReturnValue(
        of(chunkEvent('chunk-1'), chunkEvent('chunk-2'))
      );

      const events$ = chatComplete({
        stream: true,
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(isObservable(events$)).toBe(true);

      const events = await firstValueFrom(events$.pipe(toArray()));
      expect(events).toEqual([
        {
          content: 'chunk-1',
          metadata: undefined,
          tool_calls: [],
          type: 'chatCompletionChunk',
        },
        {
          content: 'chunk-2',
          metadata: undefined,
          tool_calls: [],
          type: 'chatCompletionChunk',
        },
        {
          content: 'chunk-1chunk-2',
          metadata: undefined,
          toolCalls: [],
          type: 'chatCompletionMessage',
        },
      ]);
    });

    it('only emits the successful attempt token counts when a tool validation error is retried', async () => {
      let count = 0;
      inferenceAdapter.chatComplete.mockImplementation(() => {
        count++;
        const isFirstAttempt = count === 1;
        return of(
          chunkEvent('', [
            {
              index: 0,
              toolCallId: `call-${count}`,
              function: {
                name: 'myTool',
                arguments: isFirstAttempt ? 'not-valid-json{' : '{}',
              },
            },
          ]),
          tokensEvent(
            isFirstAttempt
              ? { prompt: 1, completion: 2, total: 3 }
              : { prompt: 4, completion: 5, total: 6 },
            { model: isFirstAttempt ? 'failed_attempt_model' : 'success_attempt_model' }
          )
        );
      });

      const events$ = chatComplete({
        stream: true,
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        tools: {
          myTool: {
            description: 'my tool',
            schema: { type: 'object', properties: {} },
          },
        },
        maxRetries: 1,
        retryConfiguration: {
          initialDelay: 1,
          backoffMultiplier: 1,
        },
      });

      const events = await firstValueFrom(events$.pipe(toArray()));
      const tokenEvents = events.filter(isChatCompletionTokenCountEvent);

      expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(2);
      expect(tokenEvents).toEqual([
        tokensEvent({ prompt: 4, completion: 5, total: 6 }, { model: 'success_attempt_model' }),
      ]);
    });

    it('emits the token counts before the error when the call fails terminally', async () => {
      inferenceAdapter.chatComplete.mockImplementation(() => {
        return of(
          chunkEvent('', [
            {
              index: 0,
              toolCallId: 'call-1',
              function: { name: 'myTool', arguments: 'not-valid-json{' },
            },
          ]),
          tokensEvent({ prompt: 1, completion: 2, total: 3 }, { model: 'failed_attempt_model' })
        );
      });

      const events$ = chatComplete({
        stream: true,
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        tools: {
          myTool: {
            description: 'my tool',
            schema: { type: 'object', properties: {} },
          },
        },
        maxRetries: 0,
      });

      const emitted: unknown[] = [];
      let caughtError: any;
      await new Promise<void>((resolve) => {
        events$.subscribe({
          next: (event) => emitted.push(event),
          error: (err) => {
            caughtError = err;
            resolve();
          },
        });
      });

      expect(caughtError).toBeInstanceOf(Error);
      expect(emitted).toContainEqual(
        tokensEvent({ prompt: 1, completion: 2, total: 3 }, { model: 'failed_attempt_model' })
      );
    });

    it('implicitly retries errors when configured to', async () => {
      let count = 0;
      inferenceAdapter.chatComplete.mockImplementation(() => {
        count++;
        if (count < 3) {
          throw new Error(`Failing on attempt ${count}`);
        }
        return of(chunkEvent('chunk-1'), chunkEvent('chunk-2'));
      });

      const events$ = chatComplete({
        stream: true,
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 2,
        retryConfiguration: {
          retryOn: 'all',
          initialDelay: 1,
          backoffMultiplier: 1,
        },
      });

      const events = await firstValueFrom(
        events$.pipe(filter(isChatCompletionChunkEvent), toArray())
      );

      expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(3);

      expect(events).toEqual([
        {
          content: 'chunk-1',
          metadata: undefined,
          tool_calls: [],
          type: 'chatCompletionChunk',
        },
        {
          content: 'chunk-2',
          metadata: undefined,
          tool_calls: [],
          type: 'chatCompletionChunk',
        },
      ]);
    });

    describe('request cancellation', () => {
      it('throws an error when the signal is triggered', async () => {
        const abortController = new AbortController();

        const subject = new Subject<ChatCompletionChunkEvent>();
        inferenceAdapter.chatComplete.mockReturnValue(subject.asObservable());

        subject.next(chunkEvent('chunk-1'));

        let caughtError: any;

        const events$ = chatComplete({
          stream: true,
          connectorId: 'connectorId',
          messages: [{ role: MessageRole.User, content: 'question' }],
          abortSignal: abortController.signal,
          maxRetries: 0,
        });

        events$.subscribe({
          error: (err: any) => {
            caughtError = err;
          },
        });

        abortController.abort();

        expect(caughtError).toBeInstanceOf(Error);
        expect(caughtError.message).toContain('Request was aborted');
      });
    });
  });

  describe('default connector only restriction', () => {
    const createChatCompleteWithCheck = ({
      isDefaultConnectorOnly,
      getDefaultConnectorId,
    }: {
      isDefaultConnectorOnly: () => Promise<boolean>;
      getDefaultConnectorId: () => Promise<string | undefined>;
    }) => {
      const callbackApi = createChatCompleteCallbackApi({
        request,
        namespace: 'default',
        actions,
        logger,
        anonymizationRulesPromise: Promise.resolve([]),
        regexWorker,
        esClient: mockEsClient,
        endpointIdCache,
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });
      return createChatCompleteApi({ callbackApi });
    };

    it('blocks the call when the setting is enabled and another connector is used', async () => {
      const isDefaultConnectorOnly = jest.fn().mockResolvedValue(true);
      const getDefaultConnectorId = jest.fn().mockResolvedValue('default-connector-id');
      const chatCompleteWithCheck = createChatCompleteWithCheck({
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });

      await expect(
        chatCompleteWithCheck({
          connectorId: 'connectorId',
          messages: [{ role: MessageRole.User, content: 'question' }],
          maxRetries: 0,
        })
      ).rejects.toMatchObject({
        code: InferenceTaskErrorCode.requestError,
        message: expect.stringContaining('not allowed'),
      });

      expect(isDefaultConnectorOnly).toHaveBeenCalledTimes(1);
      expect(getInferenceExecutorMock).not.toHaveBeenCalled();
      expect(inferenceAdapter.chatComplete).not.toHaveBeenCalled();
    });

    it('allows the call when the connector matches the default connector', async () => {
      const isDefaultConnectorOnly = jest.fn().mockResolvedValue(true);
      const getDefaultConnectorId = jest.fn().mockResolvedValue('connectorId');
      const chatCompleteWithCheck = createChatCompleteWithCheck({
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });

      const response = await chatCompleteWithCheck({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(response.content).toBe('chunk-1');
      expect(getDefaultConnectorId).toHaveBeenCalledTimes(1);
      expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(1);
    });

    it('allows other connectors when the setting is disabled', async () => {
      const isDefaultConnectorOnly = jest.fn().mockResolvedValue(false);
      const getDefaultConnectorId = jest.fn().mockResolvedValue('default-connector-id');
      const chatCompleteWithCheck = createChatCompleteWithCheck({
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });

      const response = await chatCompleteWithCheck({
        connectorId: 'connectorId',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(response.content).toBe('chunk-1');
      expect(isDefaultConnectorOnly).toHaveBeenCalledTimes(1);
      expect(getDefaultConnectorId).not.toHaveBeenCalled();
      expect(inferenceAdapter.chatComplete).toHaveBeenCalledTimes(1);
    });

    it('blocks the call when the setting is enabled and no default connector resolves', async () => {
      const isDefaultConnectorOnly = jest.fn().mockResolvedValue(true);
      const getDefaultConnectorId = jest.fn().mockResolvedValue(undefined);
      const chatCompleteWithCheck = createChatCompleteWithCheck({
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });

      await expect(
        chatCompleteWithCheck({
          connectorId: 'connectorId',
          messages: [{ role: MessageRole.User, content: 'question' }],
          maxRetries: 0,
        })
      ).rejects.toMatchObject({
        code: InferenceTaskErrorCode.requestError,
        message: expect.stringContaining('not allowed'),
      });

      expect(inferenceAdapter.chatComplete).not.toHaveBeenCalled();
    });

    it('allows an inference endpoint whose id matches the default connector id', async () => {
      mockEsClient.inference.get.mockResolvedValueOnce({
        endpoints: [
          { inference_id: 'my-endpoint', task_type: 'chat_completion', service: 'openai' },
        ],
      });
      resolveInferenceEndpointMock.mockResolvedValue({
        inferenceId: 'my-endpoint',
        provider: 'openai',
        modelId: 'gpt-4o',
        taskType: 'chat_completion',
      });
      createInferenceEndpointExecutorMock.mockReturnValue({ invoke: jest.fn() });
      inferenceEndpointAdapterMock.chatComplete.mockReturnValue(of(chunkEvent('endpoint-chunk')));

      const isDefaultConnectorOnly = jest.fn().mockResolvedValue(true);
      const getDefaultConnectorId = jest.fn().mockResolvedValue('my-endpoint');
      const chatCompleteWithCheck = createChatCompleteWithCheck({
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });

      const response = await chatCompleteWithCheck({
        connectorId: 'my-endpoint',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(response.content).toBe('endpoint-chunk');
      expect(inferenceEndpointAdapterMock.chatComplete).toHaveBeenCalledTimes(1);
    });

    it('fails closed when reading the setting fails', async () => {
      const isDefaultConnectorOnly = jest.fn().mockRejectedValue(new Error('ui settings down'));
      const getDefaultConnectorId = jest.fn().mockResolvedValue('connectorId');
      const chatCompleteWithCheck = createChatCompleteWithCheck({
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });

      await expect(
        chatCompleteWithCheck({
          connectorId: 'connectorId',
          messages: [{ role: MessageRole.User, content: 'question' }],
          maxRetries: 0,
        })
      ).rejects.toMatchObject({
        code: InferenceTaskErrorCode.internalError,
        message: 'Failed to verify the default AI connector restriction',
      });

      expect(inferenceAdapter.chatComplete).not.toHaveBeenCalled();
    });

    it('fails closed when resolving the default connector fails', async () => {
      const isDefaultConnectorOnly = jest.fn().mockResolvedValue(true);
      const getDefaultConnectorId = jest.fn().mockRejectedValue(new Error('so client down'));
      const chatCompleteWithCheck = createChatCompleteWithCheck({
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });

      await expect(
        chatCompleteWithCheck({
          connectorId: 'connectorId',
          messages: [{ role: MessageRole.User, content: 'question' }],
          maxRetries: 0,
        })
      ).rejects.toMatchObject({
        code: InferenceTaskErrorCode.internalError,
        message: 'Failed to verify the default AI connector restriction',
      });

      expect(inferenceAdapter.chatComplete).not.toHaveBeenCalled();
    });

    it('blocks an inference endpoint whose id differs from the default connector id', async () => {
      const isDefaultConnectorOnly = jest.fn().mockResolvedValue(true);
      const getDefaultConnectorId = jest.fn().mockResolvedValue('other-endpoint');
      const chatCompleteWithCheck = createChatCompleteWithCheck({
        isDefaultConnectorOnly,
        getDefaultConnectorId,
      });

      await expect(
        chatCompleteWithCheck({
          connectorId: 'my-endpoint',
          messages: [{ role: MessageRole.User, content: 'question' }],
          maxRetries: 0,
        })
      ).rejects.toMatchObject({
        code: InferenceTaskErrorCode.requestError,
        message: expect.stringContaining('not allowed'),
      });

      expect(inferenceEndpointAdapterMock.chatComplete).not.toHaveBeenCalled();
    });
  });

  describe('upstream provider 404 errors', () => {
    it('does not rewrite upstream provider 404 errors as connector-not-found errors', async () => {
      const providerError = createInferenceProviderError(
        'API Error: Not Found - No endpoints found for google/gemini-3-pro-preview',
        { status: 404 }
      );
      inferenceAdapter.chatComplete.mockImplementation(() => {
        throw providerError;
      });

      await expect(
        chatComplete({
          connectorId: 'connectorId',
          messages: [{ role: MessageRole.User, content: 'question' }],
          maxRetries: 0,
        })
      ).rejects.toMatchObject({
        code: InferenceTaskErrorCode.providerError,
        message: expect.stringContaining('No endpoints found for google/gemini-3-pro-preview'),
      });
    });
  });

  describe('stack connector resolving to inference endpoint', () => {
    const mockEndpointExecutor = { invoke: jest.fn() };

    beforeEach(() => {
      const endpointConnector = createInferenceConnectorMock({
        connectorId: '.my-inference-endpoint',
        isInferenceEndpoint: true,
      });
      const executor = createInferenceExecutorMock({ connector: endpointConnector });
      getInferenceExecutorMock.mockResolvedValue(executor);

      resolveInferenceEndpointMock.mockResolvedValue({
        inferenceId: '.my-inference-endpoint',
        provider: 'openai',
        modelId: 'gpt-4o',
        taskType: 'chat_completion',
      });
      createInferenceEndpointExecutorMock.mockReturnValue(mockEndpointExecutor);
      inferenceEndpointAdapterMock.chatComplete.mockReturnValue(of(chunkEvent('endpoint-chunk')));
    });

    it('routes to the inference endpoint adapter when getInferenceExecutor returns an inference endpoint connector', async () => {
      await chatComplete({
        connectorId: 'stack-connector-id',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(getInferenceExecutorMock).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: 'stack-connector-id' })
      );
      expect(resolveInferenceEndpointMock).toHaveBeenCalledWith({
        inferenceId: '.my-inference-endpoint',
        esClient: mockEsClient,
      });
      expect(createInferenceEndpointExecutorMock).toHaveBeenCalledWith({
        inferenceId: '.my-inference-endpoint',
        esClient: mockEsClient,
      });
      expect(inferenceEndpointAdapterMock.chatComplete).toHaveBeenCalledTimes(1);
      expect(inferenceEndpointAdapterMock.chatComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          executor: mockEndpointExecutor,
          endpointModelId: 'gpt-4o',
          provider: 'openai',
        })
      );
      expect(getInferenceAdapterMock).not.toHaveBeenCalled();
    });

    it('returns the correct response in non-stream mode', async () => {
      const response = await chatComplete({
        connectorId: 'stack-connector-id',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(response).toEqual({
        content: 'endpoint-chunk',
        metadata: undefined,
        toolCalls: [],
      });
    });
  });

  describe('inference endpoint path (via connectorId resolution)', () => {
    const mockEndpointExecutor = { invoke: jest.fn() };

    beforeEach(() => {
      mockEsClient.inference.get.mockResolvedValue({
        endpoints: [
          { inference_id: 'my-endpoint', task_type: 'chat_completion', service: 'openai' },
        ],
      });

      resolveInferenceEndpointMock.mockResolvedValue({
        inferenceId: 'my-endpoint',
        provider: 'openai',
        modelId: 'gpt-4o',
        taskType: 'chat_completion',
      });
      createInferenceEndpointExecutorMock.mockReturnValue(mockEndpointExecutor);
      inferenceEndpointAdapterMock.chatComplete.mockReturnValue(of(chunkEvent('endpoint-chunk')));
    });

    it('does NOT call actionsClient or getInferenceExecutor when connectorId resolves to inference endpoint', async () => {
      await chatComplete({
        connectorId: 'my-endpoint',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(getInferenceExecutorMock).not.toHaveBeenCalled();
      expect(getInferenceAdapterMock).not.toHaveBeenCalled();
    });

    it('calls resolveInferenceEndpoint with the correct parameters', async () => {
      await chatComplete({
        connectorId: 'my-endpoint',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(resolveInferenceEndpointMock).toHaveBeenCalledWith({
        inferenceId: 'my-endpoint',
        esClient: mockEsClient,
      });
    });

    it('calls createInferenceEndpointExecutor with the correct parameters', async () => {
      await chatComplete({
        connectorId: 'my-endpoint',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(createInferenceEndpointExecutorMock).toHaveBeenCalledWith({
        inferenceId: 'my-endpoint',
        esClient: mockEsClient,
      });
    });

    it('calls the inference endpoint adapter with the correct parameters', async () => {
      await chatComplete({
        connectorId: 'my-endpoint',
        messages: [{ role: MessageRole.User, content: 'question' }],
        temperature: 0.5,
        modelName: 'gpt-4o-mini',
        maxRetries: 0,
      });

      expect(inferenceEndpointAdapterMock.chatComplete).toHaveBeenCalledTimes(1);
      expect(inferenceEndpointAdapterMock.chatComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: MessageRole.User, content: 'question' }],
          executor: mockEndpointExecutor,
          temperature: 0.5,
          modelName: 'gpt-4o-mini',
          endpointModelId: 'gpt-4o',
          provider: 'openai',
          logger,
        })
      );
    });

    it('returns a promise with the response in non-stream mode', async () => {
      const response = await chatComplete({
        connectorId: 'my-endpoint',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(response).toEqual({
        content: 'endpoint-chunk',
        metadata: undefined,
        toolCalls: [],
      });
    });

    it('returns an observable in stream mode', async () => {
      inferenceEndpointAdapterMock.chatComplete.mockReturnValue(
        of(chunkEvent('chunk-1'), chunkEvent('chunk-2'))
      );

      const events$ = chatComplete({
        stream: true,
        connectorId: 'my-endpoint',
        messages: [{ role: MessageRole.User, content: 'question' }],
        maxRetries: 0,
      });

      expect(isObservable(events$)).toBe(true);

      const events = await firstValueFrom(
        events$.pipe(filter(isChatCompletionChunkEvent), toArray())
      );
      expect(events).toHaveLength(2);
      expect(events[0].content).toBe('chunk-1');
      expect(events[1].content).toBe('chunk-2');
    });
  });
});
