/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isAIMessage, isHumanMessage, isToolMessage } from '@langchain/core/messages';
import type { AIMessage, ToolMessage, BaseMessageLike } from '@langchain/core/messages';
import { AgentActionType } from '../../actions';
import type {
  ResearchAgentAction,
  ToolCallAction,
  ExecuteToolAction,
  BackgroundExecutionCompleteAction,
} from '../../actions';
import { formatResearcherActionHistory, formatSystemNotice } from './actions';
import { ExecutionStatus, ToolResultType } from '@kbn/agent-builder-common';
import type { ToolResult } from '@kbn/agent-builder-common';
import type { ToolManager } from '@kbn/agent-builder-server/runner';
import type { BackgroundExecutionState } from '@kbn/agent-builder-common/chat';
import type { ToolCallResultTransformer } from '../../utils/tool_summarization';

const makeToolCallAction = (
  toolCalls: Array<{ toolCallId: string; toolName: string; args?: Record<string, any> }>,
  message?: string,
  cycle?: number
): ToolCallAction => ({
  type: AgentActionType.ToolCall,
  tool_call_group_id: 'tool_call_group_id',
  tool_calls: toolCalls.map((tc) => ({
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    args: tc.args ?? {},
  })),
  message,
  cycle,
});

const makeExecuteToolAction = (
  results: Array<{ toolCallId: string; content: string; artifact?: { results: ToolResult[] } }>,
  cycle?: number
): ExecuteToolAction => ({
  type: AgentActionType.ExecuteTool,
  tool_results: results.map((r) => ({
    toolCallId: r.toolCallId,
    content: r.content,
    artifact: r.artifact,
  })),
  cycle,
});

const makeCompletedExecution = (
  overrides: Partial<BackgroundExecutionState> = {}
): BackgroundExecutionState => ({
  execution_id: 'exec-123',
  status: ExecutionStatus.completed,
  response: { message: 'The task is done.' },
  completed_at: { round_id: 'round-1' },
  ...overrides,
});

const makeFailedExecution = (
  overrides: Partial<BackgroundExecutionState> = {}
): BackgroundExecutionState => ({
  execution_id: 'exec-456',
  status: ExecutionStatus.failed,
  error: { code: 'internalError' as any, message: 'LLM timeout' },
  completed_at: { round_id: 'round-1' },
  ...overrides,
});

const makeBackgroundExecutionCompleteAction = (
  execution: BackgroundExecutionState
): BackgroundExecutionCompleteAction => ({
  type: AgentActionType.BackgroundExecutionComplete,
  execution,
});

describe('formatResearcherActionHistory', () => {
  it('creates AIMessage with empty content when no message is set', async () => {
    const actions: ResearchAgentAction[] = [
      makeToolCallAction([{ toolCallId: 'c1', toolName: 'search', args: { q: 'foo' } }]),
      makeExecuteToolAction([{ toolCallId: 'c1', content: 'result' }]),
    ];

    const messages = await formatResearcherActionHistory({ actions, cycleLimit: 100 });

    const aiMsg = messages[0];
    expect(isAIMessage(aiMsg as AIMessage)).toBe(true);
    expect((aiMsg as AIMessage).content).toBe('');
  });

  it('sets AIMessage content to the action message when provided', async () => {
    const actions: ResearchAgentAction[] = [
      makeToolCallAction(
        [{ toolCallId: 'c1', toolName: 'search', args: { q: 'foo' } }],
        'I need to search for foo'
      ),
      makeExecuteToolAction([{ toolCallId: 'c1', content: 'result' }]),
    ];

    const messages = await formatResearcherActionHistory({ actions, cycleLimit: 100 });

    const aiMsg = messages[0];
    expect(isAIMessage(aiMsg as AIMessage)).toBe(true);
    expect((aiMsg as AIMessage).content).toBe('I need to search for foo');
  });

  it('preserves tool call args in the AIMessage', async () => {
    const actions: ResearchAgentAction[] = [
      makeToolCallAction([
        { toolCallId: 'c1', toolName: 'search', args: { q: 'foo' } },
        { toolCallId: 'c2', toolName: 'lookup', args: { id: 42 } },
      ]),
      makeExecuteToolAction([
        { toolCallId: 'c1', content: 'result1' },
        { toolCallId: 'c2', content: 'result2' },
      ]),
    ];

    const messages = await formatResearcherActionHistory({ actions, cycleLimit: 100 });

    const aiMsg = messages[0] as AIMessage;
    expect(aiMsg.tool_calls).toHaveLength(2);
    expect(aiMsg.tool_calls![0].args).toEqual({ q: 'foo' });
    expect(aiMsg.tool_calls![1].args).toEqual({ id: 42 });
  });

  it('formats BackgroundExecutionCompleteAction as a user message with system notice', async () => {
    const actions: ResearchAgentAction[] = [
      makeToolCallAction([{ toolCallId: 'c1', toolName: 'search' }]),
      makeExecuteToolAction([{ toolCallId: 'c1', content: 'result' }]),
      makeBackgroundExecutionCompleteAction(makeCompletedExecution()),
    ];

    const messages = await formatResearcherActionHistory({ actions, cycleLimit: 100 });

    // Tool call (AI) + tool result + background notice (user message)
    const lastMessage = messages[messages.length - 1];
    expect(isHumanMessage(lastMessage as any)).toBe(true);
    expect((lastMessage as any).content).toContain('<system_notice>');
    expect((lastMessage as any).content).toContain('exec-123');
  });

  it('formats failed BackgroundExecutionCompleteAction as a user message', async () => {
    const actions: ResearchAgentAction[] = [
      makeBackgroundExecutionCompleteAction(makeFailedExecution()),
    ];

    const messages = await formatResearcherActionHistory({ actions, cycleLimit: 100 });

    expect(messages).toHaveLength(1);
    expect(isHumanMessage(messages[0] as any)).toBe(true);
    expect((messages[0] as any).content).toContain('has failed');
    expect((messages[0] as any).content).toContain('LLM timeout');
  });

  describe('intra-round compaction', () => {
    // ~15k tokens of content per cycle, so a handful of cycles exceeds the threshold.
    const bigContent = 'x'.repeat(60_000);
    const mockToolManager = {
      getToolIdMapping: () => new Map<string, string>(),
    } as unknown as ToolManager;

    const makeCycle = (n: number): ResearchAgentAction[] => [
      makeToolCallAction(
        [{ toolCallId: `c${n}`, toolName: 'search', args: { q: 'foo' } }],
        undefined,
        n
      ),
      makeExecuteToolAction(
        [
          {
            toolCallId: `c${n}`,
            content: bigContent,
            artifact: {
              results: [
                {
                  type: ToolResultType.other,
                  tool_result_id: `r${n}`,
                  data: { value: bigContent },
                },
              ],
            },
          },
        ],
        n
      ),
    ];

    const toolMessageById = (messages: BaseMessageLike[], id: string): ToolMessage | undefined =>
      messages
        .filter((message): message is ToolMessage => isToolMessage(message as any))
        .find((message) => message.tool_call_id === id);

    it('compacts older cycles while preserving the most recent ones when over the threshold', async () => {
      const actions: ResearchAgentAction[] = [
        ...makeCycle(1),
        ...makeCycle(2),
        ...makeCycle(3),
        ...makeCycle(4),
      ];
      const resultTransformer: ToolCallResultTransformer = jest.fn(async () => [
        { type: ToolResultType.other, tool_result_id: 'sum', data: { summary: 'compacted' } },
      ]);

      const messages = await formatResearcherActionHistory({
        actions,
        cycleLimit: 100,
        resultTransformer,
        toolManager: mockToolManager,
      });

      // maxCycle=4, cutoff=2 -> cycles 1 & 2 compacted, cycles 3 & 4 kept verbatim.
      expect(toolMessageById(messages, 'c1')!.content).toContain('compacted');
      expect(toolMessageById(messages, 'c1')!.content).not.toContain(bigContent);
      expect(toolMessageById(messages, 'c2')!.content).toContain('compacted');
      expect(toolMessageById(messages, 'c3')!.content).toContain(bigContent);
      expect(toolMessageById(messages, 'c4')!.content).toContain(bigContent);

      expect(resultTransformer).toHaveBeenCalledTimes(2);
      expect(resultTransformer).toHaveBeenCalledWith(
        expect.objectContaining({ tool_call_id: 'c1' }),
        {
          forceFilestoreSubstitution: true,
        }
      );
    });

    it('leaves the round verbatim when under the threshold', async () => {
      const actions: ResearchAgentAction[] = [
        makeToolCallAction([{ toolCallId: 'c1', toolName: 'search' }], undefined, 1),
        makeExecuteToolAction([{ toolCallId: 'c1', content: 'small result' }], 1),
      ];
      const resultTransformer: ToolCallResultTransformer = jest.fn();

      const messages = await formatResearcherActionHistory({
        actions,
        cycleLimit: 100,
        resultTransformer,
        toolManager: mockToolManager,
      });

      expect(resultTransformer).not.toHaveBeenCalled();
      expect(toolMessageById(messages, 'c1')!.content).toContain('small result');
    });

    it('keeps tool results verbatim when no transformer is wired even if large', async () => {
      const actions: ResearchAgentAction[] = [
        ...makeCycle(1),
        ...makeCycle(2),
        ...makeCycle(3),
        ...makeCycle(4),
      ];

      const messages = await formatResearcherActionHistory({ actions, cycleLimit: 100 });

      expect(toolMessageById(messages, 'c1')!.content).toContain(bigContent);
    });
  });
});

describe('formatSystemNotice', () => {
  it('formats a completed execution as a system notice with result', () => {
    const notice = formatSystemNotice(makeCompletedExecution());

    expect(notice).toContain('<system_notice>');
    expect(notice).toContain('</system_notice>');
    expect(notice).toContain('<execution-id>exec-123</execution-id>');
    expect(notice).toContain('<status>completed</status>');
    expect(notice).toContain('<result>The task is done.</result>');
    expect(notice).not.toContain('<error>');
  });

  it('formats a failed execution as a system notice with error', () => {
    const notice = formatSystemNotice(makeFailedExecution());

    expect(notice).toContain('<system_notice>');
    expect(notice).toContain('has failed');
    expect(notice).toContain('<execution-id>exec-456</execution-id>');
    expect(notice).toContain('<status>failed</status>');
    expect(notice).toContain('<error>LLM timeout</error>');
    expect(notice).not.toContain('<result>');
  });

  it('uses "No response" when completed execution has no response', () => {
    const notice = formatSystemNotice(makeCompletedExecution({ response: undefined }));

    expect(notice).toContain('<result>No response</result>');
  });
});
