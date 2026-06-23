/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import {
  ChatEventType,
  ConversationRoundStatus,
  ConversationRoundStepType,
} from '@kbn/agent-builder-common';
import type { CompactionStructuredData, CompactionSummary } from '@kbn/agent-builder-common';
import type { AgentEventEmitterFn } from '@kbn/agent-builder-server';
import { createAttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { estimateTokens } from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import type { ProcessedConversation, ProcessedConversationRound } from './prepare_conversation';
import type { ContextBudget } from './context_budget';
import { compactConversation, extractProgrammaticSummary } from './conversation_compactor';
import { serializeCompactionSummary } from './compaction_serialize';

const mockLogger: Logger = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  log: jest.fn(),
  get: jest.fn(),
  isLevelEnabled: jest.fn().mockReturnValue(true),
} as unknown as Logger;

const createMockRound = (
  id: string,
  messageLength: number = 100,
  toolResults: number = 0
): ProcessedConversationRound => {
  const steps = Array.from({ length: toolResults }, (_, i) => ({
    type: ConversationRoundStepType.toolCall as const,
    tool_call_id: `${id}-tc-${i}`,
    tool_id: `tool-${i}`,
    params: { indices: ['test-index'], query: 'FROM test-index | LIMIT 10' },
    results: [
      {
        type: 'other' as const,
        tool_result_id: `result-${i}`,
        data: { value: 'x'.repeat(200) },
      },
    ],
    progression: [],
  }));

  return {
    id,
    status: ConversationRoundStatus.completed,
    input: {
      message: `User message ${id}: ${'x'.repeat(messageLength)}`,
      attachments: [],
    },
    steps,
    response: { message: `Assistant response ${id}: ${'y'.repeat(messageLength)}` },
    started_at: new Date().toISOString(),
    time_to_first_token: 100,
    time_to_last_token: 200,
    model_usage: {
      llm_calls: 1,
      input_tokens: 100,
      output_tokens: 50,
      connector_id: 'test-connector',
    },
  };
};

const createMockConversation = (rounds: ProcessedConversationRound[]): ProcessedConversation => ({
  previousRounds: rounds,
  nextInput: { message: 'current question', attachments: [] },
  attachments: [],
  attachmentTypes: [],
  attachmentStateManager: createAttachmentStateManager([], {
    getTypeDefinition: () => undefined,
  } as any),
});

// Stand-in for the per-round vector computed upstream by estimatePerRoundTokens.
const countsFor = (conversation: ProcessedConversation): number[] =>
  conversation.previousRounds.map((round) => estimateTokens(JSON.stringify(round)));

const createMockChatModel = () =>
  ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        discussion_summary: 'Test conversation summary',
        user_intent: 'Investigate test data',
        key_topics: ['testing', 'data'],
        entities: [{ type: 'index', name: 'test-index' }],
        outcomes_and_decisions: ['Decided to use approach A'],
        unanswered_questions: [],
      }),
    }),
  } as any);

describe('extractProgrammaticSummary', () => {
  it('should extract tool calls from round steps', () => {
    const rounds = [createMockRound('r1', 50, 2), createMockRound('r2', 50, 1)];
    const result = extractProgrammaticSummary(rounds);

    expect(result.tool_calls_summary).toHaveLength(3);
    expect(result.tool_calls_summary[0].tool_id).toBe('tool-0');
    expect(result.tool_calls_summary[0].params_summary).toContain('test-index');
  });

  it('should not extract entities (delegated to LLM)', () => {
    const rounds = [createMockRound('r1', 50, 1)];
    const result = extractProgrammaticSummary(rounds);

    expect(result).not.toHaveProperty('entities');
  });

  it('should generate agent_actions for each tool call', () => {
    const rounds = [createMockRound('r1', 50, 2)];
    const result = extractProgrammaticSummary(rounds);

    expect(result.agent_actions).toHaveLength(2);
    expect(result.agent_actions[0]).toContain('Called tool-0');
  });

  it('should handle rounds with no tool calls', () => {
    const rounds = [createMockRound('r1', 50, 0)];
    const result = extractProgrammaticSummary(rounds);

    expect(result.tool_calls_summary).toHaveLength(0);
    expect(result.agent_actions).toHaveLength(0);
  });

  it('should truncate long params summaries', () => {
    const round: ProcessedConversationRound = {
      ...createMockRound('r1', 50, 0),
      steps: [
        {
          type: ConversationRoundStepType.toolCall as const,
          tool_call_id: 'tc-long',
          tool_id: 'search',
          params: { query: 'x'.repeat(200) },
          results: [],
          progression: [],
        },
      ],
    };

    const result = extractProgrammaticSummary([round]);

    expect(result.tool_calls_summary[0].params_summary.length).toBeLessThanOrEqual(121);
  });
});

describe('serializeCompactionSummary', () => {
  it('should serialize structured data into readable text', () => {
    const data: CompactionStructuredData = {
      discussion_summary: 'User investigated slow queries.',
      user_intent: 'Debug query performance',
      key_topics: ['performance', 'queries'],
      outcomes_and_decisions: ['Root cause was missing mappings'],
      agent_actions: ['Called search(index=orders)'],
      entities: [{ type: 'index', name: 'orders' }],
      unanswered_questions: ['How to optimize further?'],
      tool_calls_summary: [{ tool_id: 'search', params_summary: 'index=orders' }],
    };

    const result = serializeCompactionSummary(data);

    expect(result).toContain('Conversation Summary');
    expect(result).toContain('Debug query performance');
    expect(result).toContain('User investigated slow queries');
    expect(result).toContain('performance, queries');
    expect(result).toContain('orders');
    expect(result).toContain('[search]');
    expect(result).toContain('How to optimize further?');
  });

  it('should omit empty sections', () => {
    const data: CompactionStructuredData = {
      discussion_summary: 'Brief summary',
      user_intent: 'Test intent',
      key_topics: [],
      outcomes_and_decisions: [],
      agent_actions: [],
      entities: [],
      unanswered_questions: [],
      tool_calls_summary: [],
    };

    const result = serializeCompactionSummary(data);

    expect(result).not.toContain('Key Topics');
    expect(result).not.toContain('Entities');
    expect(result).not.toContain('Tool Call History');
  });
});

describe('compactConversation', () => {
  it('should not compact when under threshold', async () => {
    const rounds = [createMockRound('r1', 50), createMockRound('r2', 50)];
    const conversation = createMockConversation(rounds);

    const budget: ContextBudget = {
      totalBudget: 128000,
      historyBudget: 96000,
      triggerThreshold: 72000,
    };

    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel: createMockChatModel(),
      contextBudget: budget,
      logger: mockLogger,
    });

    expect(result.compactionTriggered).toBe(false);
    expect(result.summary).toBeUndefined();
    expect(result.processedConversation.previousRounds).toHaveLength(2);
  });

  it('should trigger LLM summarization when over threshold', async () => {
    const rounds = [
      createMockRound('r1', 2000, 3),
      createMockRound('r2', 2000, 3),
      createMockRound('r3', 2000, 3),
      createMockRound('r4', 200),
      createMockRound('r5', 200),
    ];
    const conversation = createMockConversation(rounds);

    const budget: ContextBudget = {
      totalBudget: 500,
      historyBudget: 375,
      triggerThreshold: 100,
    };

    const chatModel = createMockChatModel();
    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel,
      contextBudget: budget,
      logger: mockLogger,
    });

    expect(result.compactionTriggered).toBe(true);
    expect(chatModel.withStructuredOutput).toHaveBeenCalled();
  });

  it('should merge programmatic and LLM fields in the summary', async () => {
    const rounds = [
      createMockRound('r1', 2000, 2),
      createMockRound('r2', 2000, 1),
      createMockRound('recent-1', 200),
      createMockRound('recent-2', 200),
    ];
    const conversation = createMockConversation(rounds);

    const budget: ContextBudget = {
      totalBudget: 500,
      historyBudget: 375,
      triggerThreshold: 100,
    };

    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel: createMockChatModel(),
      contextBudget: budget,
      logger: mockLogger,
    });

    expect(result.compactionTriggered).toBe(true);
    expect(result.summary).toBeDefined();

    const { structured_data: data } = result.summary!;

    // LLM-generated fields
    expect(data.discussion_summary).toBe('Test conversation summary');
    expect(data.user_intent).toBe('Investigate test data');

    // LLM-extracted entities
    expect(data.entities.length).toBeGreaterThan(0);
    expect(data.entities[0]).toEqual({ type: 'index', name: 'test-index' });

    // Programmatically extracted fields
    expect(data.tool_calls_summary.length).toBeGreaterThan(0);
    expect(data.tool_calls_summary[0].tool_id).toBe('tool-0');
    expect(data.agent_actions.length).toBeGreaterThan(0);
  });

  it('should reuse existing summary without triggering new compaction when effective tokens are under threshold', async () => {
    const rounds = [
      createMockRound('r1', 50),
      createMockRound('r2', 50),
      createMockRound('r3', 50),
    ];
    const conversation = createMockConversation(rounds);

    const existingSummary: CompactionSummary = {
      summarized_round_count: 1,
      created_at: new Date().toISOString(),
      token_count: 100,
      structured_data: {
        discussion_summary: 'Previous summary',
        user_intent: 'Test',
        key_topics: [],
        outcomes_and_decisions: [],
        agent_actions: [],
        entities: [],
        unanswered_questions: [],
        tool_calls_summary: [],
      },
    };

    // Threshold high enough that summary (100) + non-summarized rounds fit
    const budget: ContextBudget = {
      totalBudget: 50000,
      historyBudget: 37500,
      triggerThreshold: 5000,
    };

    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel: createMockChatModel(),
      contextBudget: budget,
      existingSummary,
      logger: mockLogger,
    });

    // Existing summary is applied but no new compaction event fires
    expect(result.compactionTriggered).toBe(false);
    expect(result.summary).toBe(existingSummary);
    // Round r1 was summarized, only r2 and r3 remain
    expect(result.processedConversation.previousRounds).toHaveLength(2);
  });

  it('should regenerate summary when effective tokens exceed threshold despite existing summary', async () => {
    const rounds = [
      createMockRound('r1', 2000, 2),
      createMockRound('r2', 2000, 2),
      createMockRound('r3', 2000, 2),
      createMockRound('r4', 2000, 2),
      createMockRound('recent-1', 200),
      createMockRound('recent-2', 200),
    ];
    const conversation = createMockConversation(rounds);

    // Stale summary that only covered the first round
    const existingSummary: CompactionSummary = {
      summarized_round_count: 1,
      created_at: new Date().toISOString(),
      token_count: 100,
      structured_data: {
        discussion_summary: 'Old summary',
        user_intent: 'Old intent',
        key_topics: [],
        outcomes_and_decisions: [],
        agent_actions: [],
        entities: [],
        unanswered_questions: [],
        tool_calls_summary: [],
      },
    };

    // Threshold low enough that the non-summarized rounds still exceed it
    const budget: ContextBudget = {
      totalBudget: 500,
      historyBudget: 375,
      triggerThreshold: 100,
    };

    const chatModel = createMockChatModel();
    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel,
      contextBudget: budget,
      existingSummary,
      logger: mockLogger,
    });

    expect(result.compactionTriggered).toBe(true);
    // New summary should have been generated (not the old one)
    expect(result.summary).not.toBe(existingSummary);
    expect(chatModel.withStructuredOutput).toHaveBeenCalled();
  });

  it('should preserve the most recent rounds during compaction', async () => {
    const rounds = [
      createMockRound('old-1', 2000, 5),
      createMockRound('old-2', 2000, 5),
      createMockRound('recent-1', 200),
      createMockRound('recent-2', 200),
    ];
    const conversation = createMockConversation(rounds);

    const budget: ContextBudget = {
      totalBudget: 500,
      historyBudget: 375,
      triggerThreshold: 100,
    };

    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel: createMockChatModel(),
      contextBudget: budget,
      logger: mockLogger,
    });

    expect(result.compactionTriggered).toBe(true);
    const roundIds = result.processedConversation.previousRounds.map((r) => r.id);
    expect(roundIds).toContain('recent-1');
    expect(roundIds).toContain('recent-2');
  });

  it('should handle single-round conversations without error', async () => {
    const rounds = [createMockRound('r1', 50)];
    const conversation = createMockConversation(rounds);

    const budget: ContextBudget = {
      totalBudget: 128000,
      historyBudget: 96000,
      triggerThreshold: 72000,
    };

    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel: createMockChatModel(),
      contextBudget: budget,
      logger: mockLogger,
    });

    expect(result.compactionTriggered).toBe(false);
    expect(result.processedConversation.previousRounds).toHaveLength(1);
  });

  it('should handle empty conversations', async () => {
    const conversation = createMockConversation([]);

    const budget: ContextBudget = {
      totalBudget: 128000,
      historyBudget: 96000,
      triggerThreshold: 72000,
    };

    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel: createMockChatModel(),
      contextBudget: budget,
      logger: mockLogger,
    });

    expect(result.compactionTriggered).toBe(false);
    expect(result.processedConversation.previousRounds).toHaveLength(0);
  });

  it('should include token counts when compaction is triggered', async () => {
    const rounds = [
      createMockRound('r1', 2000, 2),
      createMockRound('r2', 2000, 1),
      createMockRound('recent-1', 200),
      createMockRound('recent-2', 200),
    ];
    const conversation = createMockConversation(rounds);

    const budget: ContextBudget = {
      totalBudget: 500,
      historyBudget: 375,
      triggerThreshold: 100,
    };

    const result = await compactConversation({
      processedConversation: conversation,
      perRoundTokenCounts: countsFor(conversation),
      chatModel: createMockChatModel(),
      contextBudget: budget,
      logger: mockLogger,
    });

    expect(result.compactionTriggered).toBe(true);
    expect(result.tokensBefore).toBeGreaterThan(0);
    expect(result.tokensAfter).toBeDefined();
    expect(result.summarizedRoundCount).toBeGreaterThan(0);
  });

  describe('event emission', () => {
    const compactionBudget: ContextBudget = {
      totalBudget: 500,
      historyBudget: 375,
      triggerThreshold: 100,
    };

    const noCompactionBudget: ContextBudget = {
      totalBudget: 128000,
      historyBudget: 96000,
      triggerThreshold: 72000,
    };

    let mockEventEmitter: jest.MockedFunction<AgentEventEmitterFn>;

    beforeEach(() => {
      mockEventEmitter = jest.fn();
    });

    it('should not emit events when compaction is not triggered', async () => {
      // Empty conversation never triggers compaction
      const conversation = createMockConversation([]);

      await compactConversation({
        processedConversation: conversation,
        perRoundTokenCounts: countsFor(conversation),
        chatModel: createMockChatModel(),
        contextBudget: noCompactionBudget,
        logger: mockLogger,
        eventEmitter: mockEventEmitter,
      });

      expect(mockEventEmitter).not.toHaveBeenCalled();
    });

    it('should emit compactionStarted before compactionCompleted when compaction is triggered', async () => {
      const rounds = [
        createMockRound('r1', 2000, 3),
        createMockRound('r2', 2000, 3),
        createMockRound('r3', 2000, 3),
        createMockRound('recent-1', 200),
        createMockRound('recent-2', 200),
      ];
      const conversation = createMockConversation(rounds);

      await compactConversation({
        processedConversation: conversation,
        perRoundTokenCounts: countsFor(conversation),
        chatModel: createMockChatModel(),
        contextBudget: compactionBudget,
        logger: mockLogger,
        eventEmitter: mockEventEmitter,
      });

      expect(mockEventEmitter).toHaveBeenCalledTimes(2);

      const [startedCall, completedCall] = mockEventEmitter.mock.calls;
      expect(startedCall[0].type).toBe(ChatEventType.compactionStarted);
      expect(completedCall[0].type).toBe(ChatEventType.compactionCompleted);

      // Verify ordering via invocation order
      const startedOrder = mockEventEmitter.mock.invocationCallOrder[0];
      const completedOrder = mockEventEmitter.mock.invocationCallOrder[1];
      expect(startedOrder).toBeLessThan(completedOrder);
    });

    it('should emit compactionStarted with correct token_count_before', async () => {
      const rounds = [
        createMockRound('r1', 2000, 2),
        createMockRound('r2', 2000, 1),
        createMockRound('recent-1', 200),
        createMockRound('recent-2', 200),
      ];
      const conversation = createMockConversation(rounds);

      const result = await compactConversation({
        processedConversation: conversation,
        perRoundTokenCounts: countsFor(conversation),
        chatModel: createMockChatModel(),
        contextBudget: compactionBudget,
        logger: mockLogger,
        eventEmitter: mockEventEmitter,
      });

      const startedEvent = mockEventEmitter.mock.calls[0][0];
      expect(startedEvent.type).toBe(ChatEventType.compactionStarted);
      expect((startedEvent as any).data.token_count_before).toBe(result.tokensBefore);
    });

    it('should emit compactionCompleted with correct token_count_after and summarized_round_count', async () => {
      const rounds = [
        createMockRound('r1', 2000, 2),
        createMockRound('r2', 2000, 1),
        createMockRound('recent-1', 200),
        createMockRound('recent-2', 200),
      ];
      const conversation = createMockConversation(rounds);

      const result = await compactConversation({
        processedConversation: conversation,
        perRoundTokenCounts: countsFor(conversation),
        chatModel: createMockChatModel(),
        contextBudget: compactionBudget,
        logger: mockLogger,
        eventEmitter: mockEventEmitter,
      });

      const completedEvent = mockEventEmitter.mock.calls[1][0];
      expect(completedEvent.type).toBe(ChatEventType.compactionCompleted);
      expect((completedEvent as any).data.token_count_after).toBe(result.tokensAfter);
      expect((completedEvent as any).data.summarized_round_count).toBe(result.summarizedRoundCount);
    });

    it('should not emit events when eventEmitter is not provided', async () => {
      const rounds = [
        createMockRound('r1', 2000, 3),
        createMockRound('r2', 2000, 3),
        createMockRound('recent-1', 200),
        createMockRound('recent-2', 200),
      ];
      const conversation = createMockConversation(rounds);

      // No eventEmitter passed — should not throw
      const result = await compactConversation({
        processedConversation: conversation,
        perRoundTokenCounts: countsFor(conversation),
        chatModel: createMockChatModel(),
        contextBudget: compactionBudget,
        logger: mockLogger,
      });

      expect(result.compactionTriggered).toBe(true);
    });
  });
});
