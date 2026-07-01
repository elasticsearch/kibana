/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  hasUnsupportedFunctions,
  UNSUPPORTED_FUNCTIONS,
} from '../../../../../common/task/util/has_unsupported_function';
import { cleanMarkdown, generateAssistantComment } from '../../../../../common/task/util/comments';
import type { GraphNode, ModelWithTools } from '../../types';
import { GENERAL_INTERPRET_INSTRUCTIONS, USER_MESSAGE, VENDOR_INSTRUCTIONS } from './prompts';

interface GetSourceRuleToNaturalLanguageNodeParams {
  model: ModelWithTools;
}

export const getSourceRuleToNaturalLanguageNode = ({
  model,
}: GetSourceRuleToNaturalLanguageNodeParams): GraphNode => {
  return async (state) => {
    const { vendor } = state.original_rule;
    const query = state.original_rule.query;
    const vendorInstructions = VENDOR_INSTRUCTIONS[vendor] ?? '';

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `${GENERAL_INTERPRET_INSTRUCTIONS}\n${vendorInstructions}`],
      ['human', USER_MESSAGE],
    ]);

    const formattedPrompt = await prompt.formatMessages({
      title: state.original_rule.title,
      description: state.original_rule.description,
      query,
      resources: JSON.stringify(state.resources?.lookup ?? []),
    });

    const currentMessages = state.messages ?? [];
    const isUnsupported = hasUnsupportedFunctions([query, ...currentMessages].join('\n'));

    if (isUnsupported) {
      const unsupportedComment = `This rule cannot be translated to a Custom Rule because current rule logic contains one of the unsupported functions: \n \n  - ${UNSUPPORTED_FUNCTIONS.join(
        '\n  - '
      )}`;

      return {
        nl_query: undefined,
        comments: [generateAssistantComment(unsupportedComment)],
      };
    }

    const response = await model.invoke([...formattedPrompt, ...currentMessages]);

    const hasToolCall =
      'tool_calls' in response && response?.tool_calls && response?.tool_calls?.length > 0;

    if (hasToolCall) {
      // we don't generate comments for tool calls but only the final response
      return { messages: [response], comments: [] };
    }

    const comments = [generateAssistantComment(cleanMarkdown(response.text))];
    return { messages: [response], nl_query: response.text, comments };
  };
};
