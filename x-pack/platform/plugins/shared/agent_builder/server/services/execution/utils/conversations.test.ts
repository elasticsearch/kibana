/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lastValueFrom, of, toArray } from 'rxjs';
import type { Observable } from 'rxjs';
import type {
  ChatEvent,
  Conversation,
  ConversationRoundAuthor,
  ConversationRoundStep,
  RoundCompleteEvent,
} from '@kbn/agent-builder-common';
import {
  ChatEventType,
  ConversationAccessControlMode,
  ConversationRoundStatus,
  ConversationRoundStepType,
  TimelineEventType,
  createConversationAlreadyExistsError,
  createConversationNotFoundError,
  DEFAULT_CONVERSATION_TITLE,
} from '@kbn/agent-builder-common';
import {
  createEmptyConversation,
  createRound,
  createConversationClientMock,
} from '../../../test_utils';
import { resumeExecutionId, roundExecutionCount } from '../../conversation/client/rounds_to_events';
import type { ConversationWithOperation } from './conversations';
import {
  appendResumeExecution$,
  appendRoundTerminated$,
  getConversation,
  persistRoundInput,
  updateConversation$,
} from './conversations';

describe('conversations utils', () => {
  describe('getConversation', () => {
    describe('operation determination', () => {
      it('returns CREATE operation when no conversationId is provided', async () => {
        const conversationClient = createConversationClientMock();

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: undefined,
          conversationClient,
        });

        expect(result.operation).toBe('CREATE');
      });

      it('returns UPDATE operation when no conversationId is provided and origin matches an existing conversation', async () => {
        const conversationClient = createConversationClientMock();
        const origin = {
          external_conversation_id: 'team:T123/channel:C123/thread:1712345678.000100',
        };
        const existingConversation = createEmptyConversation({
          id: 'existing-conversation',
          origin,
        });
        conversationClient.getByOrigin.mockResolvedValue(existingConversation);

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: undefined,
          conversationClient,
          origin,
        });

        expect(result.operation).toBe('UPDATE');
        expect(result.id).toBe('existing-conversation');
        expect(conversationClient.getByOrigin).toHaveBeenCalledWith(origin);
      });

      it('defaults access control to private for new conversation placeholders', async () => {
        const conversationClient = createConversationClientMock();

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: undefined,
          conversationClient,
        });

        expect(result.access_control).toEqual({
          access_mode: ConversationAccessControlMode.Private,
          entries: [],
        });
      });

      it('uses explicit access control for new conversation placeholders', async () => {
        const conversationClient = createConversationClientMock();

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: undefined,
          conversationClient,
          accessControl: {
            access_mode: ConversationAccessControlMode.Public,
          },
        });

        expect(result.access_control).toEqual({
          access_mode: ConversationAccessControlMode.Public,
          entries: [],
        });
      });

      it('defaults read_only to false for new conversation placeholders', async () => {
        const conversationClient = createConversationClientMock();

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: undefined,
          conversationClient,
        });

        expect(result.read_only).toBe(false);
      });

      it('uses explicit read_only for new conversation placeholders', async () => {
        const conversationClient = createConversationClientMock();

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: undefined,
          conversationClient,
          readOnly: true,
        });

        expect(result.read_only).toBe(true);
      });

      it('ignores read_only when auto-created conversation already exists', async () => {
        const conversationClient = createConversationClientMock();
        conversationClient.exists.mockResolvedValue(true);
        conversationClient.get.mockResolvedValue(createEmptyConversation({ read_only: false }));

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: 'existing-conversation',
          autoCreateConversationWithId: true,
          conversationClient,
          readOnly: true,
        });

        expect(result.operation).toBe('UPDATE');
        expect(result.read_only).toBe(false);
      });

      it('returns UPDATE operation when conversationId is provided', async () => {
        const conversationClient = createConversationClientMock();
        conversationClient.get.mockResolvedValue(createEmptyConversation());

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: 'test-conversation',
          conversationClient,
        });

        expect(result.operation).toBe('UPDATE');
        expect(conversationClient.get).toHaveBeenCalledWith('test-conversation');
      });

      it('returns CREATE operation when autoCreateConversationWithId=true and conversation does not exist', async () => {
        const conversationClient = createConversationClientMock();
        conversationClient.exists.mockResolvedValue(false);

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: 'new-conversation',
          autoCreateConversationWithId: true,
          conversationClient,
        });

        expect(result.operation).toBe('CREATE');
        expect(result.id).toBe('new-conversation');
      });

      it('returns UPDATE operation when autoCreateConversationWithId=true and conversation exists', async () => {
        const conversationClient = createConversationClientMock();
        conversationClient.exists.mockResolvedValue(true);
        conversationClient.get.mockResolvedValue(createEmptyConversation());

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: 'existing-conversation',
          autoCreateConversationWithId: true,
          conversationClient,
        });

        expect(result.operation).toBe('UPDATE');
      });

      it('throws not found instead of creating when autoCreateConversationWithId=true and the conversation exists but is not accessible', async () => {
        // e.g. another user's private conversation with the same id: exists() reports
        // physical existence, and the converse-gated get() denies access
        const conversationClient = createConversationClientMock();
        conversationClient.exists.mockResolvedValue(true);
        conversationClient.get.mockRejectedValue(
          createConversationNotFoundError({ conversationId: 'existing-conversation' })
        );

        await expect(
          getConversation({
            agentId: 'test-agent',
            conversationId: 'existing-conversation',
            autoCreateConversationWithId: true,
            conversationClient,
          })
        ).rejects.toMatchObject({
          message: 'Conversation existing-conversation not found',
        });

        expect(conversationClient.create).not.toHaveBeenCalled();
      });

      it('ignores access control when auto-created conversation already exists', async () => {
        const conversationClient = createConversationClientMock();
        const existingConversation = createEmptyConversation({
          access_control: {
            access_mode: ConversationAccessControlMode.Private,
            entries: [],
          },
        });
        conversationClient.exists.mockResolvedValue(true);
        conversationClient.get.mockResolvedValue(existingConversation);

        const result = await getConversation({
          agentId: 'test-agent',
          conversationId: 'existing-conversation',
          autoCreateConversationWithId: true,
          conversationClient,
          accessControl: {
            access_mode: ConversationAccessControlMode.Public,
          },
        });

        expect(result.operation).toBe('UPDATE');
        expect(result.access_control).toEqual({
          access_mode: ConversationAccessControlMode.Private,
          entries: [],
        });
      });
    });
  });

  describe('updateConversation$', () => {
    const runUpdate = async ({
      conversationClient,
      conversation,
      roundCompleteEvent,
      action,
    }: {
      conversationClient: ReturnType<typeof createConversationClientMock>;
      conversation: Conversation;
      roundCompleteEvent: RoundCompleteEvent;
      action?: 'regenerate';
    }) => {
      conversationClient.upsertRound.mockResolvedValue(conversation);

      const result$ = updateConversation$({
        conversationClient,
        conversation,
        roundCompletedEvents$: of(roundCompleteEvent),
        ...(action ? { action } : {}),
      });

      await new Promise<void>((resolve) => {
        result$.subscribe({
          complete: resolve,
        });
      });
    };

    describe('action parameter', () => {
      it('names the superseded round when action=regenerate', async () => {
        const conversationClient = createConversationClientMock();
        const existingRound = createRound({ id: 'round-1', input: { message: 'original' } });
        const conversation = createEmptyConversation({ rounds: [existingRound] });

        // regenerate mints a new round id, so the superseded round must be named
        const newRound = createRound({ id: 'round-new', input: { message: 'regenerated' } });

        await runUpdate({
          conversationClient,
          conversation,
          action: 'regenerate',
          roundCompleteEvent: {
            type: ChatEventType.roundComplete,
            data: { round: newRound, resumed: false },
          },
        });

        expect(conversationClient.upsertRound).toHaveBeenCalledWith(
          expect.objectContaining({
            round: newRound,
            replacesRoundId: 'round-1',
          }),
          { access: 'converse' }
        );
      });

      it('passes only the new round when no action is provided', async () => {
        const conversationClient = createConversationClientMock();
        const existingRound = createRound({ id: 'round-1', input: { message: 'original' } });
        const conversation = createEmptyConversation({ rounds: [existingRound] });

        const newRound = createRound({ id: 'round-2', input: { message: 'new' } });

        await runUpdate({
          conversationClient,
          conversation,
          roundCompleteEvent: {
            type: ChatEventType.roundComplete,
            data: { round: newRound, resumed: false },
          },
        });

        expect(conversationClient.upsertRound).toHaveBeenCalledWith(
          expect.objectContaining({
            round: newRound,
          }),
          { access: 'converse' }
        );
        expect(conversationClient.upsertRound).not.toHaveBeenCalledWith(
          expect.objectContaining({ replacesRoundId: expect.anything() }),
          expect.anything()
        );
      });

      it('relies on the round id alone when resumed=true (HITL flow)', async () => {
        const conversationClient = createConversationClientMock();
        const existingRound = createRound({ id: 'round-1', input: { message: 'original' } });
        const conversation = createEmptyConversation({ rounds: [existingRound] });

        // a resumed round keeps the pending round's id, so it is matched by id
        const newRound = createRound({ id: 'round-1', input: { message: 'resumed' } });

        await runUpdate({
          conversationClient,
          conversation,
          roundCompleteEvent: {
            type: ChatEventType.roundComplete,
            data: { round: newRound, resumed: true },
          },
        });

        expect(conversationClient.upsertRound).toHaveBeenCalledWith(
          expect.objectContaining({
            round: newRound,
          }),
          { access: 'converse' }
        );
        expect(conversationClient.upsertRound).not.toHaveBeenCalledWith(
          expect.objectContaining({ replacesRoundId: expect.anything() }),
          expect.anything()
        );
      });
    });

    it('never passes a rounds array, so a stale snapshot cannot be written', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = createEmptyConversation({
        rounds: [createRound({ id: 'round-1', input: { message: 'original' } })],
      });

      await runUpdate({
        conversationClient,
        conversation,
        roundCompleteEvent: {
          type: ChatEventType.roundComplete,
          data: { round: createRound({ id: 'round-2' }), resumed: false },
        },
      });

      const [request] = conversationClient.upsertRound.mock.calls[0];
      expect(request).not.toHaveProperty('rounds');
      expect(request).not.toHaveProperty('title');
    });
  });

  describe('persistRoundInput (receipt-time input write)', () => {
    const withOperation = (
      conversation: Conversation,
      operation: 'CREATE' | 'UPDATE'
    ): ConversationWithOperation => ({ ...conversation, operation });

    const runReceipt = async ({
      conversation,
      conversationClient,
      roundId = 'round-1',
      receivedAt = new Date('2024-01-01T00:00:00.000Z'),
      input = { message: 'hi' },
      author,
    }: {
      conversation: ConversationWithOperation;
      conversationClient: ReturnType<typeof createConversationClientMock>;
      roundId?: string;
      receivedAt?: Date;
      input?: { message?: string };
      author?: ConversationRoundAuthor;
    }) => {
      conversationClient.appendEvents.mockResolvedValue(conversation);
      await persistRoundInput({
        conversation,
        conversationClient,
        roundId,
        receivedAt,
        input,
        author,
      });
    };

    it('atomically creates the conversation doc with the user_message seeded on CREATE (single write, no separate append)', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(
        createEmptyConversation({ id: 'conv-1', agent_id: 'agent-1' }),
        'CREATE'
      );

      await runReceipt({
        conversation,
        conversationClient,
        input: { message: 'raw input' },
        author: { id: 'u1', username: 'u1' },
      });

      // Single ES write: the doc is created atomically with the user_message inside
      // it, so an abort mid-write cannot leave an empty placeholder.
      expect(conversationClient.create).toHaveBeenCalledTimes(1);
      const [createArgs] = conversationClient.create.mock.calls[0];
      expect(createArgs.id).toBe('conv-1');
      expect(createArgs.title).toBe(DEFAULT_CONVERSATION_TITLE);
      expect(createArgs.rounds).toEqual([]);
      expect(createArgs.events).toHaveLength(1);
      expect(createArgs.events![0]).toMatchObject({
        id: 'round-1::user_message',
        type: TimelineEventType.userMessage,
        data: { message: 'raw input' },
      });

      // No separate append on the happy CREATE path — the event is inside the create.
      expect(conversationClient.appendEvents).not.toHaveBeenCalled();
    });

    it('skips create for UPDATE but still appends the user_message', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(createEmptyConversation({ id: 'conv-1' }), 'UPDATE');

      await runReceipt({ conversation, conversationClient });

      expect(conversationClient.create).not.toHaveBeenCalled();
      expect(conversationClient.appendEvents).toHaveBeenCalledTimes(1);
    });

    it('falls back to appendEvents when CREATE races another writer (conversationAlreadyExists)', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(createEmptyConversation({ id: 'conv-1' }), 'CREATE');
      conversationClient.create.mockRejectedValueOnce(
        createConversationAlreadyExistsError({ conversationId: 'conv-1' })
      );

      await runReceipt({ conversation, conversationClient });

      // The race loser still has to land the user_message on the winning doc.
      expect(conversationClient.appendEvents).toHaveBeenCalledTimes(1);
      const [appendArgs] = conversationClient.appendEvents.mock.calls[0];
      expect(appendArgs.events).toHaveLength(1);
      expect(appendArgs.events[0]).toMatchObject({
        id: 'round-1::user_message',
        type: TimelineEventType.userMessage,
      });
    });

    it('propagates unexpected create errors', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(createEmptyConversation({ id: 'conv-1' }), 'CREATE');
      const boom = new Error('boom');
      conversationClient.create.mockRejectedValueOnce(boom);

      await expect(
        persistRoundInput({
          conversation,
          conversationClient,
          roundId: 'round-1',
          receivedAt: new Date(),
          input: { message: 'hi' },
        })
      ).rejects.toBe(boom);
      expect(conversationClient.appendEvents).not.toHaveBeenCalled();
    });

    it('defaults an undefined message to an empty string so the receipt-time snapshot is a valid RoundInput', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(createEmptyConversation({ id: 'c' }), 'UPDATE');
      conversationClient.appendEvents.mockResolvedValue(conversation);

      await runReceipt({ conversation, conversationClient, input: {} });

      const [appendArgs] = conversationClient.appendEvents.mock.calls[0];
      expect((appendArgs.events[0].data as { message: string }).message).toBe('');
    });
  });

  describe('appendRoundTerminated$', () => {
    const withOperation = (
      conversation: Conversation,
      operation: 'CREATE' | 'UPDATE'
    ): ConversationWithOperation => ({ ...conversation, operation });

    const runEnd = async ({
      conversation,
      conversationClient,
      roundCompleteEvent,
      title$,
    }: {
      conversation: ConversationWithOperation;
      conversationClient: ReturnType<typeof createConversationClientMock>;
      roundCompleteEvent: RoundCompleteEvent;
      title$?: Observable<string>;
    }): Promise<ChatEvent[]> => {
      conversationClient.replaceRoundEvents.mockResolvedValue(conversation);
      return lastValueFrom(
        appendRoundTerminated$({
          conversation,
          conversationClient,
          roundCompletedEvents$: of(roundCompleteEvent),
          ...(title$ ? { title$ } : {}),
        }).pipe(toArray())
      );
    };

    it('replaces the round events with the full canonical projection and folds title + status into the same write for CREATE', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(createEmptyConversation({ id: 'conv-1' }), 'CREATE');
      const round = createRound({
        id: 'round-1',
        status: ConversationRoundStatus.completed,
        started_at: '2024-01-01T00:00:00.000Z',
        time_to_last_token: 1000,
      });

      const emitted = await runEnd({
        conversation,
        conversationClient,
        roundCompleteEvent: {
          type: ChatEventType.roundComplete,
          data: { round, resumed: false },
        },
        title$: of('Generated title'),
      });

      expect(conversationClient.replaceRoundEvents).toHaveBeenCalledTimes(1);
      expect(conversationClient.appendEvents).not.toHaveBeenCalled();
      const [args] = conversationClient.replaceRoundEvents.mock.calls[0];
      expect(args.id).toBe('conv-1');
      expect(args.roundId).toBe('round-1');
      expect(args.title).toBe('Generated title');
      expect(args.status).toBe(ConversationRoundStatus.completed);
      expect(args.events.map((event: { id: string }) => event.id)).toEqual([
        'round-1::user_message',
        'round-1::execution_started',
        'round-1::execution_terminated',
      ]);

      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe(ChatEventType.conversationCreated);
    });

    it('emits conversationUpdated for UPDATE', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(createEmptyConversation({ id: 'c' }), 'UPDATE');
      const round = createRound({ id: 'r', status: ConversationRoundStatus.completed });

      const emitted = await runEnd({
        conversation,
        conversationClient,
        roundCompleteEvent: {
          type: ChatEventType.roundComplete,
          data: { round, resumed: false },
        },
      });

      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe(ChatEventType.conversationUpdated);
    });

    it('omits title when no title$ is provided', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(createEmptyConversation({ id: 'c' }), 'UPDATE');
      const round = createRound({ id: 'r', status: ConversationRoundStatus.completed });

      await runEnd({
        conversation,
        conversationClient,
        roundCompleteEvent: {
          type: ChatEventType.roundComplete,
          data: { round, resumed: false },
        },
      });

      const [args] = conversationClient.replaceRoundEvents.mock.calls[0];
      expect(args).not.toHaveProperty('title');
    });

    it('reconciles attachments against the stored snapshot when the round produced attachments', async () => {
      const conversationClient = createConversationClientMock();
      const existingAttachment = { id: 'a', version: 1 } as any;
      const producedAttachment = { id: 'b', version: 1 } as any;
      const conversation = withOperation(
        createEmptyConversation({ id: 'c', attachments: [existingAttachment] }),
        'UPDATE'
      );
      const round = createRound({ id: 'r', status: ConversationRoundStatus.completed });

      await runEnd({
        conversation,
        conversationClient,
        roundCompleteEvent: {
          type: ChatEventType.roundComplete,
          data: {
            round,
            resumed: false,
            attachments: [producedAttachment],
          },
        },
      });

      const [args] = conversationClient.replaceRoundEvents.mock.calls[0];
      expect(args.attachments).toEqual({
        snapshot: [existingAttachment],
        produced: [producedAttachment],
      });
    });

    it('appends the full projected round events (user_message + execution_started + steps + terminated) at round-end', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = withOperation(createEmptyConversation({ id: 'conv-steps' }), 'UPDATE');
      const steps: ConversationRoundStep[] = [
        { type: ConversationRoundStepType.reasoning, reasoning: 'r' } as ConversationRoundStep,
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 't1',
          tool_id: 'platform.core.search',
          params: {},
          results: [],
        } as ConversationRoundStep,
      ];
      const round = createRound({
        id: 'round-x',
        status: ConversationRoundStatus.completed,
        steps,
      });

      await runEnd({
        conversation,
        conversationClient,
        roundCompleteEvent: {
          type: ChatEventType.roundComplete,
          data: { round, resumed: false },
        },
      });

      const [args] = conversationClient.replaceRoundEvents.mock.calls[0];
      expect(args.roundId).toBe('round-x');
      expect(args.events.map((event: { type: string; id: string }) => event.type)).toEqual([
        TimelineEventType.userMessage,
        TimelineEventType.executionStarted,
        TimelineEventType.executionStep,
        TimelineEventType.executionStep,
        TimelineEventType.executionTerminated,
      ]);
      expect(args.events.map((event: { id: string }) => event.id)).toEqual([
        'round-x::user_message',
        'round-x::execution_started',
        'round-x::step::0',
        'round-x::step::1',
        'round-x::execution_terminated',
      ]);
    });
  });

  describe('appendResumeExecution$ (append-only resume write)', () => {
    const withOperation = (
      conversation: Conversation,
      operation: 'CREATE' | 'UPDATE'
    ): ConversationWithOperation => ({ ...conversation, operation });

    // A stored, paused conversation: exec_0 exists (execution_id `round-1::execution`).
    const pausedConversation = (): ConversationWithOperation => ({
      ...withOperation(createEmptyConversation({ id: 'conv-1' }), 'UPDATE'),
      events: [
        {
          id: 'round-1::execution_terminated',
          type: TimelineEventType.executionTerminated,
          created_at: '2024-01-01T00:00:00.000Z',
          actor: { type: 'agent', id: 'agent-1' } as never,
          execution_id: 'round-1::execution',
          trigger_event_id: 'round-1::user_message',
          data: {
            model_usage: { connector_id: 'c1', llm_calls: 1, input_tokens: 1, output_tokens: 1 },
            time_to_first_token: 1,
            time_to_last_token: 1,
            outcome: { type: 'prompt_requested', prompts: [] },
          },
        },
      ] as never,
    });

    it('derives the same execution index telemetry reports, so the two cannot drift', () => {
      // `roundExecutionCount` is the single source of the index: this write path stamps it into
      // the event ids, and `buildExecutionTelemetry` reports it. A divergence would silently
      // mislabel which execution a billing record belongs to.
      const events = pausedConversation().events ?? [];

      expect(roundExecutionCount(events, 'round-1')).toBe(1);
      expect(resumeExecutionId('round-1', roundExecutionCount(events, 'round-1'))).toBe(
        'round-1::execution::1'
      );
      expect(roundExecutionCount(events, 'some-other-round')).toBe(0);
    });

    const followUpRound = () => ({
      ...createRound({ id: 'round-1', status: ConversationRoundStatus.completed }),
      started_at: '2024-01-01T00:05:00.000Z',
      time_to_last_token: 500,
      steps: [
        { type: ConversationRoundStepType.reasoning, reasoning: 'done' } as ConversationRoundStep,
      ],
      response: { message: 'ok' },
      input: { message: 'resume msg', attachment_refs: [{ attachment_id: 'att-2', version: 1 }] },
    });

    const run = (
      conversation: ConversationWithOperation,
      conversationClient: ReturnType<typeof createConversationClientMock>,
      roundCompleteEvent: RoundCompleteEvent
    ) =>
      lastValueFrom(
        appendResumeExecution$({
          conversation,
          conversationClient,
          roundCompletedEvents$: of(roundCompleteEvent),
          input: { prompts: { 'tools.my_tool.confirmation': { allow: true } } },
        }).pipe(toArray())
      );

    it('appends a prompt_response + a new exec_1 without touching exec_0', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = pausedConversation();
      conversationClient.appendEvents.mockResolvedValue(conversation);
      const follow = followUpRound();

      const emitted = await run(conversation, conversationClient, {
        type: ChatEventType.roundComplete,
        data: {
          round: createRound({ id: 'round-1', status: ConversationRoundStatus.completed }),
          resumed: true,
          resume_execution: { follow_up_round: follow },
        },
      });

      expect(conversationClient.replaceRoundEvents).not.toHaveBeenCalled();
      expect(conversationClient.appendEvents).toHaveBeenCalledTimes(1);
      const [args] = conversationClient.appendEvents.mock.calls[0];
      expect(args.events.map((e: { id: string }) => e.id)).toEqual([
        'round-1::prompt_response::1',
        'round-1::execution::1::execution_started',
        'round-1::execution::1::step::0',
        'round-1::execution::1::execution_terminated',
      ]);
      expect(args.status).toBe(ConversationRoundStatus.completed);

      const promptResponse = args.events[0];
      expect(promptResponse.type).toBe(TimelineEventType.promptResponse);
      expect(promptResponse.data).toMatchObject({
        prompt_requested_event_id: 'round-1::execution_terminated',
        responses: { 'tools.my_tool.confirmation': { allow: true } },
        input: { message: 'resume msg', attachment_refs: [{ attachment_id: 'att-2', version: 1 }] },
      });
      expect(emitted[0].type).toBe(ChatEventType.conversationUpdated);
    });

    it('derives exec_2 (index 2) for a re-pause chain', async () => {
      const conversationClient = createConversationClientMock();
      // exec_0 + exec_1 already stored -> the next resume is exec_2, answering exec_1's terminated
      const conversation: ConversationWithOperation = {
        ...pausedConversation(),
        events: [
          ...(pausedConversation().events ?? []),
          {
            id: 'round-1::execution::1::execution_terminated',
            type: TimelineEventType.executionTerminated,
            created_at: '2024-01-01T00:05:00.000Z',
            actor: { type: 'agent', id: 'agent-1' } as never,
            execution_id: 'round-1::execution::1',
            trigger_event_id: 'round-1::prompt_response::1',
            data: {
              model_usage: { connector_id: 'c1', llm_calls: 1, input_tokens: 1, output_tokens: 1 },
              time_to_first_token: 1,
              time_to_last_token: 1,
              outcome: { type: 'prompt_requested', prompts: [] },
            },
          },
        ] as never,
      };
      conversationClient.appendEvents.mockResolvedValue(conversation);

      await run(conversation, conversationClient, {
        type: ChatEventType.roundComplete,
        data: {
          round: createRound({ id: 'round-1', status: ConversationRoundStatus.completed }),
          resumed: true,
          resume_execution: { follow_up_round: followUpRound() },
        },
      });

      const [args] = conversationClient.appendEvents.mock.calls[0];
      expect(args.events[0].id).toBe('round-1::prompt_response::2');
      expect(args.events[0].data).toMatchObject({
        prompt_requested_event_id: 'round-1::execution::1::execution_terminated',
      });
      expect(args.events[1].id).toBe('round-1::execution::2::execution_started');
    });

    it('throws when the round_complete carries no resume_execution payload', async () => {
      const conversationClient = createConversationClientMock();
      await expect(
        run(pausedConversation(), conversationClient, {
          type: ChatEventType.roundComplete,
          data: {
            round: createRound({ id: 'round-1', status: ConversationRoundStatus.completed }),
            resumed: true,
          },
        })
      ).rejects.toThrow(/requires a resume_execution payload/);
    });

    it('throws when no prior execution is stored for the round', async () => {
      const conversationClient = createConversationClientMock();
      const conversation: ConversationWithOperation = {
        ...withOperation(createEmptyConversation({ id: 'conv-1' }), 'UPDATE'),
        events: [],
      };
      await expect(
        run(conversation, conversationClient, {
          type: ChatEventType.roundComplete,
          data: {
            round: createRound({ id: 'round-1', status: ConversationRoundStatus.completed }),
            resumed: true,
            resume_execution: { follow_up_round: followUpRound() },
          },
        })
      ).rejects.toThrow(/no prior execution stored/);
    });

    it('persists a resolved title alongside the resume append when title$ is provided', async () => {
      const conversationClient = createConversationClientMock();
      const conversation = pausedConversation();
      conversationClient.appendEvents.mockResolvedValue(conversation);

      await lastValueFrom(
        appendResumeExecution$({
          conversation,
          conversationClient,
          roundCompletedEvents$: of<RoundCompleteEvent>({
            type: ChatEventType.roundComplete,
            data: {
              round: createRound({ id: 'round-1', status: ConversationRoundStatus.completed }),
              resumed: true,
              resume_execution: { follow_up_round: followUpRound() },
            },
          }),
          input: { prompts: { 'tools.my_tool.confirmation': { allow: true } } },
          title$: of('Generated title'),
        }).pipe(toArray())
      );

      const [args] = conversationClient.appendEvents.mock.calls[0];
      expect(args.title).toBe('Generated title');
    });
  });
});
