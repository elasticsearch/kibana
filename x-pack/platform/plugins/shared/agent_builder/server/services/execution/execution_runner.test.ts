/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import {
  concat,
  lastValueFrom,
  mergeMap,
  of,
  shareReplay,
  throwError,
  timer,
  toArray,
  type Observable,
} from 'rxjs';
import {
  AgentExecutionMode,
  AgentBuilderErrorCode,
  ChatEventType,
  ConversationAccessControlMode,
  ConversationOriginType,
  createBadRequestError,
  type ChatAgentEvent,
  type ChatEvent,
  type RoundCompleteEvent,
  type RoundStartedEvent,
  CONVERSATION_SCHEMA_VERSION,
  ConversationRoundStatus,
} from '@kbn/agent-builder-common';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { UserAttributes } from '@kbn/inference-tracing';
import {
  collectAndWriteEvents,
  handleAgentExecution,
  serializeExecutionError,
  setUserAttributes,
} from './execution_runner';
import {
  createConversationClientMock,
  createEmptyConversation,
  createRound,
} from '../../test_utils';
import { pausedAndResumedRoundTimeline } from '../../test_utils/timeline';
import { withConverseSpan } from '../../tracing';
import { executeAgent$, generateTitle, resolveServices } from './utils';
import type { Span } from '@opentelemetry/api';

jest.mock('./utils', () => {
  const actual = jest.requireActual('./utils');

  return {
    ...actual,
    executeAgent$: jest.fn(),
    resolveServices: jest.fn(),
    generateTitle: jest.fn(),
  };
});

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');
  return {
    ...actual,
    v4: jest.fn(() => 'round-1'),
  };
});

const mockSpanSetAttribute = jest.fn();

jest.mock('../../tracing', () => {
  const actual = jest.requireActual('../../tracing');

  return {
    ...actual,
    withConverseSpan: jest.fn(
      (_opts: unknown, cb: (span: { setAttribute: jest.Mock }) => unknown) =>
        cb({ setAttribute: mockSpanSetAttribute })
    ),
  };
});

const executeAgentMock = executeAgent$ as jest.MockedFunction<typeof executeAgent$>;
const resolveServicesMock = resolveServices as jest.MockedFunction<typeof resolveServices>;
const withConverseSpanMock = withConverseSpan as jest.MockedFunction<typeof withConverseSpan>;
const generateTitleMock = generateTitle as jest.MockedFunction<typeof generateTitle>;

const createModelProviderMock = () => ({
  getDefaultModel: jest.fn().mockResolvedValue({
    chatModel: { getConnector: () => ({ type: '.gen-ai' }) },
  }),
  selectModel: jest.fn().mockResolvedValue({
    chatModel: { getConnector: () => ({ type: '.gen-ai' }) },
  }),
});

const createTelemetryMocks = () => ({
  meteringService: { reportExecution: jest.fn().mockResolvedValue(undefined) },
  trackingService: { trackConversationRound: jest.fn(), trackError: jest.fn() },
  analyticsService: {
    reportRoundComplete: jest.fn(),
    reportExecutionComplete: jest.fn(),
    reportRoundError: jest.fn(),
  },
});
type TelemetryMocks = ReturnType<typeof createTelemetryMocks>;

const createDeps = ({
  conversationClient,
  getConversationRoundAuthor = jest.fn().mockResolvedValue(undefined),
  telemetry = createTelemetryMocks(),
}: {
  conversationClient: ReturnType<typeof createConversationClientMock>;
  getConversationRoundAuthor?: jest.Mock;
  telemetry?: TelemetryMocks;
}) =>
  ({
    logger: loggingSystemMock.createLogger(),
    runAgent: jest.fn(),
    agentService: {
      getRegistry: jest
        .fn()
        .mockResolvedValue({ get: jest.fn().mockResolvedValue({ name: 'Test agent' }) }),
    },
    ...telemetry,
    conversationService: {
      getConversationRoundAuthor,
    },
  } as never);

/**
 * Factories for the two `ChatAgentEvent`s that show up in every persistence-flow test.
 * Keep them permissive: callers can override any field via `overrides`.
 */
const makeRoundStartedEvent = (
  roundId: string = 'round-1',
  overrides: Partial<RoundStartedEvent['data']> = {}
): RoundStartedEvent =>
  ({
    type: ChatEventType.roundStarted,
    data: {
      round_id: roundId,
      input: { message: 'Hello' },
      started_at: '2024-01-01T00:00:00.000Z',
      ...overrides,
    },
  } as RoundStartedEvent);

const makeRoundCompleteEvent = (roundId: string = 'round-1'): RoundCompleteEvent =>
  ({
    type: ChatEventType.roundComplete,
    // The END append is scoped to the started round, so the completed round must carry its id.
    data: { round: createRound({ id: roundId }) },
  } as RoundCompleteEvent);

const mockAgentStream = (
  events: ChatAgentEvent[],
  mode: 'sync' | 'asyncShared' = 'sync',
  error?: Error
): void => {
  if (mode === 'sync') {
    executeAgentMock.mockReturnValue(of(...events) as Observable<ChatAgentEvent>);
    return;
  }
  const stream$: Observable<ChatAgentEvent> = error
    ? (concat(
        of(...events),
        throwError(() => error)
      ) as Observable<ChatAgentEvent>)
    : (of(...events) as Observable<ChatAgentEvent>);
  executeAgentMock.mockReturnValue(
    timer(0).pipe(
      mergeMap(() => stream$),
      shareReplay()
    )
  );
};

const stubResolveServices = (
  conversationClient: ReturnType<typeof createConversationClientMock>
): void => {
  resolveServicesMock.mockResolvedValue({
    conversationClient,
    selectedConnectorId: 'connector-1',
    modelProvider: createModelProviderMock(),
  } as never);
};

const runHandle = ({
  agentParams,
  conversationClient,
  telemetry,
  executionId = 'execution-1',
}: {
  agentParams: Record<string, unknown>;
  conversationClient: ReturnType<typeof createConversationClientMock>;
  telemetry?: TelemetryMocks;
  executionId?: string;
}) =>
  handleAgentExecution({
    execution: {
      executionId,
      executionMode: AgentExecutionMode.conversation,
      agentParams,
    } as never,
    deps: createDeps({ conversationClient, telemetry }),
    request: { headers: {} } as never,
    abortSignal: new AbortController().signal,
  });

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('handleAgentExecution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    generateTitleMock.mockReturnValue(of('Generated title'));
  });

  it('reports metering with the resolved conversation id when continuing by origin', async () => {
    const origin = {
      external_conversation_id: 'team:T123/channel:C123/thread:callback-continuation',
    };
    const conversation = createEmptyConversation({
      id: 'conversation-from-origin',
      title: 'Existing conversation',
      agent_id: 'test-agent',
      origin,
    });
    const conversationClient = createConversationClientMock();
    conversationClient.getByOrigin.mockResolvedValue(conversation);
    conversationClient.update.mockResolvedValue(conversation);
    conversationClient.upsertRound.mockResolvedValue(conversation);

    const roundCompleteEvent: ChatEvent = {
      type: ChatEventType.roundComplete,
      data: {
        round: createRound({}),
      },
    };
    executeAgentMock.mockReturnValue(of(roundCompleteEvent));
    resolveServicesMock.mockResolvedValue({
      conversationClient,
      selectedConnectorId: 'connector-1',
      modelProvider: createModelProviderMock(),
    } as never);

    const reportExecution = jest.fn().mockResolvedValue(undefined);
    const agentRegistry = {
      get: jest.fn().mockResolvedValue({ name: 'Test agent' }),
    };

    const execution = {
      executionId: 'execution-1',
      executionMode: AgentExecutionMode.conversation,
      agentParams: {
        agentId: 'test-agent',
        origin,
        nextInput: {
          message: 'Continue this thread',
        },
      },
    } as never;

    const events$ = await handleAgentExecution({
      execution,
      deps: {
        logger: loggingSystemMock.createLogger(),
        runAgent: jest.fn(),
        agentService: {
          getRegistry: jest.fn().mockResolvedValue(agentRegistry),
        },
        meteringService: {
          reportExecution,
        },
        conversationService: {
          getConversationRoundAuthor: jest.fn().mockResolvedValue(undefined),
        },
      } as never,
      request: { headers: {} } as never,
      abortSignal: new AbortController().signal,
    });

    await lastValueFrom(events$.pipe(toArray()));

    expect(reportExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-from-origin',
      })
    );
  });

  describe('round origin attribution', () => {
    const originAuthor = { id: 'U123', full_name: 'Jane Doe', username: 'jane' };
    const origin = {
      type: ConversationOriginType.Slack,
      external_conversation_id: 'team:T123/channel:C123/thread:1712345678.000100',
      author: originAuthor,
    };

    const setup = ({ roundCompleteEvent }: { roundCompleteEvent: RoundCompleteEvent }) => {
      const conversation = createEmptyConversation({
        id: 'conversation-from-origin',
        agent_id: 'test-agent',
        origin: { external_conversation_id: origin.external_conversation_id },
      });
      const conversationClient = createConversationClientMock();
      conversationClient.get.mockResolvedValue(conversation);
      conversationClient.getByOrigin.mockResolvedValue(conversation);
      conversationClient.update.mockResolvedValue(conversation);
      conversationClient.upsertRound.mockResolvedValue(conversation);

      executeAgentMock.mockReturnValue(of(roundCompleteEvent));
      resolveServicesMock.mockResolvedValue({
        conversationClient,
        selectedConnectorId: 'connector-1',
        modelProvider: createModelProviderMock(),
      } as never);

      const deps = createDeps({ conversationClient });

      return { conversationClient, deps };
    };

    const runExecution = async ({
      deps,
      executionOrigin,
    }: {
      deps: unknown;
      executionOrigin?: typeof origin;
    }) => {
      const events$ = await handleAgentExecution({
        execution: {
          executionId: 'execution-1',
          executionMode: AgentExecutionMode.conversation,
          agentParams: {
            agentId: 'test-agent',
            origin: executionOrigin,
            conversationId: executionOrigin ? undefined : 'conversation-from-origin',
            nextInput: { message: 'Continue this thread' },
          },
        } as never,
        deps: deps as never,
        request: { headers: {} } as never,
        abortSignal: new AbortController().signal,
      });

      return lastValueFrom(events$.pipe(toArray()));
    };

    it('resolves the conversation by external id only and forwards the full origin to the agent run', async () => {
      const { conversationClient, deps } = setup({
        roundCompleteEvent: {
          type: ChatEventType.roundComplete,
          data: { round: createRound({}) },
        },
      });

      await runExecution({ deps, executionOrigin: origin });

      expect(conversationClient.getByOrigin).toHaveBeenCalledWith({
        external_conversation_id: origin.external_conversation_id,
      });
      expect(executeAgentMock).toHaveBeenCalledWith(expect.objectContaining({ origin }));
    });
  });

  describe('round author attribution', () => {
    it('forwards the resolved round author to the agent run', async () => {
      const author = { id: 'test-user-id', username: 'test_user' };
      const conversation = createEmptyConversation({
        id: 'conversation-1',
        agent_id: 'test-agent',
      });
      const conversationClient = createConversationClientMock();
      conversationClient.get.mockResolvedValue(conversation);
      conversationClient.update.mockResolvedValue(conversation);
      conversationClient.upsertRound.mockResolvedValue(conversation);

      executeAgentMock.mockReturnValue(
        of({
          type: ChatEventType.roundComplete,
          data: { round: createRound({}) },
        } as RoundCompleteEvent)
      );
      resolveServicesMock.mockResolvedValue({
        conversationClient,
        selectedConnectorId: 'connector-1',
        modelProvider: createModelProviderMock(),
      } as never);

      const getConversationRoundAuthor = jest.fn().mockResolvedValue(author);
      const deps = createDeps({ conversationClient, getConversationRoundAuthor });

      const events$ = await handleAgentExecution({
        execution: {
          executionId: 'execution-1',
          executionMode: AgentExecutionMode.conversation,
          agentParams: {
            agentId: 'test-agent',
            conversationId: 'conversation-1',
            nextInput: { message: 'Hello' },
          },
        } as never,
        deps,
        request: { headers: {} } as never,
        abortSignal: new AbortController().signal,
      });

      await lastValueFrom(events$.pipe(toArray()));

      expect(getConversationRoundAuthor).toHaveBeenCalledTimes(1);
      expect(executeAgentMock).toHaveBeenCalledWith(expect.objectContaining({ author }));
    });
  });

  describe('converse span user identity', () => {
    it('sets the round author on the span for public UPDATE', async () => {
      const author = { id: 'author-id', username: 'author' };
      const conversation = createEmptyConversation({
        id: 'conversation-1',
        agent_id: 'test-agent',
        user: { id: 'owner-id', username: 'owner' },
      });
      const conversationClient = createConversationClientMock();
      conversationClient.get.mockResolvedValue(conversation);
      conversationClient.update.mockResolvedValue(conversation);
      conversationClient.upsertRound.mockResolvedValue(conversation);

      executeAgentMock.mockReturnValue(
        of({
          type: ChatEventType.roundComplete,
          data: { round: createRound({}) },
        } as RoundCompleteEvent)
      );
      resolveServicesMock.mockResolvedValue({
        conversationClient,
        selectedConnectorId: 'connector-1',
        modelProvider: createModelProviderMock(),
      } as never);

      const events$ = await handleAgentExecution({
        execution: {
          executionId: 'execution-1',
          executionMode: AgentExecutionMode.conversation,
          agentParams: {
            agentId: 'test-agent',
            conversationId: 'conversation-1',
            nextInput: { message: 'Hello' },
          },
        } as never,
        deps: createDeps({
          conversationClient,
          getConversationRoundAuthor: jest.fn().mockResolvedValue(author),
        }),
        request: { headers: {} } as never,
        abortSignal: new AbortController().signal,
      });

      await lastValueFrom(events$.pipe(toArray()));

      expect(withConverseSpanMock).toHaveBeenCalled();
      expect(mockSpanSetAttribute).toHaveBeenCalledWith(UserAttributes.UserId, 'author-id');
      expect(mockSpanSetAttribute).toHaveBeenCalledWith(UserAttributes.UserName, 'author');
      expect(mockSpanSetAttribute).not.toHaveBeenCalledWith(UserAttributes.UserId, 'owner-id');
    });

    it('defers private CREATE identity until ConversationCreatedEvent', async () => {
      const createdUser = { id: 'created-user-id', username: 'created_user' };
      const createdConversation = createEmptyConversation({
        id: 'new-conversation',
        agent_id: 'test-agent',
        user: createdUser,
      });
      const conversationClient = createConversationClientMock();
      conversationClient.create.mockResolvedValue(createdConversation);
      conversationClient.appendEvents.mockResolvedValue(createdConversation);
      conversationClient.replaceRoundEvents.mockResolvedValue(createdConversation);

      mockAgentStream([makeRoundStartedEvent(), makeRoundCompleteEvent()]);
      stubResolveServices(conversationClient);

      const events$ = await runHandle({
        agentParams: { agentId: 'test-agent', nextInput: { message: 'Hello' } },
        conversationClient,
      });

      await lastValueFrom(events$.pipe(toArray()));

      expect(mockSpanSetAttribute).not.toHaveBeenCalledWith(UserAttributes.UserId, 'unknown');
      expect(mockSpanSetAttribute).not.toHaveBeenCalledWith(UserAttributes.UserName, 'unknown');
      expect(mockSpanSetAttribute).toHaveBeenCalledWith(UserAttributes.UserId, 'created-user-id');
      expect(mockSpanSetAttribute).toHaveBeenCalledWith(UserAttributes.UserName, 'created_user');
    });

    it('persists readOnly on the conversation it creates', async () => {
      const conversationClient = createConversationClientMock();
      const createdConversation = createEmptyConversation({
        id: 'new-conversation',
        read_only: true,
      });
      conversationClient.create.mockResolvedValue(createdConversation);
      conversationClient.appendEvents.mockResolvedValue(createdConversation);
      conversationClient.replaceRoundEvents.mockResolvedValue(createdConversation);

      mockAgentStream([makeRoundStartedEvent(), makeRoundCompleteEvent()]);
      stubResolveServices(conversationClient);

      const events$ = await runHandle({
        agentParams: { agentId: 'test-agent', nextInput: { message: 'Hello' }, readOnly: true },
        conversationClient,
      });

      await lastValueFrom(events$.pipe(toArray()));

      expect(conversationClient.create).toHaveBeenCalledWith(
        expect.objectContaining({ read_only: true })
      );
      expect(conversationClient.delete).not.toHaveBeenCalled();
    });
  });

  describe('receipt-time input persistence (two-phase)', () => {
    it('appends the raw user_message before any agent event flows through the persistence stream', async () => {
      const conversation = createEmptyConversation({
        id: 'conversation-1',
        agent_id: 'test-agent',
      });
      const conversationClient = createConversationClientMock();
      conversationClient.get.mockResolvedValue(conversation);
      conversationClient.appendEvents.mockResolvedValue(conversation);
      conversationClient.replaceRoundEvents.mockResolvedValue(conversation);

      mockAgentStream([makeRoundStartedEvent(), makeRoundCompleteEvent()], 'asyncShared');
      stubResolveServices(conversationClient);

      const events$ = await runHandle({
        agentParams: {
          agentId: 'test-agent',
          conversationId: 'conversation-1',
          nextInput: { message: 'raw input' },
        },
        conversationClient,
      });

      await lastValueFrom(events$.pipe(toArray()));

      const [firstAppendCall] = conversationClient.appendEvents.mock.calls;
      expect(firstAppendCall[0].events).toHaveLength(1);
      expect(firstAppendCall[0].events[0]).toMatchObject({
        id: 'round-1::user_message',
        data: { message: 'raw input' },
      });
    });
  });

  describe('regenerate on a paused conversation', () => {
    it('takes the rounds-path write, never the append-only resume', async () => {
      const conversation = createEmptyConversation({
        id: 'conversation-1',
        agent_id: 'test-agent',
        schema_version: CONVERSATION_SCHEMA_VERSION,
        events: pausedAndResumedRoundTimeline().slice(0, 4),
        rounds: [createRound({ id: 'round-1', status: ConversationRoundStatus.awaitingPrompt })],
      });
      const conversationClient = createConversationClientMock();
      conversationClient.get.mockResolvedValue(conversation);
      conversationClient.upsertRound.mockResolvedValue(conversation);
      conversationClient.update.mockResolvedValue(conversation);

      mockAgentStream([makeRoundCompleteEvent('round-1')]);
      stubResolveServices(conversationClient);

      const events$ = await runHandle({
        agentParams: {
          agentId: 'test-agent',
          conversationId: 'conversation-1',
          nextInput: {},
          action: 'regenerate',
        },
        conversationClient,
      });

      await lastValueFrom(events$.pipe(toArray()));

      expect(conversationClient.upsertRound).toHaveBeenCalledTimes(1);
      expect(conversationClient.appendEvents).not.toHaveBeenCalled();
    });
  });

  describe('HITL pause and resume telemetry', () => {
    const usage = (input: number, output: number, llmCalls: number) => ({
      connector_id: 'c1',
      llm_calls: llmCalls,
      input_tokens: input,
      output_tokens: output,
    });

    /**
     * A pause then a resume, driven as two converse calls with shared telemetry mocks. The resume's
     * `round_complete` carries the folded round (10 tokens); only `resume_execution` carries this
     * execution's own 4. Reporting the folded number is the double count this guards against.
     */
    it('bills the turn once while reporting each execution to analytics', async () => {
      const telemetry = createTelemetryMocks();
      const pausedRound = createRound({
        id: 'r1',
        status: ConversationRoundStatus.awaitingPrompt,
        response: { message: '' },
        model_usage: usage(6, 1, 1),
      });

      // --- the pause
      const beforePause = createEmptyConversation({ id: 'conversation-1', agent_id: 'test-agent' });
      const pauseClient = createConversationClientMock();
      pauseClient.get.mockResolvedValue(beforePause);
      pauseClient.appendEvents.mockResolvedValue(beforePause);
      pauseClient.replaceRoundEvents.mockResolvedValue(beforePause);
      mockAgentStream([
        makeRoundStartedEvent('r1'),
        {
          type: ChatEventType.roundComplete,
          data: { round: pausedRound },
        } as RoundCompleteEvent,
      ]);
      stubResolveServices(pauseClient);

      await lastValueFrom(
        (
          await runHandle({
            agentParams: {
              agentId: 'test-agent',
              conversationId: 'conversation-1',
              nextInput: { message: 'do it' },
            },
            conversationClient: pauseClient,
            telemetry,
          })
        ).pipe(toArray())
      );

      // --- the resume, against the stored pause
      const afterPause = createEmptyConversation({
        id: 'conversation-1',
        agent_id: 'test-agent',
        schema_version: CONVERSATION_SCHEMA_VERSION,
        events: pausedAndResumedRoundTimeline().slice(0, 4),
        rounds: [pausedRound],
      });
      const resumeClient = createConversationClientMock();
      resumeClient.get.mockResolvedValue(afterPause);
      resumeClient.appendEvents.mockResolvedValue(afterPause);
      mockAgentStream([
        {
          type: ChatEventType.roundComplete,
          data: {
            round: createRound({
              id: 'r1',
              status: ConversationRoundStatus.completed,
              model_usage: usage(10, 3, 2),
            }),
            resumed: true,
            resume_execution: {
              follow_up_round: createRound({
                id: 'throwaway',
                status: ConversationRoundStatus.completed,
                model_usage: usage(4, 2, 1),
              }),
            },
          },
        } as RoundCompleteEvent,
      ]);
      stubResolveServices(resumeClient);

      await lastValueFrom(
        (
          await runHandle({
            agentParams: {
              agentId: 'test-agent',
              conversationId: 'conversation-1',
              nextInput: { prompts: { p1: { type: 'confirmation', allow: true } } },
            },
            conversationClient: resumeClient,
            telemetry,
            executionId: 'execution-2',
          })
        ).pipe(toArray())
      );

      // billing is per turn: one record, when the turn answers, carrying the turn's totals.
      // The pause must not bill, or a turn paused once is charged twice.
      expect(telemetry.meteringService.reportExecution).toHaveBeenCalledTimes(1);
      expect(telemetry.meteringService.reportExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          roundId: 'r1',
          executionCount: 2,
          usage: expect.objectContaining({ input_tokens: 10 }),
        })
      );

      // the round bucket counts rounds started, so once
      expect(telemetry.trackingService.trackConversationRound).toHaveBeenCalledTimes(1);

      // the round event fires once, on the terminal execution, with the folded totals
      expect(telemetry.analyticsService.reportRoundComplete).toHaveBeenCalledTimes(1);
      expect(telemetry.analyticsService.reportRoundComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          round: expect.objectContaining({
            id: 'r1',
            status: ConversationRoundStatus.completed,
            model_usage: expect.objectContaining({ input_tokens: 10 }),
          }),
        })
      );

      // the execution event fires per execution, in order
      expect(telemetry.analyticsService.reportExecutionComplete).toHaveBeenCalledTimes(2);
      expect(
        telemetry.analyticsService.reportExecutionComplete.mock.calls.map(([call]) => [
          call.telemetry.executionIndex,
          call.telemetry.isRoundTerminal,
          call.telemetry.roundId,
        ])
      ).toEqual([
        [0, false, 'r1'],
        [1, true, 'r1'],
      ]);
    });

    it('keeps resume_execution off the client stream while telemetry still sees it', async () => {
      const telemetry = createTelemetryMocks();
      const conversation = createEmptyConversation({
        id: 'conversation-1',
        agent_id: 'test-agent',
        schema_version: CONVERSATION_SCHEMA_VERSION,
        events: pausedAndResumedRoundTimeline().slice(0, 4),
        rounds: [createRound({ id: 'r1', status: ConversationRoundStatus.awaitingPrompt })],
      });
      const conversationClient = createConversationClientMock();
      conversationClient.get.mockResolvedValue(conversation);
      conversationClient.appendEvents.mockResolvedValue(conversation);
      mockAgentStream([
        {
          type: ChatEventType.roundComplete,
          data: {
            round: createRound({
              id: 'r1',
              status: ConversationRoundStatus.completed,
              model_usage: usage(10, 3, 2),
            }),
            resumed: true,
            resume_execution: {
              follow_up_round: createRound({
                id: 'throwaway',
                status: ConversationRoundStatus.completed,
                model_usage: usage(4, 2, 1),
              }),
            },
          },
        } as RoundCompleteEvent,
      ]);
      stubResolveServices(conversationClient);

      const events = await lastValueFrom(
        (
          await runHandle({
            agentParams: {
              agentId: 'test-agent',
              conversationId: 'conversation-1',
              nextInput: { prompts: { p1: { type: 'confirmation', allow: true } } },
            },
            conversationClient,
            telemetry,
          })
        ).pipe(toArray())
      );

      // telemetry saw the unmerged execution: 4 is only reachable via resume_execution,
      // since the folded round on this event reads 10
      expect(
        telemetry.analyticsService.reportExecutionComplete.mock.calls[0][0].telemetry.executionRound
          .model_usage.input_tokens
      ).toBe(4);
      // the client did not
      const emitted = events.find((event) => event.type === ChatEventType.roundComplete);
      expect(emitted).toBeDefined();
      expect((emitted as RoundCompleteEvent).data.resume_execution).toBeUndefined();
    });
  });

  describe('two-phase failure handling', () => {
    it('keeps the receipt-time user_message on UPDATE when the run fails after round start (no cleanup write)', async () => {
      const conversation = createEmptyConversation({
        id: 'conversation-1',
        agent_id: 'test-agent',
      });
      const conversationClient = createConversationClientMock();
      conversationClient.get.mockResolvedValue(conversation);
      conversationClient.appendEvents.mockResolvedValue(conversation);

      mockAgentStream([makeRoundStartedEvent()], 'asyncShared', new Error('agent exploded'));
      stubResolveServices(conversationClient);

      const events$ = await runHandle({
        agentParams: {
          agentId: 'test-agent',
          conversationId: 'conversation-1',
          nextInput: { message: 'Hello' },
        },
        conversationClient,
      });

      await expect(lastValueFrom(events$.pipe(toArray()))).rejects.toThrow();
      await flushMicrotasks();

      // Only the receipt-time user_message write happened; no cleanup or terminal write.
      expect(conversationClient.appendEvents).toHaveBeenCalledTimes(1);
      expect(conversationClient.replaceRoundEvents).not.toHaveBeenCalled();
      expect(conversationClient.delete).not.toHaveBeenCalled();
    });

    it('keeps the conversation on CREATE when the first round fails before completing', async () => {
      const conversationClient = createConversationClientMock();
      conversationClient.create.mockResolvedValue(
        createEmptyConversation({ id: 'new-conversation' })
      );
      conversationClient.appendEvents.mockResolvedValue(
        createEmptyConversation({ id: 'new-conversation' })
      );

      mockAgentStream([makeRoundStartedEvent()], 'asyncShared', new Error('agent exploded'));
      stubResolveServices(conversationClient);

      const events$ = await runHandle({
        agentParams: { agentId: 'test-agent', nextInput: { message: 'Hello' } },
        conversationClient,
      });

      await expect(lastValueFrom(events$.pipe(toArray()))).rejects.toThrow();
      await flushMicrotasks();

      // The conversation and its receipt-time user_message survive the failed round.
      expect(conversationClient.delete).not.toHaveBeenCalled();
      expect(conversationClient.replaceRoundEvents).not.toHaveBeenCalled();
    });

    it('awaits the receipt write before the agent starts on CREATE (no tool can run before the input is stored)', async () => {
      const conversationClient = createConversationClientMock();
      let resolveReceipt!: (value: ReturnType<typeof createEmptyConversation>) => void;
      conversationClient.create.mockReturnValue(
        new Promise((resolve) => {
          resolveReceipt = resolve;
        })
      );

      mockAgentStream([makeRoundStartedEvent(), makeRoundCompleteEvent()], 'asyncShared');
      stubResolveServices(conversationClient);

      // Kick off the handler without awaiting — the receipt write (create) is still pending.
      const handlePromise = runHandle({
        agentParams: { agentId: 'test-agent', nextInput: { message: 'Hello' } },
        conversationClient,
      });
      await flushMicrotasks();

      // The agent is not started until the receipt lands.
      expect(conversationClient.create).toHaveBeenCalledTimes(1);
      expect(executeAgentMock).not.toHaveBeenCalled();

      resolveReceipt(createEmptyConversation({ id: 'new-conversation' }));
      await handlePromise;

      expect(executeAgentMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('setUserAttributes', () => {
  it('sets user.id and user.name when both are present', () => {
    const span = { setAttribute: jest.fn() } as unknown as Span;

    setUserAttributes(span, { id: 'profile-1', username: 'jane' });

    expect(span.setAttribute).toHaveBeenCalledWith(UserAttributes.UserId, 'profile-1');
    expect(span.setAttribute).toHaveBeenCalledWith(UserAttributes.UserName, 'jane');
  });

  it('sets only the fields that are present', () => {
    const span = { setAttribute: jest.fn() } as unknown as Span;

    setUserAttributes(span, { username: 'jane' });

    expect(span.setAttribute).toHaveBeenCalledTimes(1);
    expect(span.setAttribute).toHaveBeenCalledWith(UserAttributes.UserName, 'jane');
  });

  it('is a no-op when span is undefined', () => {
    expect(() => setUserAttributes(undefined, { id: 'profile-1', username: 'jane' })).not.toThrow();
  });
});

describe('collectAndWriteEvents', () => {
  const event: ChatEvent = {
    type: ChatEventType.conversationUpdated,
    data: {
      conversation_id: 'conversation-1',
      title: 'Conversation',
      access_control: { access_mode: ConversationAccessControlMode.Public, entries: [] },
    },
  };

  const createExecutionClient = () => ({
    appendEvents: jest.fn().mockResolvedValue(undefined),
  });

  const execution = {
    executionId: 'execution-1',
  };

  it('appends the events to the execution document and resolves once flushed', async () => {
    const executionClient = createExecutionClient();

    await expect(
      collectAndWriteEvents({
        events$: of(event),
        execution: execution as never,
        executionClient: executionClient as never,
        logger: loggingSystemMock.createLogger(),
      })
    ).resolves.toBeUndefined();

    expect(executionClient.appendEvents).toHaveBeenCalledWith('execution-1', [event]);
  });
});

describe('serializeExecutionError', () => {
  it('passes through AgentBuilderError code, message, and meta', () => {
    const err = createBadRequestError('bad input', { foo: 'bar' });

    expect(serializeExecutionError(err)).toEqual({
      code: AgentBuilderErrorCode.badRequest,
      message: 'bad input',
      meta: expect.objectContaining({ statusCode: 400, foo: 'bar' }),
    });
  });

  it('preserves the HTTP status from a Boom error in meta.statusCode', () => {
    const err = Boom.forbidden('Unauthorized to get actions');

    expect(serializeExecutionError(err)).toEqual({
      code: AgentBuilderErrorCode.internalError,
      message: 'Unauthorized to get actions',
      meta: { statusCode: 403 },
    });
  });

  it('preserves the HTTP status from a plain error carrying statusCode', () => {
    const err = Object.assign(new Error('nope'), { statusCode: 401 });

    expect(serializeExecutionError(err)).toEqual({
      code: AgentBuilderErrorCode.internalError,
      message: 'nope',
      meta: { statusCode: 401 },
    });
  });

  it('omits meta for plain errors with no status', () => {
    expect(serializeExecutionError(new Error('boom'))).toEqual({
      code: AgentBuilderErrorCode.internalError,
      message: 'boom',
    });
  });

  it('ignores out-of-range status codes', () => {
    const err = Object.assign(new Error('weird'), { statusCode: 200 });

    expect(serializeExecutionError(err)).toEqual({
      code: AgentBuilderErrorCode.internalError,
      message: 'weird',
    });
  });
});
