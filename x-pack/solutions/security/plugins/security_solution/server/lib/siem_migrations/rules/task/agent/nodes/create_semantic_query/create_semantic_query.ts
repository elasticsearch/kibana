/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { JsonOutputParser } from '@langchain/core/output_parsers';
import type { GraphNode, MigrateRuleGraphParams } from '../../types';
import { CREATE_SEMANTIC_QUERY_PROMPT } from './prompts';

interface GetCreateSemanticQueryNodeParams {
  model: MigrateRuleGraphParams['model'];
}

interface GetSemanticQueryResponse {
  semantic_query: string;
}

export const getCreateSemanticQueryNode = ({
  model,
}: GetCreateSemanticQueryNodeParams): GraphNode => {
  const jsonParser = new JsonOutputParser();
  return async (state) => {
    const ruleContext =
      state.nl_query ||
      `Title: ${state.original_rule.title}\nDescription: ${state.original_rule.description}\nQuery: ${state.original_rule.query}`;

    const promptTemplate = await CREATE_SEMANTIC_QUERY_PROMPT.formatMessages({
      ruleContext,
    });

    const semanticQueryChain = model.pipe(jsonParser);

    const integrationQuery = (await semanticQueryChain.invoke([
      ...promptTemplate,
    ])) as unknown as GetSemanticQueryResponse;

    return { semantic_query: integrationQuery.semantic_query };
  };
};
