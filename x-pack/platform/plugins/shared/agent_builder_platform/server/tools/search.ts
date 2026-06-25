/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { CoreSetup } from '@kbn/core-lifecycle-server';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { TopSnippetsConfig } from '@kbn/agent-builder-genai-utils/tools';
import { runSearchTool } from '@kbn/agent-builder-genai-utils/tools';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { resolveTimeRange } from './screen_context_utils';

const searchSchema = z.object({
  query: z.string().describe('A natural language query expressing the search request'),
  index: z
    .string()
    .optional()
    .describe(
      '(optional) Index or index-pattern to search against. If not provided, will automatically select the best index to use based on the query.'
    ),
  time_range: z
    .object({
      from: z
        .string()
        .describe('Start of the time range, e.g. "now-24h" or "2026-01-01T00:00:00Z"'),
      to: z.string().describe('End of the time range, e.g. "now" or "2026-01-31T23:59:59Z"'),
    })
    .optional()
    .describe(
      '(optional) Time range to scope the search. Falls back to screen context or last 24 hours.'
    ),
});

export const searchTool = ({
  coreSetup,
  topSnippetsDefaults,
}: {
  coreSetup: CoreSetup;
  topSnippetsDefaults: TopSnippetsConfig;
}): BuiltinToolDefinition<typeof searchSchema> => {
  // Cache the start services promise so it is resolved at most once.
  let startServicesPromise: ReturnType<CoreSetup['getStartServices']> | undefined;
  const getStartServices = () => {
    if (!startServicesPromise) {
      startServicesPromise = coreSetup.getStartServices();
    }
    return startServicesPromise;
  };

  return {
    id: platformCoreTools.search,
    type: ToolType.builtin,
    description: `A powerful tool for searching and analyzing data within your Elasticsearch cluster.
It supports both full-text relevance searches and structured analytical queries.

Use this tool for any query that involves finding documents, counting, aggregating, or summarizing data from a known index.

Examples of queries:
- "find articles about serverless architecture"
- "search for support tickets mentioning 'billing issue' or 'refund request'"
- "what is our policy on parental leave?"
- "list all products where the category is 'electronics'"
- "show me the last 5 documents from that index"
- "show me the sales over the last year break down by month"

Note:
- The 'index' parameter can be used to specify which index to search against.
 If not provided, the tool will decide itself which is the best index to use.
- It is perfectly fine not to specify the 'index' parameter. It should only be specified when you already
 know about the index and fields you want to search on, e.g. if the user explicitly specified it.
    `,
    schema: searchSchema,
    handler: async (
      { query: nlQuery, index, time_range: explicitTimeRange },
      { esClient, modelProvider, logger, events, attachments, savedObjectsClient }
    ) => {
      logger.debug(`search tool called with query: ${nlQuery}, index: ${index}`);
      const timeRange = resolveTimeRange(attachments, explicitTimeRange);

      // Resolve top snippets config from UI setting + server config defaults
      let topSnippetsConfig: TopSnippetsConfig | undefined;
      try {
        const [coreStart] = await getStartServices();
        const uiSettingsClient = coreStart.uiSettings.asScopedToClient(savedObjectsClient);
        const isEnabled = await uiSettingsClient.get<boolean>(
          AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID
        );
        if (isEnabled) {
          topSnippetsConfig = topSnippetsDefaults;
        }
      } catch (error) {
        logger.debug(
          `Failed to read experimentalFeatures setting, falling back to highlighting: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      const results = await runSearchTool({
        nlQuery,
        index,
        allowPatternTarget: true,
        timeRange,
        esClient: esClient.asCurrentUser,
        modelProvider,
        events,
        logger,
        topSnippetsConfig,
        rowLimit: 100,
      });
      return { results };
    },
    tags: [],
  };
};
