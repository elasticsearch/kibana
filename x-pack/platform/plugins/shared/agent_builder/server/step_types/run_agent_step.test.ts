/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { of, throwError } from 'rxjs';
import { ChatEventType, createRequestAbortedError } from '@kbn/agent-builder-common';
import {
  AGGREGATE_BY_REQUIRES_PLUGIN_ID_MESSAGE,
  ConfigSchema,
} from '../../common/step_types/run_agent_step';
import { CONNECTOR_OR_INFERENCE_ID_CONFLICT_MESSAGE_WORKFLOW } from '../../common/resolve_connector_or_inference_id';
import { getRunAgentStepDefinition } from './run_agent_step';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';

describe('ai.agent workflow step (Agent Builder)', () => {
  const createContext = (overrides: Partial<any> = {}) => {
    const fakeRequest = { headers: {} } as unknown as KibanaRequest;
    return {
      input: {},
      config: {},
      rawInput: {},
      contextManager: {
        getFakeRequest: jest.fn().mockReturnValue(fakeRequest),
        getContext: jest.fn(),
        getScopedEsClient: jest.fn(),
        renderInputTemplate: jest.fn(),
        callKibanaApi: jest.fn(),
      },
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      abortSignal: new AbortController().signal,
      stepId: 'test-step',
      stepType: 'ai.agent',
      ...overrides,
    } as StepHandlerContext;
  };

  const createExecutionMock = (events$: any) => ({
    executeAgent: jest.fn().mockResolvedValue({ executionId: 'exec-1', events$ }),
  });

  it('creates and persists a conversation when create_conversation is true, and emits conversation_id', async () => {
    const events$ = of(
      {
        type: ChatEventType.conversationCreated,
        data: { conversation_id: 'c-1', title: 't' },
      },
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok', structured_output: { foo: 'bar' } },
          },
        },
      }
    );

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const context = createContext({
      input: {
        message: 'hello',
      },
      config: {
        'create-conversation': true,
      },
    });
    const res = await step.handler(context);

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res).toHaveProperty('output.conversation_id');
    expect(res.output?.conversation_id).toBe('c-1');
  });

  it('uses conversation_id from input (with:) and create-conversation from config (static)', async () => {
    const events$ = of(
      {
        type: ChatEventType.conversationCreated,
        data: { conversation_id: 'c-dash', title: 't' },
      },
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      }
    );

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
          conversation_id: 'c-dash',
        },
        config: {
          'create-conversation': true,
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res).toHaveProperty('output.conversation_id', 'c-dash');
  });

  it('reuses an existing conversation_id and updates it for follow-up prompts', async () => {
    const events$ = of(
      {
        type: ChatEventType.conversationUpdated,
        data: { conversation_id: 'c-1', title: 't' },
      },
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      }
    );

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'follow up',
          conversation_id: 'c-1',
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.output?.conversation_id).toBe('c-1');
  });

  it('does not create a conversation when create_conversation is false and no conversation_id is provided', async () => {
    const events$ = of({
      type: ChatEventType.roundComplete,
      data: {
        round: {
          id: 'r-1',
          response: { message: 'ok' },
        },
      },
    });

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'stateless',
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.output?.conversation_id).toBeUndefined();
  });

  it('propagates execution service errors (e.g., missing connector)', async () => {
    const execError = new Error('No LLM connector configured');
    const events$ = throwError(() => execError);

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.error).toBe(execError);
  });

  it('returns an error when no round_complete event is emitted', async () => {
    const events$ = of({
      type: ChatEventType.conversationCreated,
      data: { conversation_id: 'c-1', title: 't' },
    });

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.error).toBeInstanceOf(Error);
    expect(res.error?.message).toContain('No round_complete event');
  });

  it('fails when the workflow abort signal is already aborted', async () => {
    const events$ = throwError(() => createRequestAbortedError('Converse request was aborted'));

    const execution = createExecutionMock(events$);
    const abortController = new AbortController();
    abortController.abort();

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
        },
        abortSignal: abortController.signal,
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.error).toBeInstanceOf(Error);
    expect(res.error?.message).toContain('aborted');
  });

  it('propagates attachments to execution service nextInput', async () => {
    const attachments = [
      {
        id: 'attachment-1',
        type: 'security.alert',
        data: { alertId: 'alert-123', severity: 'high' },
      },
      {
        type: 'document',
        data: { content: 'test content' },
        hidden: true,
      },
    ];

    const events$ = of({
      type: ChatEventType.roundComplete,
      data: {
        round: {
          id: 'r-1',
          response: { message: 'ok' },
        },
      },
    });
    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: {
        execution,
      },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
          attachments,
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(execution.executeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          nextInput: {
            message: 'hello',
            attachments,
          },
        }),
      })
    );
    expect(res.output?.message).toBe('ok');
  });

  describe('connector-id / inference-id', () => {
    it('ConfigSchema rejects when both ids are meaningful', () => {
      const parsed = ConfigSchema.safeParse({
        'connector-id': 'a',
        'inference-id': 'b',
      });
      expect(parsed.success).toBe(false);
    });

    it('ConfigSchema accepts when connector-id is whitespace-only and inference-id is set', () => {
      const parsed = ConfigSchema.safeParse({
        'connector-id': '   ',
        'inference-id': 'b',
      });
      expect(parsed.success).toBe(true);
    });

    it('does not call executeAgent when both ids are meaningful (handler coalesce)', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      });
      const execution = createExecutionMock(events$);
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);
      const res = await step.handler(
        createContext({
          input: { message: 'hello' },
          config: {
            'connector-id': 'a',
            'inference-id': 'b',
          },
        })
      );

      expect(execution.executeAgent).not.toHaveBeenCalled();
      expect(res.error?.message).toBe(CONNECTOR_OR_INFERENCE_ID_CONFLICT_MESSAGE_WORKFLOW);
    });

    it('passes trimmed inference-id as connectorId to executeAgent', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      });
      const execution = createExecutionMock(events$);
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);
      await step.handler(
        createContext({
          input: { message: 'hello' },
          config: { 'inference-id': '  inf-1  ' },
        })
      );

      expect(execution.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ connectorId: 'inf-1' }),
        })
      );
    });
  });

  describe('telemetry attribution (plugin-id / aggregate-by)', () => {
    const roundCompleteEvents = () =>
      of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      });

    it('ConfigSchema rejects aggregate-by without plugin-id', () => {
      const parsed = ConfigSchema.safeParse({ 'aggregate-by': 'streams_significant_events' });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toBe(AGGREGATE_BY_REQUIRES_PLUGIN_ID_MESSAGE);
      }
    });

    it('ConfigSchema accepts plugin-id with aggregate-by, and plugin-id alone', () => {
      expect(
        ConfigSchema.safeParse({
          'plugin-id': 'streams_sig_events_discovery',
          'aggregate-by': 'streams_significant_events',
        }).success
      ).toBe(true);
      expect(ConfigSchema.safeParse({ 'plugin-id': 'streams_sig_events_discovery' }).success).toBe(
        true
      );
    });

    it('forwards plugin-id and aggregate-by as telemetryMetadata to executeAgent', async () => {
      const execution = createExecutionMock(roundCompleteEvents());
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);

      await step.handler(
        createContext({
          input: { message: 'hello' },
          config: {
            'plugin-id': 'streams_sig_events_discovery',
            'aggregate-by': 'streams_significant_events',
          },
        })
      );

      expect(execution.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            telemetryMetadata: {
              pluginId: 'streams_sig_events_discovery',
              aggregateBy: 'streams_significant_events',
            },
          }),
        })
      );
    });

    it('omits telemetryMetadata when no plugin-id is configured', async () => {
      const execution = createExecutionMock(roundCompleteEvents());
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);

      await step.handler(createContext({ input: { message: 'hello' } }));

      const callArg = execution.executeAgent.mock.calls[0][0];
      expect(callArg.params).not.toHaveProperty('telemetryMetadata');
    });
  });

  describe('token usage', () => {
    it('includes usage in output from a single round with model_usage', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'hello' },
            model_usage: { connector_id: 'c', llm_calls: 1, input_tokens: 100, output_tokens: 50 },
          },
        },
      });

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      expect(res.output?.metadata?.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });

    it('accumulates token usage across multiple rounds', async () => {
      const events$ = of(
        {
          type: ChatEventType.roundComplete,
          data: {
            round: {
              id: 'r-1',
              response: { message: 'intermediate' },
              model_usage: {
                connector_id: 'c',
                llm_calls: 1,
                input_tokens: 200,
                output_tokens: 80,
              },
            },
          },
        },
        {
          type: ChatEventType.roundComplete,
          data: {
            round: {
              id: 'r-2',
              response: { message: 'final' },
              model_usage: {
                connector_id: 'c',
                llm_calls: 1,
                input_tokens: 300,
                output_tokens: 120,
              },
            },
          },
        }
      );

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      // Output should be from the first round (events.find returns first match)
      expect(res.output?.message).toBe('intermediate');
      // Usage should be the sum across all rounds
      expect(res.output?.metadata?.usage).toEqual({
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
      });
    });

    it('returns zero usage when round has no model_usage', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
            // no model_usage
          },
        },
      });

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      expect(res.output?.metadata?.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it('preserves partial token counts when the event stream errors mid-execution', async () => {
      const { concat, throwError: rxThrowError } =
        jest.requireActual<typeof import('rxjs')>('rxjs');

      // Cold observable: emits one round with tokens, then errors
      const events$ = concat(
        of({
          type: ChatEventType.roundComplete,
          data: {
            round: {
              id: 'r-1',
              response: { message: 'partial' },
              model_usage: {
                connector_id: 'c',
                llm_calls: 1,
                input_tokens: 150,
                output_tokens: 60,
              },
            },
          },
        }),
        rxThrowError(() => new Error('stream interrupted'))
      );

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      expect(res.error).toBeInstanceOf(Error);
      // Partial token counts are preserved in the output despite the error
      expect(res.output?.metadata?.usage).toEqual({
        inputTokens: 150,
        outputTokens: 60,
        totalTokens: 210,
      });
    });
  });
});
