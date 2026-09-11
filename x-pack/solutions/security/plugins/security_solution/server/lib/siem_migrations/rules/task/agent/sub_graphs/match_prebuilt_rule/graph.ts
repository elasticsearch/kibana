/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { ChatModel } from '../../../../../common/task/util/actions_client_chat';
import type { RuleMigrationTelemetryClient } from '../../../rule_migrations_telemetry_client';
import type { SearchPrebuiltRulesTool } from '../../tools/prebuilt_rules_search';
import {
  MAX_TOOL_CALL_ATTEMPTS,
  matchPrebuiltRuleState,
  type MatchPrebuiltRuleState,
} from './state';
import { getFinalizeMatchNode, getMatchPrebuiltRuleAgentNode } from './nodes';
import { isRetrySearchPromptMessage } from './prompts';

interface GetMatchPrebuiltRuleGraphParams {
  model: ChatModel;
  searchPrebuiltRulesTool: SearchPrebuiltRulesTool;
  telemetryClient: RuleMigrationTelemetryClient;
}

export const getMatchPrebuiltRuleGraph = ({
  model,
  searchPrebuiltRulesTool: searchPrebuiltRules,
  telemetryClient,
}: GetMatchPrebuiltRuleGraphParams) => {
  const agentNode = getMatchPrebuiltRuleAgentNode({ model, tool: searchPrebuiltRules });
  const toolNode = new ToolNode<BaseMessage[]>([searchPrebuiltRules]);
  // ToolNode only accepts a messages array, so pass the inner array and map results back to state.
  const toolsNode = async (state: MatchPrebuiltRuleState, config: RunnableConfig) => ({
    match_prebuilt_rules_messages: await toolNode.invoke(
      state.match_prebuilt_rules_messages,
      config
    ),
  });
  const finalizeNode = getFinalizeMatchNode({ telemetryClient });

  const graph = new StateGraph(matchPrebuiltRuleState)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', matchPrebuiltRuleRouter, {
      tools: 'tools',
      agent: 'agent',
      finalize: 'finalize',
    })
    .addEdge('tools', 'agent')
    .addEdge('finalize', END);

  const compiled = graph.compile();
  compiled.name = 'Match Prebuilt Rule Subgraph';
  return compiled;
};

const matchPrebuiltRuleRouter = (state: MatchPrebuiltRuleState) => {
  const messages = state.match_prebuilt_rules_messages;
  // Only count turns where the model actually searched (has tool calls).
  // Counting final-answer turns too would hit the cap before all searches are used.
  const searchCount = messages.filter(
    (message) => AIMessage.isInstance(message) && Boolean(message.tool_calls?.length)
  ).length;
  const lastMessage = messages.at(-1);
  const hasToolCalls = AIMessage.isInstance(lastMessage) && Boolean(lastMessage.tool_calls?.length);

  if (hasToolCalls && searchCount <= MAX_TOOL_CALL_ATTEMPTS) {
    return 'tools';
  }
  // Inject a retry prompt when:
  // - parsed JSON with an empty match, and
  // - searchCount < MAX_TOOL_CALL_ATTEMPTS, and
  // - the last search returned candidates
  // Do not inject when: last search was empty (query prompt handles that), the previous
  // message was already a retry prompt (model declined; searchCount would not move),
  // or this is the 3rd no-match (`searchCount` has reached MAX).
  const matchResult = state.match_prebuilt_rules_result;
  const previousMessage = messages.at(-2);
  const lastTurnWasRetryPrompt =
    previousMessage !== undefined &&
    HumanMessage.isInstance(previousMessage) &&
    isRetrySearchPromptMessage(previousMessage);
  if (
    matchResult !== undefined &&
    !matchResult.match?.trim() &&
    searchCount < MAX_TOOL_CALL_ATTEMPTS &&
    !lastTurnWasRetryPrompt
  ) {
    const lastToolMessage = [...messages].reverse().find(ToolMessage.isInstance);
    const lastSearchHadCandidates =
      lastToolMessage !== undefined &&
      Array.isArray(lastToolMessage.artifact) &&
      lastToolMessage.artifact.length > 0;
    if (lastSearchHadCandidates) {
      return 'agent';
    }
  }
  return 'finalize';
};
