/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tool } from '@langchain/core/tools';
import * as z from '@kbn/zod/v4';
import type { RuleMigrationsRetriever } from '../../retrievers';
import type { RuleSemanticSearchResult } from '../../../types';

const NAME = 'searchPrebuiltRules' as const;

const DESCRIPTION =
  'Searches Elastic pre-built detection rules using a semantic query. Use this to find candidate pre-built rules that may match a source SIEM detection rule.';

const SCHEMA = z.object({
  query: z
    .string()
    .max(2000)
    .describe(
      'A keyword-rich semantic search query optimized for finding Elastic pre-built detection rules.'
    ),
  technique_ids: z
    .string()
    .max(500)
    .optional()
    .describe(
      'Optional comma-separated MITRE ATT&CK technique IDs from the source rule to boost matching.'
    ),
});

/**
 * Wraps `RuleMigrationsRetriever#prebuiltRules.search` as a LangChain `tool()` so it has a name,
 * description and validated schema. Bound to the model in the v2 `matchPrebuiltRule` subgraph's
 * `agent` node (`sub_graphs/match_prebuilt_rule/nodes/agent/agent.ts`) and executed by a
 * real `ToolNode` in `sub_graphs/match_prebuilt_rule/graph.ts` — the model itself decides when to
 * call it and with what query, as part of the graph's own agent/tools loop (security-team#18589).
 *
 * Uses `responseFormat: 'content_and_artifact'`: the `ToolMessage` fed back to the model only gets
 * the compact `{name, description}` projection (`content`), while the full
 * `RuleSemanticSearchResult[]` (with `rule_id`, `target`, `current`, etc. — everything needed to
 * build the final `elastic_rule`) rides along as `artifact`, out of the model's view.
 */
export const getPrebuiltRulesSearchTool = ({
  ruleMigrationsRetriever,
}: {
  ruleMigrationsRetriever: RuleMigrationsRetriever;
}) => {
  const searchPrebuiltRules = async ({
    query,
    technique_ids: techniqueIds,
  }: {
    query: string;
    technique_ids?: string;
  }): Promise<[string, RuleSemanticSearchResult[]]> => {
    const results = await ruleMigrationsRetriever.prebuiltRules.search(query, techniqueIds ?? '');
    const content = JSON.stringify(
      results.map((rule) => ({
        name: rule.name,
        description: rule.description,
        query: rule.target?.type !== 'machine_learning' ? rule.target?.query : '',
      }))
    );
    return [content, results];
  };

  return {
    [NAME]: tool(searchPrebuiltRules, {
      name: NAME,
      description: DESCRIPTION,
      schema: SCHEMA,
      responseFormat: 'content_and_artifact',
    }),
  };
};

export type SearchPrebuiltRulesTool = ReturnType<typeof getPrebuiltRulesSearchTool>[typeof NAME];
