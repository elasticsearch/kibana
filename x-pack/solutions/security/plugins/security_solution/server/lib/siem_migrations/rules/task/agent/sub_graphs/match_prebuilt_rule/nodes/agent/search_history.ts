/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { RuleSemanticSearchResult } from '../../../../../../types';
import type { PreviousSearchAttempt } from '../../state';

const SEARCH_TOOL_NAME = 'searchPrebuiltRules';

/** True when the last message is a search result that still has candidates to judge. */
export const hasCandidatesToEvaluate = (messages: BaseMessage[]): boolean => {
  const lastMessage = messages.at(-1);
  return (
    ToolMessage.isInstance(lastMessage) &&
    Array.isArray(lastMessage.artifact) &&
    lastMessage.artifact.length > 0
  );
};

/**
 * Pairs each `searchPrebuiltRules` tool call with the `ToolMessage` that shares its `tool_call_id`.
 * Used only to list queries (and their candidate names) in the next prompt — the router counts
 * searches separately from `AIMessage.tool_calls`.
 */
export const getPreviousSearchAttempts = (messages: BaseMessage[]): PreviousSearchAttempt[] => {
  const resultsByCallId = new Map<string, RuleSemanticSearchResult[]>();
  for (const message of messages) {
    if (ToolMessage.isInstance(message) && message.name === SEARCH_TOOL_NAME) {
      resultsByCallId.set(
        message.tool_call_id,
        Array.isArray(message.artifact) ? (message.artifact as RuleSemanticSearchResult[]) : []
      );
    }
  }

  return messages.filter(AIMessage.isInstance).flatMap((message) =>
    (message.tool_calls ?? [])
      .filter(
        (toolCall) => toolCall.name === SEARCH_TOOL_NAME && typeof toolCall.args.query === 'string'
      )
      .map((toolCall) => ({
        query: toolCall.args.query as string,
        candidateNames: (toolCall.id ? resultsByCallId.get(toolCall.id) ?? [] : []).map(
          ({ name }) => name
        ),
      }))
  );
};
