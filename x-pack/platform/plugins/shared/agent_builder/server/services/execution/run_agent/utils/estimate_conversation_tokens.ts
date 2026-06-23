/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { isAIMessage } from '@langchain/core/messages';
import { estimateTokens } from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import type { ProcessedConversationRound } from './prepare_conversation';
import type { ToolSummarizationDeps } from './tool_summarization';
import { createSummarizationTransformer } from './tool_summarization';
import { roundToLangchain } from './to_langchain_messages';

export const estimateMessagesTokens = (messages: BaseMessage[]): number => {
  let total = 0;
  for (const message of messages) {
    // estimateTokens stringifies non-string content (e.g. structured message parts).
    total += estimateTokens(message.content);
    // Tool-call params/reasoning live on tool_calls, not in content, but are sent too.
    if (isAIMessage(message) && message.tool_calls?.length) {
      total += estimateTokens(JSON.stringify(message.tool_calls));
    }
  }
  return total;
};

export const estimatePerRoundTokens = async (
  rounds: ProcessedConversationRound[],
  deps: ToolSummarizationDeps
): Promise<number[]> => {
  const resultTransformer = createSummarizationTransformer(deps);
  return Promise.all(
    rounds.map(async (round) =>
      estimateMessagesTokens(await roundToLangchain(round, { resultTransformer }))
    )
  );
};
