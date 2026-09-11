/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { ChatCompletionEventType, MessageRole } from '@kbn/inference-common';
import type { WorkflowAnonymizationProvider } from '../workflow_anonymization_provider';
import { loggerMock } from '@kbn/logging-mocks';
import { firstValueFrom, Observable, of, throwError, toArray } from 'rxjs';
import {
  chunkEvent,
  createPiiRegexWorkerServiceMock,
  messageEvent,
  tokensEvent,
} from '../test_utils';
import { createWorkflowAnonymizationPipeline } from './workflow_anonymization_pipeline';

const token = 'EMAIL_0123456789abcdef0123456789abcdef';
const tokenMap = {
  [token]: { original: 'person@example.com', entityClass: 'EMAIL' },
};
const originalMessages = [{ role: MessageRole.User, content: 'original' }] as const;
const protectedMessages = [{ role: MessageRole.User, content: `Contact ${token}` }] as const;

const createOptions = ({
  provider,
  invokeConnector,
  failureMode = 'block',
  abortSignal,
  preLLMTimeoutMs = 0,
}: {
  provider: WorkflowAnonymizationProvider;
  invokeConnector: jest.Mock;
  failureMode?: 'block' | 'allow_unsafe';
  abortSignal?: AbortSignal;
  preLLMTimeoutMs?: number;
}) => ({
  request: httpServerMock.createKibanaRequest(),
  namespace: 'space-a',
  system: 'original system',
  messages: originalMessages,
  sessionId: 'session-a',
  agentId: 'agent-a',
  abortSignal,
  regexWorker: createPiiRegexWorkerServiceMock(),
  logger: loggerMock.create(),
  workflowAnonymization: {
    provider,
    failureMode,
    preLLMTimeoutMs,
    encryptionKey: 'server-managed-salt',
  },
  invocationState: { connectorInvoked: false },
  invokeConnector,
});

describe('createWorkflowAnonymizationPipeline', () => {
  it('passes the caller abort signal to workflow execution and the connector', async () => {
    const abortSignal = new AbortController().signal;
    const invokeConnector = jest.fn().mockReturnValue(of(messageEvent('direct')));
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async (options) => {
        expect(options.abortSignal).toBe(abortSignal);
        return { matched: false } as const;
      }),
    };

    await firstValueFrom(
      createWorkflowAnonymizationPipeline(
        createOptions({ provider, invokeConnector, abortSignal })
      ).pipe(toArray())
    );

    expect(invokeConnector).toHaveBeenCalledWith({
      system: 'original system',
      messages: originalMessages,
      abortSignal,
    });
  });

  it('stops an active connector stream when the caller aborts', async () => {
    const abortController = new AbortController();
    let markConnectorStarted: () => void = () => undefined;
    const connectorStarted = new Promise<void>((resolve) => {
      markConnectorStarted = resolve;
    });
    const connectorStopped = jest.fn();
    const invokeConnector = jest.fn(
      ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Observable((subscriber) => {
          const stop = () => subscriber.error(abortSignal?.reason ?? new Error('aborted'));
          abortSignal?.addEventListener('abort', stop, { once: true });
          markConnectorStarted();
          return () => {
            abortSignal?.removeEventListener('abort', stop);
            connectorStopped();
          };
        })
    );
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async ({ proceed }) => {
        await proceed.invoke({ messages: protectedMessages, tokenMap: {} });
        return { matched: true, content: 'unreachable' };
      }),
    };
    const completion = firstValueFrom(
      createWorkflowAnonymizationPipeline(
        createOptions({ provider, invokeConnector, abortSignal: abortController.signal })
      ).pipe(toArray())
    );

    await connectorStarted;
    abortController.abort(new Error('cancelled'));

    await expect(completion).rejects.toThrow('cancelled');
    expect(connectorStopped).toHaveBeenCalledTimes(1);
  });

  it('relays restored chunks and emits one workflow-authoritative terminal message', async () => {
    const invokeConnector = jest.fn().mockReturnValue(
      of(
        chunkEvent(`Contact ${token.slice(0, 14)}`, [
          {
            index: 0,
            toolCallId: 'tool-call-1',
            function: {
              name: 'send_email',
              arguments: `{"recipient":"${token.slice(0, 8)}`,
            },
          },
        ]),
        chunkEvent(`${token.slice(14)} now`),
        tokensEvent(),
        {
          ...messageEvent(`Contact ${token} now`, [
            {
              toolCallId: 'tool-call-1',
              function: { name: 'send_email', arguments: { recipient: token } },
            },
          ]),
          refusal: 'preserved refusal metadata',
        }
      )
    );
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async ({ event, namespace, proceed }) => {
        expect(event).toEqual({
          system: 'original system',
          messages: originalMessages,
          sessionId: 'session-a',
          agentId: 'agent-a',
        });
        expect(namespace).toBe('space-a');
        await expect(
          proceed.invoke({ system: 'protected system', messages: protectedMessages, tokenMap })
        ).resolves.toEqual({ rawContent: `Contact ${token} now` });
        return { matched: true, content: 'workflow-restored final' };
      }),
    };

    const events = await firstValueFrom(
      createWorkflowAnonymizationPipeline(createOptions({ provider, invokeConnector })).pipe(
        toArray()
      )
    );
    const chunks = events.filter(
      (event) => event.type === ChatCompletionEventType.ChatCompletionChunk
    );
    const terminalMessages = events.filter(
      (event) => event.type === ChatCompletionEventType.ChatCompletionMessage
    );

    expect(chunks.map(({ content }) => content).join('')).toBe('Contact person@example.com now');
    expect(chunks.flatMap(({ tool_calls: toolCalls }) => toolCalls)).toEqual([
      {
        index: 0,
        toolCallId: 'tool-call-1',
        function: {
          name: 'send_email',
          arguments: JSON.stringify({ recipient: 'person@example.com' }),
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(token);
    expect(
      events.filter((event) => event.type === ChatCompletionEventType.ChatCompletionTokenCount)
    ).toHaveLength(1);
    expect(terminalMessages).toEqual([
      expect.objectContaining({
        content: 'workflow-restored final',
        refusal: 'preserved refusal metadata',
        toolCalls: [
          expect.objectContaining({
            function: {
              name: 'send_email',
              arguments: { recipient: 'person@example.com' },
            },
          }),
        ],
      }),
    ]);
    expect(invokeConnector).toHaveBeenCalledTimes(1);
    expect(invokeConnector).toHaveBeenCalledWith({
      system: expect.stringContaining('protected system'),
      messages: protectedMessages,
      abortSignal: undefined,
    });
    const calledSystem: string = invokeConnector.mock.calls[0][0].system;
    expect(calledSystem).toContain('[Anonymization context]');
    expect(calledSystem).toContain(`: EMAIL`);
  });

  it('uses the original direct path when no workflow matches', async () => {
    const invokeConnector = jest
      .fn()
      .mockReturnValue(of(chunkEvent('direct'), messageEvent('direct')));
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn().mockResolvedValue({ matched: false }),
    };

    await expect(
      firstValueFrom(
        createWorkflowAnonymizationPipeline(createOptions({ provider, invokeConnector })).pipe(
          toArray()
        )
      )
    ).resolves.toEqual([chunkEvent('direct'), messageEvent('direct')]);
    expect(invokeConnector).toHaveBeenCalledWith({
      system: 'original system',
      messages: originalMessages,
      abortSignal: undefined,
    });
  });

  it('allows an unsafe direct call only when protection fails before connector invocation', async () => {
    const invokeConnector = jest
      .fn()
      .mockReturnValue(of(chunkEvent('unsafe direct'), messageEvent('unsafe direct')));
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn().mockRejectedValue(new Error('selection failed')),
    };
    const options = createOptions({ provider, invokeConnector, failureMode: 'allow_unsafe' });

    await expect(
      firstValueFrom(createWorkflowAnonymizationPipeline(options).pipe(toArray()))
    ).resolves.toEqual([chunkEvent('unsafe direct'), messageEvent('unsafe direct')]);
    expect(invokeConnector).toHaveBeenCalledTimes(1);
    expect(options.logger.warn).toHaveBeenCalledWith(expect.stringContaining('allow_unsafe'));
  });

  it('blocks before connector invocation by default when protection fails', async () => {
    const invokeConnector = jest.fn();
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn().mockRejectedValue(new Error('selection failed')),
    };

    await expect(
      firstValueFrom(
        createWorkflowAnonymizationPipeline(
          createOptions({ provider, invokeConnector, failureMode: 'block' })
        ).pipe(toArray())
      )
    ).rejects.toThrow('selection failed');
    expect(invokeConnector).not.toHaveBeenCalled();
  });

  it('never starts a second connector call when the workflow fails after proceed', async () => {
    const invokeConnector = jest
      .fn()
      .mockReturnValue(of(chunkEvent('called'), messageEvent('called')));
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async ({ proceed }) => {
        await proceed.invoke({ messages: protectedMessages, tokenMap: {} });
        throw new Error('post-proceed failure');
      }),
    };
    const options = createOptions({ provider, invokeConnector, failureMode: 'allow_unsafe' });

    await expect(
      firstValueFrom(createWorkflowAnonymizationPipeline(options).pipe(toArray()))
    ).rejects.toThrow('post-proceed failure');
    expect(invokeConnector).toHaveBeenCalledTimes(1);
    expect(options.logger.warn).not.toHaveBeenCalled();
  });

  it('propagates a connector error after proceed without an allow_unsafe retry', async () => {
    const connectorError = new Error('connector failed');
    const invokeConnector = jest.fn().mockReturnValue(throwError(() => connectorError));
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async ({ proceed }) => {
        await proceed.invoke({ messages: protectedMessages, tokenMap: {} });
        return { matched: true, content: 'unreachable' };
      }),
    };
    const options = createOptions({ provider, invokeConnector, failureMode: 'allow_unsafe' });

    await expect(
      firstValueFrom(createWorkflowAnonymizationPipeline(options).pipe(toArray()))
    ).rejects.toThrow('connector failed');
    expect(invokeConnector).toHaveBeenCalledTimes(1);
    expect(options.logger.warn).not.toHaveBeenCalled();
  });

  it('fails when the connector does not emit a terminal message', async () => {
    const invokeConnector = jest.fn().mockReturnValue(of(chunkEvent('partial')));
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async ({ proceed }) => {
        await proceed.invoke({ messages: protectedMessages, tokenMap: {} });
        return { matched: true, content: 'unreachable' };
      }),
    };

    await expect(
      firstValueFrom(
        createWorkflowAnonymizationPipeline(createOptions({ provider, invokeConnector })).pipe(
          toArray()
        )
      )
    ).rejects.toThrow('without a terminal message');
  });

  it('enforces runtime single-use proceed semantics', async () => {
    const invokeConnector = jest.fn().mockReturnValue(of(messageEvent('first')));
    const provider: WorkflowAnonymizationProvider = {
      supportsSynchronousExecution: true,
      execute: jest.fn(async ({ proceed }) => {
        await proceed.invoke({ messages: protectedMessages, tokenMap: {} });
        await proceed.invoke({ messages: protectedMessages, tokenMap: {} });
        return { matched: true, content: 'unreachable' };
      }),
    };

    await expect(
      firstValueFrom(
        createWorkflowAnonymizationPipeline(createOptions({ provider, invokeConnector })).pipe(
          toArray()
        )
      )
    ).rejects.toThrow('may only be invoked once');
    expect(invokeConnector).toHaveBeenCalledTimes(1);
  });

  describe('pre-LLM timeout', () => {
    const makeStalledProvider = (): WorkflowAnonymizationProvider => ({
      supportsSynchronousExecution: true,
      execute: jest.fn(
        ({ abortSignal: signal }) =>
          new Promise<never>((_resolve, reject) => {
            if (signal?.aborted) {
              reject(signal.reason);
              return;
            }
            signal?.addEventListener('abort', () => reject(signal!.reason), { once: true });
          })
      ),
    });

    it('clears the timeout when proceed.invoke is called before it fires', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const invokeConnector = jest.fn().mockReturnValue(of(messageEvent('ok')));
      const provider: WorkflowAnonymizationProvider = {
        supportsSynchronousExecution: true,
        execute: jest.fn(async ({ proceed }) => {
          await proceed.invoke({ messages: protectedMessages, tokenMap: {} });
          return { matched: true, content: 'ok' };
        }),
      };

      await firstValueFrom(
        createWorkflowAnonymizationPipeline(
          createOptions({ provider, invokeConnector, preLLMTimeoutMs: 5000 })
        ).pipe(toArray())
      );

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('falls through to allow_unsafe direct path when timeout fires before proceed.invoke', async () => {
      jest.useFakeTimers();
      try {
        const invokeConnector = jest
          .fn()
          .mockReturnValue(of(chunkEvent('fallback'), messageEvent('fallback')));
        const options = createOptions({
          provider: makeStalledProvider(),
          invokeConnector,
          failureMode: 'allow_unsafe',
          preLLMTimeoutMs: 5000,
        });

        const completionPromise = firstValueFrom(
          createWorkflowAnonymizationPipeline(options).pipe(toArray())
        );
        // Attach the handler before firing timers to avoid unhandled-rejection warnings.
        const assertion = expect(completionPromise).resolves.toEqual([
          chunkEvent('fallback'),
          messageEvent('fallback'),
        ]);
        await jest.runAllTimersAsync();
        await assertion;

        expect(invokeConnector).toHaveBeenCalledTimes(1);
        expect(options.logger.warn).toHaveBeenCalledWith(expect.stringContaining('allow_unsafe'));
      } finally {
        jest.useRealTimers();
      }
    });

    it('propagates the timeout error when failureMode is block', async () => {
      jest.useFakeTimers();
      try {
        const invokeConnector = jest.fn();
        const options = createOptions({
          provider: makeStalledProvider(),
          invokeConnector,
          failureMode: 'block',
          preLLMTimeoutMs: 5000,
        });

        const completionPromise = firstValueFrom(
          createWorkflowAnonymizationPipeline(options).pipe(toArray())
        );
        // Attach the handler before firing timers to avoid unhandled-rejection warnings.
        const assertion = expect(completionPromise).rejects.toThrow('timed out');
        await jest.runAllTimersAsync();
        await assertion;

        expect(invokeConnector).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('keeps relay and terminal state isolated across concurrent executions', async () => {
    const secondToken = 'USER_NAME_fedcba9876543210fedcba9876543210';
    const run = async ({
      currentToken,
      original,
      finalContent,
    }: {
      currentToken: string;
      original: string;
      finalContent: string;
    }) => {
      const currentTokenMap = {
        [currentToken]: { original, entityClass: 'USER_NAME' },
      };
      const invokeConnector = jest
        .fn()
        .mockReturnValue(of(chunkEvent(currentToken), messageEvent(currentToken)));
      const provider: WorkflowAnonymizationProvider = {
        supportsSynchronousExecution: true,
        execute: jest.fn(async ({ proceed }) => {
          await proceed.invoke({ messages: protectedMessages, tokenMap: currentTokenMap });
          return { matched: true, content: finalContent };
        }),
      };
      return firstValueFrom(
        createWorkflowAnonymizationPipeline(createOptions({ provider, invokeConnector })).pipe(
          toArray()
        )
      );
    };

    const [firstEvents, secondEvents] = await Promise.all([
      run({ currentToken: token, original: 'first@example.com', finalContent: 'first final' }),
      run({ currentToken: secondToken, original: 'second-user', finalContent: 'second final' }),
    ]);

    expect(firstEvents).toEqual([chunkEvent('first@example.com'), messageEvent('first final')]);
    expect(secondEvents).toEqual([chunkEvent('second-user'), messageEvent('second final')]);
  });
});
