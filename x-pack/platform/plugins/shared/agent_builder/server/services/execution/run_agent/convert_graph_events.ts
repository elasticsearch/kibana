/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { StreamEvent as LangchainStreamEvent } from '@langchain/core/tracers/log_stream';
import type { AIMessageChunk } from '@langchain/core/messages';
import type { OperatorFunction } from 'rxjs';
import { EMPTY, mergeMap, of } from 'rxjs';
import type { ChatAgentEvent, ConversationRound } from '@kbn/agent-builder-common/chat';
import { isToolCallStep } from '@kbn/agent-builder-common/chat';
import {
  createBrowserToolCallEvent,
  createMessageEvent,
  createPromptRequestEvent,
  createReasoningEvent,
  createTextChunkEvent,
  createThinkingCompleteEvent,
  createBackgroundAgentCompleteEvent,
  createToolCallEvent,
  createToolResultEvent,
  extractTextContent,
  hasTag,
  matchEvent,
  matchGraphName,
  matchName,
  toolIdentifierFromToolCall,
} from '@kbn/agent-builder-genai-utils/langchain';
import type { Logger } from '@kbn/logging';
import { AgentPromptRequestSourceType } from '@kbn/agent-builder-common/agents';
import { isAskUserQuestionPrompt } from '@kbn/agent-builder-common/agents/prompts';
import { createUserQuestionAskedEvent } from '@kbn/agent-builder-common/chat';
import { internalTools } from '@kbn/agent-builder-common';
import type { ToolManager } from '@kbn/agent-builder-server/runner';
import type { StateType } from './state';
import { BROWSER_TOOL_PREFIX, steps, tags } from './constants';
import { extractToolReturn } from './utils/extract_tool_return';
import {
  isBackgroundExecutionCompleteAction,
  isExecuteToolAction,
  isHandoverAction,
  isToolCallAction,
  isToolPromptAction,
} from './actions';
import type { InternalEvent } from './events';
import { createFinalStateEvent } from './events';

export type ConvertedEvents = ChatAgentEvent | InternalEvent;

/**
 * Tools that have their own dedicated step lifecycle event and therefore should NOT produce a default `toolCallEvent`.
 */
const TOOLS_WITH_DEDICATED_STEP_LIFECYCLE: ReadonlySet<string> = new Set([
  internalTools.askUserQuestion,
]);

export const convertGraphEvents = ({
  graphName,
  toolManager,
  pendingRound,
  logger,
  startTime,
  structuredOutput,
}: {
  graphName: string;
  toolManager: ToolManager;
  pendingRound: ConversationRound | undefined;
  logger: Logger;
  startTime: Date;
  structuredOutput: boolean;
}): OperatorFunction<LangchainStreamEvent, ConvertedEvents> => {
  return (streamEvents$) => {
    const toolCallIdToIdMap = new Map<string, string>();

    if (pendingRound) {
      const toolCalls = pendingRound.steps.filter(isToolCallStep);
      toolCalls.forEach((toolCall) => {
        toolCallIdToIdMap.set(toolCall.tool_call_id, toolCall.tool_id);
      });
    }

    // message identifier for emitted chunks
    let messageId = uuidv4();

    // Tracks the timestamp of the first text chunk of the current research turn.
    // Used to backdate `thinkingCompleteEvent` to the first chunk of the terminal turn
    let currentTurnFirstChunkAt: number | undefined;

    return streamEvents$.pipe(
      mergeMap((event) => {
        if (!matchGraphName(event, graphName)) {
          return EMPTY;
        }

        // reset per-turn first-chunk tracker at the start of each research turn
        if (matchEvent(event, 'on_chain_start') && matchName(event, steps.researchAgent)) {
          // reset per-turn first-chunk tracker at the start of each research turn
          currentTurnFirstChunkAt = undefined;
          // reset message id between research turns
          messageId = uuidv4();
          return EMPTY;
        }

        // streaming text chunks for the UI (answering + research)
        if (
          matchEvent(event, 'on_chat_model_stream') &&
          (hasTag(event, tags.answerAgent) || hasTag(event, tags.researchAgent))
        ) {
          const chunk: AIMessageChunk = event.data.chunk;
          const textContent = extractTextContent(chunk);
          if (textContent) {
            if (
              !structuredOutput &&
              hasTag(event, tags.researchAgent) &&
              currentTurnFirstChunkAt === undefined
            ) {
              currentTurnFirstChunkAt = Date.now();
            }
            return of(createTextChunkEvent(textContent, { messageId }));
          }
        }

        // emit tool calls for research agent steps
        if (matchEvent(event, 'on_chain_end') && matchName(event, steps.researchAgent)) {
          const events: ConvertedEvents[] = [];
          const addedActions = (event.data.output as StateType).mainActions;
          const nextAction = addedActions[addedActions.length - 1];

          if (isToolCallAction(nextAction)) {
            const {
              tool_calls: toolCalls,
              tool_call_group_id: toolCallGroupId,
              message: messageText = '',
            } = nextAction;
            if (toolCalls.length > 0) {
              if (messageText.trim().length > 0) {
                events.push(createReasoningEvent(messageText, { toolCallGroupId }));
              }

              for (const toolCall of toolCalls) {
                const toolId = toolIdentifierFromToolCall(toolCall, toolManager.getToolIdMapping());
                const { toolCallId, args: toolCallArgs, reasoning } = toolCall;

                if (reasoning && reasoning.trim().length > 0) {
                  events.push(createReasoningEvent(reasoning, { toolCallId, toolCallGroupId }));
                }

                toolCallIdToIdMap.set(toolCall.toolCallId, toolId);

                const isBrowserTool = toolId.startsWith(BROWSER_TOOL_PREFIX);
                if (isBrowserTool) {
                  events.push(
                    createBrowserToolCallEvent({
                      toolId: toolId.replace(BROWSER_TOOL_PREFIX, ''),
                      toolCallId,
                      params: toolCallArgs,
                    })
                  );
                } else if (!TOOLS_WITH_DEDICATED_STEP_LIFECYCLE.has(toolId)) {
                  const { origin: toolOrigin, type: toolType } = toolManager.getToolMeta(toolId);
                  events.push(
                    createToolCallEvent({
                      toolId,
                      toolCallId,
                      params: toolCallArgs,
                      toolCallGroupId,
                      toolOrigin,
                      toolType,
                    })
                  );
                }
              }
            }
          }

          // Backdated thinking-complete: when the research agent's terminal turn
          // produces a HandoverAction in non-structured mode, emit
          // thinkingCompleteEvent with the timestamp of the first chunk of that
          // turn. Falls back to "now" if no chunk timestamp was captured.
          if (!structuredOutput && isHandoverAction(nextAction)) {
            const firstChunkOffset =
              currentTurnFirstChunkAt !== undefined
                ? currentTurnFirstChunkAt - startTime.getTime()
                : Date.now() - startTime.getTime();
            events.push(createThinkingCompleteEvent(firstChunkOffset));
          }

          return of(...events);
        }

        // emit messageEvent at finalize: state.finalAnswer is the canonical answer
        // (string for non-structured, object for structured)
        if (matchEvent(event, 'on_chain_end') && matchName(event, steps.finalize)) {
          const finalState = event.data.output as StateType;
          const finalAnswer = finalState.finalAnswer;
          if (finalAnswer !== undefined && finalAnswer !== null && finalAnswer !== '') {
            return of(createMessageEvent(finalAnswer, { messageId }));
          }
          return EMPTY;
        }

        // emit tool result events and/or prompt request events
        if (matchEvent(event, 'on_chain_end') && matchName(event, steps.executeTool)) {
          const addedActions = (event.data.output as StateType).mainActions;
          const resultEvents: ConvertedEvents[] = [];

          for (const action of addedActions) {
            if (isExecuteToolAction(action)) {
              for (const toolResult of action.tool_results) {
                const toolId = toolCallIdToIdMap.get(toolResult.toolCallId);
                const toolReturn = extractToolReturn(toolResult);
                resultEvents.push(
                  createToolResultEvent({
                    toolCallId: toolResult.toolCallId,
                    toolId: toolId ?? 'unknown',
                    results: toolReturn.results ?? [],
                  })
                );
              }
            }

            if (isToolPromptAction(action)) {
              for (const { prompt, tool_call_id } of action.prompts) {
                resultEvents.push(
                  createPromptRequestEvent({
                    prompt,
                    source: {
                      type: AgentPromptRequestSourceType.toolCall,
                      tool_call_id,
                    },
                  })
                );

                if (isAskUserQuestionPrompt(prompt)) {
                  resultEvents.push(
                    createUserQuestionAskedEvent({
                      prompt_id: prompt.id,
                      questions: prompt.questions,
                    })
                  );
                }
              }
            }
          }

          if (resultEvents.length > 0) {
            return of(...resultEvents);
          }
        }

        // emit background execution complete events
        if (matchEvent(event, 'on_chain_end') && matchName(event, steps.checkBackgroundWork)) {
          const addedActions = (event.data.output as Partial<StateType>).mainActions ?? [];
          const bgEvents: ConvertedEvents[] = [];

          for (const action of addedActions) {
            if (isBackgroundExecutionCompleteAction(action)) {
              bgEvents.push(createBackgroundAgentCompleteEvent(action.execution));
            }
          }

          if (bgEvents.length > 0) {
            return of(...bgEvents);
          }
        }

        if (matchEvent(event, 'on_chain_end') && matchName(event, graphName)) {
          const finalState = event.data.output as StateType;
          return of(createFinalStateEvent(finalState));
        }

        return EMPTY;
      })
    );
  };
};
