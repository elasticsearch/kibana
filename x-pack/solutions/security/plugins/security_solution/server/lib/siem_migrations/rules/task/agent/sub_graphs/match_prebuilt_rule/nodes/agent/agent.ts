/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { ChatModel } from '../../../../../../../common/task/util/actions_client_chat';
import {
  CREATE_PREBUILT_RULE_SEMANTIC_QUERY_PROMPT_V2,
  MATCH_PREBUILT_RULE_PROMPT_GENERIC_V2,
  MATCH_PREBUILT_RULE_PROMPT_SPLUNK_V2,
  MATCH_PREBUILT_RULE_SYSTEM_PROMPT_V2,
  formatRetrySearchPrompt,
  formatSemanticQueryInstructions,
  RETRY_ON_MALFORMED_JSON_PROMPT,
} from '../../prompts';
import type { MatchPrebuiltRuleState, MatchPrebuiltRulesResult } from '../../state';
import { getPreviousSearchAttempts, hasCandidatesToEvaluate } from './search_history';

interface GetMatchPrebuiltRuleAgentNodeParams {
  model: ChatModel;
  tool: StructuredToolInterface;
}

const jsonParser = new JsonOutputParser<MatchPrebuiltRulesResult>();

const parseFinalResponse = async (
  content: unknown
): Promise<MatchPrebuiltRulesResult | undefined> => {
  if (typeof content !== 'string') {
    return undefined;
  }
  try {
    return await jsonParser.parse(content);
  } catch {
    // LLM did not return valid JSON on its final (non-tool-calling) turn; caller decides whether
    // to retry or give up.
    return undefined;
  }
};

// Including the first attempt.
const MAX_FINAL_ANSWER_ATTEMPTS = 2;

interface FinalAnswerResult {
  aiMessage: AIMessage;
  matchResult?: MatchPrebuiltRulesResult;
}

const formatCreateSemanticQueryMessages = (state: MatchPrebuiltRuleState) => {
  // Splunk has no nl_query, so we use the raw title/description/query.
  const ruleContext =
    state.nl_query ||
    `Title: ${state.original_rule.title}\nDescription: ${state.original_rule.description}\nQuery: ${state.original_rule.query}`;

  return CREATE_PREBUILT_RULE_SEMANTIC_QUERY_PROMPT_V2.formatMessages({
    ruleContext,
    vendor: state.original_rule.vendor,
    mitreAttackIds: state.original_rule.annotations?.mitre_attack?.join(',') ?? '',
    searchInstructions: formatSemanticQueryInstructions(
      getPreviousSearchAttempts(state.match_prebuilt_rules_messages)
    ),
  });
};

/**
 * Messages appended this turn. First turn also includes the system prompt. Later turns inject
 * exactly one of: retry prompt (no-match JSON), match prompt (candidates), or query prompt (empty
 * search).
 */
const getPromptMessages = async (state: MatchPrebuiltRuleState): Promise<BaseMessage[]> => {
  const history = state.match_prebuilt_rules_messages;

  if (history.length === 0) {
    return [
      ...(await MATCH_PREBUILT_RULE_SYSTEM_PROMPT_V2.formatMessages({})),
      ...(await formatCreateSemanticQueryMessages(state)),
    ];
  }

  const lastMessage = history.at(-1);
  const previousSearchAttempts = getPreviousSearchAttempts(history);

  if (AIMessage.isInstance(lastMessage) && !lastMessage.tool_calls?.length) {
    return [new HumanMessage(formatRetrySearchPrompt(previousSearchAttempts))];
  }

  if (hasCandidatesToEvaluate(history)) {
    const matchPrompt =
      state.original_rule.vendor === 'splunk'
        ? MATCH_PREBUILT_RULE_PROMPT_SPLUNK_V2
        : MATCH_PREBUILT_RULE_PROMPT_GENERIC_V2;
    return matchPrompt.formatMessages({});
  }

  return formatCreateSemanticQueryMessages(state);
};

/**
 * LangGraph invokes the returned `agent` node under these scenarios:
 * - On initial entry (`START -> agent`), with no messages, to generate the first prebuilt-rule
 *   search tool call.
 * - After every prebuilt-rule search (`tools -> agent`), with the accumulated conversation and its
 *   `ToolMessage`, to evaluate candidates and either finish or request another search.
 */
export const getMatchPrebuiltRuleAgentNode = ({
  model,
  tool,
}: GetMatchPrebuiltRuleAgentNodeParams) => {
  const modelWithTools = model.bindTools([tool]);

  const invokeAndValidateFinalAnswer = async (
    messages: BaseMessage[],
    attempt = 1
  ): Promise<FinalAnswerResult> => {
    const aiMessage = await modelWithTools.invoke(messages);

    const isSearchingAgain = Boolean(aiMessage.tool_calls?.length);
    if (isSearchingAgain) {
      return { aiMessage };
    }

    const matchResult = await parseFinalResponse(aiMessage.content);
    if (matchResult || attempt === MAX_FINAL_ANSWER_ATTEMPTS) {
      return { aiMessage, matchResult };
    }

    return invokeAndValidateFinalAnswer(
      [...messages, aiMessage, new HumanMessage(RETRY_ON_MALFORMED_JSON_PROMPT)],
      attempt + 1
    );
  };

  return async (state: MatchPrebuiltRuleState): Promise<Partial<MatchPrebuiltRuleState>> => {
    const history = state.match_prebuilt_rules_messages;
    const promptMessages = await getPromptMessages(state);
    const { aiMessage, matchResult } = await invokeAndValidateFinalAnswer(
      history.length === 0 ? promptMessages : [...history, ...promptMessages]
    );

    return {
      match_prebuilt_rules_messages: [...promptMessages, aiMessage],
      match_prebuilt_rules_result: matchResult,
    };
  };
};
