/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessageLike, BaseMessage } from '@langchain/core/messages';
import {
  createUserMessage,
  createAIMessage,
  createToolResultMessage,
  createToolCallMessage,
  generateFakeToolCallId,
} from '@kbn/agent-builder-genai-utils/langchain/messages';
import { cleanPrompt } from '@kbn/agent-builder-genai-utils/prompts';
import { generateXmlTree } from '@kbn/agent-builder-genai-utils/tools/utils/formatting';
import { estimateTokens } from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import { AgentExecutionErrorCode } from '@kbn/agent-builder-common/agents';
import type { AgentBuilderAgentExecutionError } from '@kbn/agent-builder-common/base/errors';
import type { BackgroundExecutionState } from '@kbn/agent-builder-common/chat';
import type { ToolManager } from '@kbn/agent-builder-server/runner';
import type { ToolCallWithResult, ToolResult } from '@kbn/agent-builder-common';
import type {
  AgentErrorAction,
  HandoverAction,
  ResearchAgentAction,
  AnswerAgentAction,
  ToolCallAction,
  ExecuteToolAction,
  ToolCallResult,
} from '../../actions';
import {
  isAgentErrorAction,
  isBackgroundExecutionCompleteAction,
  isHandoverAction,
  isToolCallAction,
  isExecuteToolAction,
} from '../../actions';
import type { ToolCallResultTransformer } from '../../utils/tool_summarization';
import { extractToolReturn } from '../../utils/extract_tool_return';
import { estimateMessagesTokens } from '../../utils/estimate_conversation_tokens';

const PRESERVED_RECENT_CYCLES = 2;

export const IN_FLIGHT_TOKEN_THRESHOLD = 50_000;

interface IntraRoundCompaction {
  resultTransformer: ToolCallResultTransformer;
  toolManager: ToolManager;
}

export const formatResearcherActionHistory = async ({
  actions,
  cycleLimit,
  resultTransformer,
  toolManager,
}: {
  actions: ResearchAgentAction[];
  cycleLimit: number;
  resultTransformer?: ToolCallResultTransformer;
  toolManager?: ToolManager;
}): Promise<BaseMessageLike[]> => {
  const rawMessages = await formatActions({ actions, cycleLimit });

  if (
    !resultTransformer ||
    !toolManager ||
    estimateMessagesTokens(rawMessages as BaseMessage[]) <= IN_FLIGHT_TOKEN_THRESHOLD
  ) {
    return rawMessages;
  }

  const compactedMessages = await formatActions({
    actions,
    cycleLimit,
    compaction: { resultTransformer, toolManager },
  });

  return compactedMessages;
};

const formatActions = async ({
  actions,
  cycleLimit,
  compaction,
}: {
  actions: ResearchAgentAction[];
  cycleLimit: number;
  compaction?: IntraRoundCompaction;
}): Promise<BaseMessageLike[]> => {
  const compactionCutoff = compaction ? getCompactionCutoffCycle(actions) : undefined;
  const formatted: BaseMessageLike[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (isToolCallAction(action)) {
      // in case of forceful handover, we have a tool_call action without the corresponding tool result
      // so we want to skip it because we need a [ai, user, ai, user, ...] flow
      if (i === actions.length - 1 || !isExecuteToolAction(actions[i + 1])) {
        continue;
      }

      formatted.push(createToolCallMessage(action.tool_calls, action.message));
    }
    if (isExecuteToolAction(action)) {
      const compactThis =
        compaction !== undefined &&
        compactionCutoff !== undefined &&
        action.cycle !== undefined &&
        action.cycle <= compactionCutoff;

      if (compactThis) {
        formatted.push(
          ...(await formatCompactedToolResults(
            action,
            findPrecedingToolCallAction(actions, i),
            compaction!
          ))
        );
      } else {
        formatted.push(
          ...action.tool_results.map((result) =>
            createToolResultMessage({ content: result.content, toolCallId: result.toolCallId })
          )
        );
      }

      // Add system reminder about being close to the limit when only 5 cycles left.
      const remainingCycles = cycleLimit - action.cycle!;
      if (remainingCycles === 5 || remainingCycles === 1) {
        formatted.push(createCycleLimitSystemMessage(remainingCycles));
      }
    }
    if (isHandoverAction(action)) {
      // returns a single [AI, user] tuple
      formatted.push(...formatHandoverAction(action));
    }
    if (isAgentErrorAction(action)) {
      // returns a single [AI, user] tuple
      formatted.push(...formatErrorAction(action));
    }
    if (isBackgroundExecutionCompleteAction(action)) {
      formatted.push(createUserMessage(formatSystemNotice(action.execution)));
    }
  }

  return formatted;
};
const getCompactionCutoffCycle = (actions: ResearchAgentAction[]): number | undefined => {
  const cycles = actions
    .filter(isExecuteToolAction)
    .map((action) => action.cycle)
    .filter((cycle): cycle is number => cycle !== undefined);

  if (cycles.length <= PRESERVED_RECENT_CYCLES) {
    return undefined;
  }
  return Math.max(...cycles) - PRESERVED_RECENT_CYCLES;
};

const findPrecedingToolCallAction = (
  actions: ResearchAgentAction[],
  executeIndex: number
): ToolCallAction | undefined => {
  for (let i = executeIndex - 1; i >= 0; i--) {
    const action = actions[i];
    if (isToolCallAction(action)) {
      return action;
    }
  }
  return undefined;
};

/**
 * Runs the result transformer over an older cycle's tool results, mirroring how
 * previous rounds are compacted. Filestore substitution is forced because the
 * pressure comes from the in-flight round, not conversation history. A result whose
 * structured payload can't be recovered falls back to its raw content.
 */
const formatCompactedToolResults = async (
  executeAction: ExecuteToolAction,
  toolCallAction: ToolCallAction | undefined,
  { resultTransformer, toolManager }: IntraRoundCompaction
): Promise<BaseMessageLike[]> => {
  const toolIdMapping = toolManager.getToolIdMapping();
  const messages: BaseMessageLike[] = [];

  for (const result of executeAction.tool_results) {
    const toolCall = reconstructToolCall(result, toolCallAction, toolIdMapping);
    if (!toolCall) {
      messages.push(
        createToolResultMessage({ content: result.content, toolCallId: result.toolCallId })
      );
      continue;
    }

    const transformed = await resultTransformer(toolCall, { forceFilestoreSubstitution: true });
    // Only use the transformed form when it's actually smaller. Re-serializing an
    // unchanged result (no summarizer, and below the filestore threshold) as JSON can
    // otherwise add overhead and make the prompt larger than the raw rendering.
    const transformedContent = { results: transformed };
    const useTransformed =
      estimateTokens(JSON.stringify(transformedContent)) < estimateTokens(result.content);
    messages.push(
      createToolResultMessage({
        content: useTransformed ? transformedContent : result.content,
        toolCallId: result.toolCallId,
      })
    );
  }

  return messages;
};

const reconstructToolCall = (
  result: ToolCallResult,
  toolCallAction: ToolCallAction | undefined,
  toolIdMapping: Map<string, string>
): ToolCallWithResult | undefined => {
  let results: ToolResult[];
  try {
    results = extractToolReturn(result).results ?? [];
  } catch {
    return undefined;
  }

  const call = toolCallAction?.tool_calls.find(
    (toolCall) => toolCall.toolCallId === result.toolCallId
  );
  const langchainName = call?.toolName ?? '';

  return {
    tool_call_id: result.toolCallId,
    // getToolIdMapping is langchain name -> internal id; fall back to the name for evicted tools.
    tool_id: toolIdMapping.get(langchainName) ?? langchainName,
    params: stripReasoning(call?.args ?? {}),
    results,
  };
};

const stripReasoning = (args: Record<string, unknown>): Record<string, unknown> => {
  const { _reasoning, ...rest } = args;
  return rest;
};

const createCycleLimitSystemMessage = (cycle: number): BaseMessage => {
  return createUserMessage(`<system-notice>
You action budget is almost expired for that round. You only have ${cycle} cycles (tool calls) left before the execution will be terminated.
Finish what you are doing in that budget and proceed to respond to the user before reaching the end of the cycles.
Interrupt your current action if necessary to make sure you finish before termination.
</system-notice>`);
};

export const formatAnswerActionHistory = ({
  actions,
}: {
  actions: AnswerAgentAction[];
}): BaseMessageLike[] => {
  const formatted: BaseMessageLike[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (isAgentErrorAction(action)) {
      // returns a single [AI, user] tuple
      formatted.push(...formatErrorAction(action));
    }
    // [...] we don't need to format StructuredAnswerAction because it will terminate the execution
  }

  return formatted;
};

const formatHandoverAction = ({ message, forceful }: HandoverAction): BaseMessage[] => {
  if (forceful) {
    return [
      createAIMessage(
        cleanPrompt(
          `[researcher agent] The research process was interrupted because it exceeded the maximum allowed steps, I cannot perform any more actions.
        Handing over to the answering agent for a final answer based on the information gathered so far.`
        )
      ),
      createUserMessage(
        cleanPrompt(
          '[dispatcher] Ack. Forwarding to answering agent. Please proceed to respond without invoking any additional tools, using only the information gathered so far.'
        )
      ),
    ];
  } else {
    return [
      createAIMessage(
        cleanPrompt(
          `[researcher agent] Finished the research step. Handover notes for the answering agent:
        """
        ${message}
        """`
        )
      ),
      createUserMessage(
        cleanPrompt(
          '[dispatcher] Ack. Forwarding to answering agent. Please proceed to respond without invoking any additional tools, using only the information gathered so far.'
        )
      ),
    ];
  }
};

const formatErrorAction = ({ error }: AgentErrorAction): BaseMessage[] => {
  // tool not found -> we format that as a tool call returning an error.
  if (isExecutionError(error, AgentExecutionErrorCode.toolNotFound)) {
    const toolCallId = generateFakeToolCallId();
    const callArgs =
      typeof error.meta.toolArgs === 'string' ? { args: error.meta.toolArgs } : error.meta.toolArgs;
    return [
      createToolCallMessage({ toolCallId, toolName: error.meta.toolName, args: callArgs }),
      createToolResultMessage({
        toolCallId,
        content: `ERROR: tool_not_found - called a tool which was not available: ${error.message}`,
      }),
    ];
  }

  // tool call validation -> we format that as a tool call returning an error.
  if (isExecutionError(error, AgentExecutionErrorCode.toolValidationError)) {
    const toolCallId = generateFakeToolCallId();
    const callArgs =
      typeof error.meta.toolArgs === 'string' ? { args: error.meta.toolArgs } : error.meta.toolArgs;
    return [
      createToolCallMessage({ toolCallId, toolName: error.meta.toolName, args: callArgs }),
      createToolResultMessage({
        toolCallId,
        content: `ERROR: tool_validation_error - called a tool with invalid parameters - ${error.meta.validationError} ${error.message}`,
      }),
    ];
  }

  // empty response -> we format that as an empty AI message and user message asking to try again.
  if (isExecutionError(error, AgentExecutionErrorCode.emptyResponse)) {
    return [
      createAIMessage(``),
      createUserMessage('Looks like you did not provide any answer. Please try again.'),
    ];
  }

  // other error types are not recoverable -> we do not represent them.
  return [];
};

const isExecutionError = <TCode extends AgentExecutionErrorCode>(
  error: AgentBuilderAgentExecutionError,
  code: TCode
): error is AgentBuilderAgentExecutionError<TCode> => {
  return error.meta.errCode === code;
};

export const formatSystemNotice = (execution: BackgroundExecutionState): string => {
  const { status, execution_id: executionId } = execution;

  const outcome = execution.error
    ? {
        message: 'A background agent execution has failed.',
        detail: { tagName: 'error', children: [execution.error.message] },
      }
    : {
        message: 'A background agent execution has completed.',
        detail: { tagName: 'result', children: [execution.response?.message ?? 'No response'] },
      };

  return generateXmlTree({
    tagName: 'system_notice',
    children: [
      { tagName: 'message', children: [outcome.message] },
      { tagName: 'execution-id', children: [executionId] },
      { tagName: 'status', children: [status] },
      outcome.detail,
    ],
  });
};
