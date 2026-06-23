/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AIMessage, ToolMessage } from '@langchain/core/messages';
import { isAIMessage, isHumanMessage } from '@langchain/core/messages';
import type {
  ConversationRoundStep,
  ReasoningStep,
  ToolCallStep,
  ToolCallWithResult,
} from '@kbn/agent-builder-common';
import {
  ConversationRoundStatus,
  ConversationRoundStepType,
  ExecutionStatus,
} from '@kbn/agent-builder-common';
import type { BackgroundExecutionState } from '@kbn/agent-builder-common/chat';
import { sanitizeToolId, wrapToolResultContent } from '@kbn/agent-builder-genai-utils/langchain';
import { convertPreviousRounds, groupToolCallSteps } from './to_langchain_messages';
import type { ToolCallResultTransformer } from './tool_summarization';
import type { ToolResult } from '@kbn/agent-builder-common/tools/tool_result';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { createAttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import type { ProcessedAttachment, ProcessedRoundInput } from '@kbn/agent-builder-server';
import type { ProcessedConversation, ProcessedConversationRound } from './prepare_conversation';

describe('convertPreviousRounds', () => {
  const now = new Date().toISOString();

  const makeRoundInput = (
    message: string,
    attachments: ProcessedAttachment[] = []
  ): ProcessedRoundInput => ({
    message,
    attachments,
  });
  const makeAssistantResponse = (message: string) => ({ message });
  const makeToolCallWithResult = (
    id: string,
    toolId: string,
    params: any,
    results: ToolResult[]
  ): ToolCallWithResult => ({
    tool_call_id: id,
    tool_id: toolId,
    params,
    results,
  });
  const makeToolCallStep = (toolCall: ToolCallWithResult): ToolCallStep => ({
    ...toolCall,
    type: ConversationRoundStepType.toolCall,
  });
  const makeProcessedAttachment = (
    id: string,
    type: string,
    data: any,
    representationValue: string
  ): ProcessedAttachment => ({
    attachment: {
      id,
      type,
      data,
    },
    representation: {
      type: 'text',
      value: representationValue,
    },
    tools: [],
  });

  const createConversation = (
    parts: Partial<ProcessedConversation> = {}
  ): ProcessedConversation => {
    return {
      nextInput: { message: '', attachments: [] },
      previousRounds: [],
      attachments: [],
      attachmentTypes: [],
      attachmentStateManager: createAttachmentStateManager([], {
        getTypeDefinition: (type: string) =>
          ({
            id: type,
            validate: (input: unknown) => ({ valid: true, data: input }),
            format: () => ({ getRepresentation: () => ({ type: 'text', value: '' }) }),
          } as any),
      }),
      ...parts,
    };
  };

  const createRound = (
    parts: Partial<ProcessedConversationRound> = {}
  ): ProcessedConversationRound => {
    return {
      id: 'round-1',
      status: ConversationRoundStatus.completed,
      input: {
        message: '',
        attachments: [],
      },
      steps: [],
      response: {
        message: 'Response',
      },
      started_at: new Date().toISOString(),
      time_to_first_token: 0,
      time_to_last_token: 0,
      model_usage: {
        connector_id: 'unknown',
        llm_calls: 1,
        input_tokens: 12,
        output_tokens: 42,
      },
      ...parts,
    };
  };

  it('returns only the user message if no previous rounds', async () => {
    const nextInput = makeRoundInput('hello');
    const result = await convertPreviousRounds({
      conversation: createConversation({ nextInput }),
    });
    expect(result).toHaveLength(1);
    expect(isHumanMessage(result[0])).toBe(true);
    expect(result[0].content).toBe('hello');
  });

  it('handles a round with only user and assistant messages', async () => {
    const previousRounds = [
      createRound({
        id: 'round-1',
        input: makeRoundInput('hi'),
        steps: [],
        response: makeAssistantResponse('hello!'),
        started_at: now,
        time_to_first_token: 42,
        time_to_last_token: 100,
      }),
    ];
    const nextInput = makeRoundInput('how are you?');
    const result = await convertPreviousRounds({
      conversation: createConversation({ previousRounds, nextInput }),
    });

    expect(result).toHaveLength(3);

    const [firstHumanMessage, firstAssistantMessage, secondHumanMessage] = result;
    expect(isHumanMessage(firstHumanMessage)).toBe(true);
    expect(firstHumanMessage.content).toBe('hi');
    expect(isAIMessage(firstAssistantMessage)).toBe(true);
    expect(firstAssistantMessage.content).toBe('hello!');
    expect(isHumanMessage(secondHumanMessage)).toBe(true);
    expect(secondHumanMessage.content).toBe('how are you?');
  });

  it('handles a round with a tool call step', async () => {
    const toolCall = makeToolCallWithResult('call-1', 'search', { query: 'foo' }, [
      {
        tool_result_id: 'result-1',
        type: ToolResultType.other,
        data: {
          some: 'result1',
        },
      },
    ]);
    const previousRounds = [
      createRound({
        id: 'round-1',
        input: makeRoundInput('find foo'),
        steps: [makeToolCallStep(toolCall)],
        response: makeAssistantResponse('done!'),
        started_at: now,
        time_to_first_token: 42,
        time_to_last_token: 100,
      }),
    ];
    const nextInput = makeRoundInput('next');
    const result = await convertPreviousRounds({
      conversation: createConversation({ previousRounds, nextInput }),
    });
    // 1 user + 1 tool call (AI + Tool) + 1 assistant + 1 user
    expect(result).toHaveLength(5);
    const [
      firstHumanMessage,
      toolCallAIMessage,
      toolCallToolMessage,
      assistantMessage,
      nextHumanMessage,
    ] = result;
    expect(isHumanMessage(firstHumanMessage)).toBe(true);
    expect(firstHumanMessage.content).toBe('find foo');
    expect(isAIMessage(toolCallAIMessage)).toBe(true);
    expect((toolCallAIMessage as AIMessage).tool_calls).toHaveLength(1);
    expect((toolCallAIMessage as AIMessage).tool_calls![0].id).toBe('call-1');
    // ToolMessage type guard is not imported, so just check property
    expect((toolCallToolMessage as ToolMessage).tool_call_id).toBe('call-1');
    expect(toolCallToolMessage.content).toEqual(
      wrapToolResultContent(
        JSON.stringify({
          results: [
            {
              tool_result_id: 'result-1',
              type: ToolResultType.other,
              data: {
                some: 'result1',
              },
            },
          ],
        })
      )
    );
    expect(isAIMessage(assistantMessage)).toBe(true);
    expect(assistantMessage.content).toBe('done!');
    expect(isHumanMessage(nextHumanMessage)).toBe(true);
    expect(nextHumanMessage.content).toBe('next');
  });

  it('handles multiple rounds', async () => {
    const previousRounds = [
      createRound({
        id: 'round-1',
        input: makeRoundInput('hi'),
        steps: [],
        response: makeAssistantResponse('hello!'),
        started_at: now,
        time_to_first_token: 42,
        time_to_last_token: 100,
      }),
      createRound({
        id: 'round-2',
        input: makeRoundInput('search for bar'),
        steps: [
          makeToolCallStep(
            makeToolCallWithResult('call-2', 'lookup', { id: 42 }, [
              { tool_result_id: 'result-2', type: ToolResultType.other, data: { some: 'result1' } },
            ])
          ),
        ],
        response: makeAssistantResponse('done with bar'),
        started_at: now,
        time_to_first_token: 42,
        time_to_last_token: 100,
      }),
    ];
    const nextInput = makeRoundInput('bye');
    const result = await convertPreviousRounds({
      conversation: createConversation({ previousRounds, nextInput }),
    });
    // 1 user + 1 assistant + 1 user + 1 tool call (AI + Tool) + 1 assistant + 1 user
    expect(result).toHaveLength(7);
    const [
      firstHumanMessage,
      firstAssistantMessage,
      secondHumanMessage,
      toolCallAIMessage,
      toolCallToolMessage,
      secondAssistantMessage,
      lastHumanMessage,
    ] = result;
    expect(isHumanMessage(firstHumanMessage)).toBe(true);
    expect(firstHumanMessage.content).toBe('hi');
    expect(isAIMessage(firstAssistantMessage)).toBe(true);
    expect(firstAssistantMessage.content).toBe('hello!');
    expect(isHumanMessage(secondHumanMessage)).toBe(true);
    expect(secondHumanMessage.content).toBe('search for bar');
    expect(isAIMessage(toolCallAIMessage)).toBe(true);
    expect((toolCallAIMessage as AIMessage).tool_calls).toHaveLength(1);
    expect((toolCallAIMessage as AIMessage).tool_calls![0].id).toBe('call-2');
    expect((toolCallToolMessage as ToolMessage).tool_call_id).toBe('call-2');
    expect(toolCallToolMessage.content).toEqual(
      wrapToolResultContent(
        JSON.stringify({
          results: [
            { tool_result_id: 'result-2', type: ToolResultType.other, data: { some: 'result1' } },
          ],
        })
      )
    );
    expect(isAIMessage(secondAssistantMessage)).toBe(true);
    expect(secondAssistantMessage.content).toBe('done with bar');
    expect(isHumanMessage(lastHumanMessage)).toBe(true);
    expect(lastHumanMessage.content).toBe('bye');
  });

  it('escapes tool ids', async () => {
    const toolCall = makeToolCallWithResult('call-1', '.search', { query: 'foo' }, [
      {
        tool_result_id: 'result-1',
        type: ToolResultType.other,
        data: {
          some: 'data',
        },
      },
    ]);
    const previousRounds = [
      createRound({
        id: 'round-1',
        input: makeRoundInput('find foo'),
        steps: [makeToolCallStep(toolCall)],
        response: makeAssistantResponse('done!'),
        started_at: now,
        time_to_first_token: 42,
        time_to_last_token: 100,
      }),
    ];
    const nextInput = makeRoundInput('next');
    const result = await convertPreviousRounds({
      conversation: createConversation({ previousRounds, nextInput }),
    });
    // 1 user + 1 tool call (AI + Tool) + 1 assistant + 1 user
    expect(result).toHaveLength(5);
    const [_human, toolCallAIMessage] = result;

    expect(isAIMessage(toolCallAIMessage)).toBe(true);
    expect((toolCallAIMessage as AIMessage).tool_calls).toHaveLength(1);
    expect((toolCallAIMessage as AIMessage).tool_calls![0].name).toBe(sanitizeToolId('.search'));
  });

  describe('with attachments', () => {
    it('includes a single attachment in the user message', async () => {
      const attachment = makeProcessedAttachment(
        'att-1',
        'text',
        { content: 'test content' },
        'This is the formatted text content'
      );
      const nextInput = makeRoundInput('hello with attachment', [attachment]);
      const result = await convertPreviousRounds({
        conversation: createConversation({ previousRounds: [], nextInput }),
      });

      expect(result).toHaveLength(1);
      expect(isHumanMessage(result[0])).toBe(true);
      expect(result[0].content).toContain('hello with attachment');
      expect(result[0].content).toContain('<attachments>');
      expect(result[0].content).toContain('<attachment type="text" id="att-1">');
      expect(result[0].content).toContain('This is the formatted text content');
      expect(result[0].content).toContain('</attachment>');
      expect(result[0].content).toContain('</attachments>');
    });

    it('includes multiple attachments in the user message', async () => {
      const attachment1 = makeProcessedAttachment(
        'att-1',
        'text',
        { content: 'first' },
        'First attachment content'
      );
      const attachment2 = makeProcessedAttachment(
        'att-2',
        'screen_context',
        { url: 'http://example.com' },
        'Screen context data'
      );
      const nextInput = makeRoundInput('message with multiple attachments', [
        attachment1,
        attachment2,
      ]);
      const result = await convertPreviousRounds({
        conversation: createConversation({ nextInput }),
      });

      expect(result).toHaveLength(1);
      expect(isHumanMessage(result[0])).toBe(true);
      const content = result[0].content as string;
      expect(content).toContain('message with multiple attachments');
      expect(content).toContain('<attachments>');
      expect(content).toContain('<attachment type="text" id="att-1">');
      expect(content).toContain('First attachment content');
      expect(content).toContain('<attachment type="screen_context" id="att-2">');
      expect(content).toContain('Screen context data');
      expect(content).toContain('</attachments>');
    });

    it('includes attachments from previous rounds', async () => {
      const attachment = makeProcessedAttachment(
        'prev-att-1',
        'text',
        { content: 'previous' },
        'Previous round attachment'
      );
      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('message with attachment', [attachment]),
          steps: [],
          response: makeAssistantResponse('got it'),
          started_at: now,
          time_to_first_token: 42,
          time_to_last_token: 100,
        }),
      ];
      const nextInput = makeRoundInput('next message');
      const result = await convertPreviousRounds({
        conversation: createConversation({ previousRounds, nextInput }),
      });

      expect(result).toHaveLength(3);
      const [firstHumanMessage, assistantMessage, secondHumanMessage] = result;

      expect(isHumanMessage(firstHumanMessage)).toBe(true);
      const firstContent = firstHumanMessage.content as string;
      expect(firstContent).toContain('message with attachment');
      expect(firstContent).toContain('<attachments>');
      expect(firstContent).toContain('<attachment type="text" id="prev-att-1">');
      expect(firstContent).toContain('Previous round attachment');

      expect(isAIMessage(assistantMessage)).toBe(true);
      expect(assistantMessage.content).toBe('got it');

      expect(isHumanMessage(secondHumanMessage)).toBe(true);
      expect(secondHumanMessage.content).toBe('next message');
      expect(secondHumanMessage.content).not.toContain('<attachments>');
    });
  });

  describe('with resultTransformer', () => {
    it('applies custom transformer to tool call results', async () => {
      const toolCall = makeToolCallWithResult('call-1', 'search', { query: 'foo' }, [
        {
          tool_result_id: 'result-1',
          type: ToolResultType.other,
          data: { original: 'data' },
        },
      ]);
      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('find foo'),
          steps: [makeToolCallStep(toolCall)],
          response: makeAssistantResponse('done!'),
          started_at: now,
        }),
      ];
      const nextInput = makeRoundInput('next');
      const conversation = createConversation({ previousRounds, nextInput });

      // Custom transformer that modifies all results from a tool call
      const customTransformer: ToolCallResultTransformer = jest.fn(async (toolCallArg) => {
        return toolCallArg.results.map(
          (result): ToolResult => ({
            tool_result_id: result.tool_result_id,
            type: ToolResultType.other,
            data: {
              ...(result.data as Record<string, unknown>),
              transformedBy: 'custom',
              toolId: toolCallArg.tool_id,
            },
          })
        );
      });

      const result = await convertPreviousRounds({
        conversation,
        resultTransformer: customTransformer,
      });

      const toolResultMessage = result[2] as ToolMessage;
      const content = JSON.parse(
        (toolResultMessage.content as string).replace(/^<tool_result>|<\/tool_result>$/g, '')
      );

      expect(customTransformer).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_call_id: 'call-1',
          tool_id: 'search',
          results: expect.arrayContaining([
            expect.objectContaining({ tool_result_id: 'result-1' }),
          ]),
        })
      );
      expect(content.results[0].data).toEqual({
        original: 'data',
        transformedBy: 'custom',
        toolId: 'search',
      });
    });

    it('transformer receives all results from a tool call', async () => {
      const toolCall = makeToolCallWithResult('call-1', 'search', { query: 'foo' }, [
        {
          tool_result_id: 'result-1',
          type: ToolResultType.other,
          data: { first: 'result' },
        },
        {
          tool_result_id: 'result-2',
          type: ToolResultType.other,
          data: { second: 'result' },
        },
      ]);
      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('find foo'),
          steps: [makeToolCallStep(toolCall)],
          response: makeAssistantResponse('done!'),
          started_at: now,
        }),
      ];
      const nextInput = makeRoundInput('next');
      const conversation = createConversation({ previousRounds, nextInput });

      // Transformer that aggregates results
      const customTransformer: ToolCallResultTransformer = jest.fn(async (toolCallArg) => {
        // Aggregate all results into one
        const aggregated: ToolResult[] = [
          {
            tool_result_id: 'aggregated',
            type: ToolResultType.other,
            data: {
              count: toolCallArg.results.length,
              toolId: toolCallArg.tool_id,
            },
          },
        ];
        return aggregated;
      });

      const result = await convertPreviousRounds({
        conversation,
        resultTransformer: customTransformer,
      });

      const toolResultMessage = result[2] as ToolMessage;
      const content = JSON.parse(
        (toolResultMessage.content as string).replace(/^<tool_result>|<\/tool_result>$/g, '')
      );

      // Should have one aggregated result
      expect(content.results).toHaveLength(1);
      expect(content.results[0].data).toEqual({
        count: 2,
        toolId: 'search',
      });
    });
  });

  describe('parallel tool calls (tool_call_group_id)', () => {
    it('groups parallel tool calls into a single AIMessage with multiple tool_calls', async () => {
      const groupId = 'group-1';
      const toolCall1 = makeToolCallWithResult('call-1', 'search', { query: 'foo' }, [
        { tool_result_id: 'r1', type: ToolResultType.other, data: { result: 'a' } },
      ]);
      const toolCall2 = makeToolCallWithResult('call-2', 'lookup', { id: 42 }, [
        { tool_result_id: 'r2', type: ToolResultType.other, data: { result: 'b' } },
      ]);

      const step1: ToolCallStep = { ...makeToolCallStep(toolCall1), tool_call_group_id: groupId };
      const step2: ToolCallStep = { ...makeToolCallStep(toolCall2), tool_call_group_id: groupId };

      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('find things'),
          steps: [step1, step2],
          response: makeAssistantResponse('done!'),
          started_at: now,
        }),
      ];
      const nextInput = makeRoundInput('next');
      const result = await convertPreviousRounds({
        conversation: createConversation({ previousRounds, nextInput }),
      });

      // 1 user + 1 AI (with 2 tool_calls) + 2 ToolMessages + 1 assistant + 1 user
      expect(result).toHaveLength(6);
      const [humanMsg, aiMsg, toolMsg1, toolMsg2, assistantMsg, nextHumanMsg] = result;

      expect(isHumanMessage(humanMsg)).toBe(true);
      expect(isAIMessage(aiMsg)).toBe(true);
      expect((aiMsg as AIMessage).tool_calls).toHaveLength(2);
      expect((aiMsg as AIMessage).tool_calls![0].id).toBe('call-1');
      expect((aiMsg as AIMessage).tool_calls![1].id).toBe('call-2');
      expect((toolMsg1 as ToolMessage).tool_call_id).toBe('call-1');
      expect((toolMsg2 as ToolMessage).tool_call_id).toBe('call-2');
      expect(isAIMessage(assistantMsg)).toBe(true);
      expect(assistantMsg.content).toBe('done!');
      expect(isHumanMessage(nextHumanMsg)).toBe(true);
    });

    it('keeps sequential calls (no group id) as separate AIMessages', async () => {
      const toolCall1 = makeToolCallWithResult('call-1', 'search', { query: 'foo' }, [
        { tool_result_id: 'r1', type: ToolResultType.other, data: { result: 'a' } },
      ]);
      const toolCall2 = makeToolCallWithResult('call-2', 'lookup', { id: 42 }, [
        { tool_result_id: 'r2', type: ToolResultType.other, data: { result: 'b' } },
      ]);

      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('find things'),
          steps: [makeToolCallStep(toolCall1), makeToolCallStep(toolCall2)],
          response: makeAssistantResponse('done!'),
          started_at: now,
        }),
      ];
      const nextInput = makeRoundInput('next');
      const result = await convertPreviousRounds({
        conversation: createConversation({ previousRounds, nextInput }),
      });

      // 1 user + 2 * (1 AI + 1 Tool) + 1 assistant + 1 user = 7
      expect(result).toHaveLength(7);
      const aiMsg1 = result[1] as AIMessage;
      const aiMsg2 = result[3] as AIMessage;
      expect(aiMsg1.tool_calls).toHaveLength(1);
      expect(aiMsg2.tool_calls).toHaveLength(1);
    });

    it('handles mixed parallel and sequential calls in the same round', async () => {
      const groupId = 'group-1';
      const toolCall1 = makeToolCallWithResult('call-1', 'search', { q: 'a' }, [
        { tool_result_id: 'r1', type: ToolResultType.other, data: {} },
      ]);
      const toolCall2 = makeToolCallWithResult('call-2', 'search', { q: 'b' }, [
        { tool_result_id: 'r2', type: ToolResultType.other, data: {} },
      ]);
      const toolCall3 = makeToolCallWithResult('call-3', 'lookup', { id: 1 }, [
        { tool_result_id: 'r3', type: ToolResultType.other, data: {} },
      ]);

      const step1: ToolCallStep = { ...makeToolCallStep(toolCall1), tool_call_group_id: groupId };
      const step2: ToolCallStep = { ...makeToolCallStep(toolCall2), tool_call_group_id: groupId };
      const step3 = makeToolCallStep(toolCall3);

      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('mixed calls'),
          steps: [step1, step2, step3],
          response: makeAssistantResponse('done!'),
          started_at: now,
        }),
      ];
      const nextInput = makeRoundInput('next');
      const result = await convertPreviousRounds({
        conversation: createConversation({ previousRounds, nextInput }),
      });

      // 1 user + (1 AI[2 calls] + 2 Tools) + (1 AI[1 call] + 1 Tool) + 1 assistant + 1 user = 8
      expect(result).toHaveLength(8);

      const parallelAi = result[1] as AIMessage;
      expect(parallelAi.tool_calls).toHaveLength(2);

      const sequentialAi = result[4] as AIMessage;
      expect(sequentialAi.tool_calls).toHaveLength(1);
      expect(sequentialAi.tool_calls![0].id).toBe('call-3');
    });

    it('sets group-level reasoning as AIMessage content', async () => {
      const groupId = 'group-1';
      const toolCall1 = makeToolCallWithResult('call-1', 'search', { query: 'foo' }, [
        { tool_result_id: 'r1', type: ToolResultType.other, data: { result: 'a' } },
      ]);

      const step1: ToolCallStep = { ...makeToolCallStep(toolCall1), tool_call_group_id: groupId };
      const reasoningStep: ReasoningStep = {
        type: ConversationRoundStepType.reasoning,
        reasoning: 'I need to search for foo',
        tool_call_group_id: groupId,
      };

      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('find foo'),
          steps: [reasoningStep, step1],
          response: makeAssistantResponse('done!'),
          started_at: now,
        }),
      ];
      const nextInput = makeRoundInput('next');
      const result = await convertPreviousRounds({
        conversation: createConversation({ previousRounds, nextInput }),
      });

      const aiMsg = result[1] as AIMessage;
      expect(isAIMessage(aiMsg)).toBe(true);
      expect(aiMsg.content).toBe('I need to search for foo');
    });

    it('injects per-tool reasoning as _reasoning in tool call args', async () => {
      const groupId = 'group-1';
      const toolCall1 = makeToolCallWithResult('call-1', 'search', { query: 'foo' }, [
        { tool_result_id: 'r1', type: ToolResultType.other, data: { result: 'a' } },
      ]);

      const step1: ToolCallStep = { ...makeToolCallStep(toolCall1), tool_call_group_id: groupId };
      const reasoningStep: ReasoningStep = {
        type: ConversationRoundStepType.reasoning,
        reasoning: 'searching for foo specifically',
        tool_call_id: 'call-1',
        tool_call_group_id: groupId,
      };

      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('find foo'),
          steps: [reasoningStep, step1],
          response: makeAssistantResponse('done!'),
          started_at: now,
        }),
      ];
      const nextInput = makeRoundInput('next');
      const result = await convertPreviousRounds({
        conversation: createConversation({ previousRounds, nextInput }),
      });

      const aiMsg = result[1] as AIMessage;
      expect(aiMsg.tool_calls![0].args).toEqual({
        _reasoning: 'searching for foo specifically',
        query: 'foo',
      });
    });

    it('sets both group reasoning and per-tool reasoning', async () => {
      const groupId = 'group-1';
      const toolCall1 = makeToolCallWithResult('call-1', 'search', { query: 'foo' }, [
        { tool_result_id: 'r1', type: ToolResultType.other, data: { result: 'a' } },
      ]);
      const toolCall2 = makeToolCallWithResult('call-2', 'lookup', { id: 42 }, [
        { tool_result_id: 'r2', type: ToolResultType.other, data: { result: 'b' } },
      ]);

      const step1: ToolCallStep = { ...makeToolCallStep(toolCall1), tool_call_group_id: groupId };
      const step2: ToolCallStep = { ...makeToolCallStep(toolCall2), tool_call_group_id: groupId };

      const previousRounds = [
        createRound({
          id: 'round-1',
          input: makeRoundInput('find things'),
          steps: [
            {
              type: ConversationRoundStepType.reasoning,
              reasoning: 'group level thought',
              tool_call_group_id: groupId,
            } as ReasoningStep,
            {
              type: ConversationRoundStepType.reasoning,
              reasoning: 'reason for call-1',
              tool_call_id: 'call-1',
              tool_call_group_id: groupId,
            } as ReasoningStep,
            step1,
            {
              type: ConversationRoundStepType.reasoning,
              reasoning: 'reason for call-2',
              tool_call_id: 'call-2',
              tool_call_group_id: groupId,
            } as ReasoningStep,
            step2,
          ],
          response: makeAssistantResponse('done!'),
          started_at: now,
        }),
      ];
      const nextInput = makeRoundInput('next');
      const result = await convertPreviousRounds({
        conversation: createConversation({ previousRounds, nextInput }),
      });

      const aiMsg = result[1] as AIMessage;
      expect(aiMsg.content).toBe('group level thought');
      expect(aiMsg.tool_calls![0].args).toEqual({
        _reasoning: 'reason for call-1',
        query: 'foo',
      });
      expect(aiMsg.tool_calls![1].args).toEqual({
        _reasoning: 'reason for call-2',
        id: 42,
      });
    });
  });

  describe('background execution notices (from round steps)', () => {
    const makeBgStep = (overrides: Partial<BackgroundExecutionState> = {}): ConversationRoundStep =>
      ({
        type: ConversationRoundStepType.backgroundAgentComplete,
        execution_id: 'bg-exec-1',
        status: ExecutionStatus.completed,
        response: { message: 'Background result' },
        completed_at: { round_id: 'round-1' },
        ...overrides,
      } as ConversationRoundStep);

    it('injects system notice for background execution complete step', async () => {
      const round = createRound({
        id: 'round-1',
        input: makeRoundInput('hello'),
        response: makeAssistantResponse('world'),
        steps: [makeBgStep()],
      });

      const result = await convertPreviousRounds({
        conversation: createConversation({
          previousRounds: [round],
          nextInput: makeRoundInput('next'),
        }),
      });

      const noticeMessage = result.find(
        (msg) => isHumanMessage(msg) && (msg as any).content.includes('<system_notice>')
      );
      expect(noticeMessage).toBeDefined();
      expect((noticeMessage as any).content).toContain('bg-exec-1');
      expect((noticeMessage as any).content).toContain('Background result');
    });

    it('injects error system notice for failed background step', async () => {
      const round = createRound({
        id: 'round-1',
        input: makeRoundInput('hello'),
        response: makeAssistantResponse('world'),
        steps: [
          makeBgStep({
            execution_id: 'bg-fail-1',
            status: ExecutionStatus.failed,
            response: undefined,
            error: { code: 'internalError' as any, message: 'Something broke' },
          }),
        ],
      });

      const result = await convertPreviousRounds({
        conversation: createConversation({
          previousRounds: [round],
          nextInput: makeRoundInput('next'),
        }),
      });

      const noticeMessage = result.find(
        (msg) => isHumanMessage(msg) && (msg as any).content.includes('<system_notice>')
      );
      expect(noticeMessage).toBeDefined();
      expect((noticeMessage as any).content).toContain('has failed');
      expect((noticeMessage as any).content).toContain('Something broke');
    });

    it('does not inject notices when no background steps exist', async () => {
      const round = createRound({
        id: 'round-1',
        input: makeRoundInput('hello'),
        response: makeAssistantResponse('world'),
        steps: [],
      });

      const result = await convertPreviousRounds({
        conversation: createConversation({
          previousRounds: [round],
          nextInput: makeRoundInput('next'),
        }),
      });

      const noticeMessages = result.filter(
        (msg) => isHumanMessage(msg) && (msg as any).content.includes('<system_notice>')
      );
      expect(noticeMessages).toHaveLength(0);
    });
  });
});

describe('groupToolCallSteps', () => {
  const makeStep = (toolCallId: string, toolId: string, groupId?: string): ToolCallStep => ({
    type: ConversationRoundStepType.toolCall,
    tool_call_id: toolCallId,
    tool_id: toolId,
    params: {},
    results: [],
    ...(groupId ? { tool_call_group_id: groupId } : {}),
  });

  const makeReasoningStep = (
    reasoning: string,
    { toolCallId, toolCallGroupId }: { toolCallId?: string; toolCallGroupId?: string } = {}
  ): ReasoningStep => ({
    type: ConversationRoundStepType.reasoning,
    reasoning,
    ...(toolCallId ? { tool_call_id: toolCallId } : {}),
    ...(toolCallGroupId ? { tool_call_group_id: toolCallGroupId } : {}),
  });

  it('groups steps with the same group id', () => {
    const steps: ConversationRoundStep[] = [
      makeStep('c1', 'search', 'g1'),
      makeStep('c2', 'lookup', 'g1'),
    ];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('separates steps with different group ids', () => {
    const steps: ConversationRoundStep[] = [
      makeStep('c1', 'search', 'g1'),
      makeStep('c2', 'lookup', 'g2'),
    ];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(1);
  });

  it('treats steps without group id as individual groups', () => {
    const steps: ConversationRoundStep[] = [makeStep('c1', 'search'), makeStep('c2', 'lookup')];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(2);
  });

  it('handles reasoning steps between groups', () => {
    const steps: ConversationRoundStep[] = [
      makeStep('c1', 'search', 'g1'),
      makeStep('c2', 'lookup', 'g1'),
      makeReasoningStep('thinking...'),
      makeStep('c3', 'search', 'g2'),
    ];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(1);
  });

  it('returns empty array for no tool call steps', () => {
    const steps: ConversationRoundStep[] = [makeReasoningStep('thinking...')];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(0);
  });

  it('keeps tool calls in the same group when reasoning steps appear between them', () => {
    const steps: ConversationRoundStep[] = [
      makeReasoningStep('reasoning for c1'),
      makeStep('c1', 'get_index_mapping', 'g1'),
      makeReasoningStep('reasoning for c2'),
      makeStep('c2', 'get_index_mapping', 'g1'),
    ];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
    expect(groups[0][0].tool_call_id).toBe('c1');
    expect(groups[0][1].tool_call_id).toBe('c2');
  });

  it('keeps tool calls in the same group with multiple interleaved reasoning steps', () => {
    const steps: ConversationRoundStep[] = [
      makeReasoningStep('reasoning for c1'),
      makeStep('c1', 'search', 'g1'),
      makeReasoningStep('reasoning for c2'),
      makeStep('c2', 'lookup', 'g1'),
      makeReasoningStep('reasoning for c3'),
      makeStep('c3', 'fetch', 'g1'),
    ];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('breaks group on reasoning steps between tool calls without group id', () => {
    const steps: ConversationRoundStep[] = [
      makeStep('c1', 'search'),
      makeReasoningStep('thinking...'),
      makeStep('c2', 'lookup'),
    ];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(1);
  });

  it('handles reasoning steps between different group ids', () => {
    const steps: ConversationRoundStep[] = [
      makeStep('c1', 'search', 'g1'),
      makeStep('c2', 'lookup', 'g1'),
      makeReasoningStep('new cycle'),
      makeStep('c3', 'search', 'g2'),
      makeReasoningStep('reasoning for c4'),
      makeStep('c4', 'lookup', 'g2'),
    ];
    const groups = groupToolCallSteps(steps);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(2);
  });
});
