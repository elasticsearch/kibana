/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { ToolCallWithResult, ToolResult } from '@kbn/agent-builder-common';
import {
  ConversationRoundStatus,
  ConversationRoundStepType,
  ToolResultType,
} from '@kbn/agent-builder-common';
import type { ToolManager } from '@kbn/agent-builder-server/runner';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import type { ProcessedConversationRound } from './prepare_conversation';
import { estimateMessagesTokens, estimatePerRoundTokens } from './estimate_conversation_tokens';

const createMockToolManager = (
  summarizers: Map<
    string,
    (step: ToolCallWithResult) => ToolResult[] | null | undefined
  > = new Map()
): ToolManager =>
  ({
    getSummarizer: jest.fn((toolId: string) => summarizers.get(toolId)),
  } as unknown as ToolManager);

const createMockToolRegistry = (): ToolRegistry =>
  ({ get: jest.fn(async () => undefined) } as unknown as ToolRegistry);

const createMockRound = (toolResultValue: string): ProcessedConversationRound =>
  ({
    id: 'round-1',
    status: ConversationRoundStatus.completed,
    input: { message: 'hello', attachments: [] },
    steps: [
      {
        type: ConversationRoundStepType.toolCall,
        tool_call_id: 'tc-1',
        tool_id: 'search',
        params: { query: 'test' },
        results: [
          { type: ToolResultType.other, tool_result_id: 'r-1', data: { value: toolResultValue } },
        ],
        progression: [],
      },
    ],
    response: { message: 'done' },
  } as unknown as ProcessedConversationRound);

describe('estimateMessagesTokens', () => {
  it('counts message content (~4 chars per token)', () => {
    expect(estimateMessagesTokens([new HumanMessage('a'.repeat(40))])).toBe(10);
  });

  it('counts tool_calls on AI messages in addition to content', () => {
    const withTools = estimateMessagesTokens([
      new AIMessage({
        content: '',
        tool_calls: [
          { id: '1', name: 'search', args: { query: 'x'.repeat(80) }, type: 'tool_call' },
        ],
      }),
    ]);
    const withoutTools = estimateMessagesTokens([new AIMessage({ content: '' })]);
    expect(withTools).toBeGreaterThan(withoutTools);
  });

  it('counts tool result message content', () => {
    expect(
      estimateMessagesTokens([new ToolMessage({ content: 'x'.repeat(40), tool_call_id: '1' })])
    ).toBe(10);
  });
});

describe('estimatePerRoundTokens', () => {
  it('returns one positive count per round', async () => {
    const counts = await estimatePerRoundTokens(
      [createMockRound('data'), createMockRound('data')],
      {
        toolManager: createMockToolManager(),
        toolRegistry: createMockToolRegistry(),
      }
    );
    expect(counts).toHaveLength(2);
    counts.forEach((count) => expect(count).toBeGreaterThan(0));
  });

  it('reflects tool-result summarization in the estimate', async () => {
    const bigRound = createMockRound('x'.repeat(4000));

    const rawCounts = await estimatePerRoundTokens([bigRound], {
      toolManager: createMockToolManager(),
      toolRegistry: createMockToolRegistry(),
    });

    const summarizedCounts = await estimatePerRoundTokens([bigRound], {
      toolManager: createMockToolManager(
        new Map([
          [
            'search',
            () => [{ type: ToolResultType.other, tool_result_id: 'r-1', data: { value: 'tiny' } }],
          ],
        ])
      ),
      toolRegistry: createMockToolRegistry(),
    });

    expect(summarizedCounts[0]).toBeLessThan(rawCounts[0]);
  });
});
