/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { runSearchTool } from '@kbn/agent-builder-genai-utils/tools';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import { getAgentBuilderResourceAvailability } from '../utils/get_agent_builder_resource_availability';
import { DEFAULT_ALERTS_INDEX, ESSENTIAL_ALERT_FIELDS } from '../../../common/constants';
import { securityTool } from './constants';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../plugin_contract';

const alertsSchema = z.object({
  query: z
    .string()
    .describe('A natural language query expressing the search request for security alerts'),
  index: z
    .string()
    .optional()
    .describe(
      'Specific alerts index to search against. If not provided, will search against .alerts-security.alerts-* pattern.'
    ),
  isCount: z
    .boolean()
    .optional()
    .describe(
      'Set to true when the user is asking for a count of alerts (e.g., "how many alerts", "count alerts", "total number of alerts"). When true, the query will be optimized to return a count result instead of individual alert documents.'
    ),
});

export const SECURITY_ALERTS_TOOL_ID = securityTool('alerts');

/**
 * Checks if the given index is a security alerts index
 */
const isAlertsIndex = (index: string): boolean => {
  return index.includes(DEFAULT_ALERTS_INDEX) || index.startsWith('.alerts-security.alerts');
};

/**
 * Enhances the natural language query with instructions to use KEEP clause for alert searches.
 * This ensures the LLM generates ES|QL queries that filter to only essential fields.
 * Additionally, for count queries, ensures optimal count query generation.
 */
const enhanceQueryForAlerts = (nlQuery: string, index: string, isCount?: boolean): string => {
  if (!isAlertsIndex(index)) {
    return nlQuery;
  }

  const fieldsList = ESSENTIAL_ALERT_FIELDS.map((field) => `\`${field}\``).join(', ');
  let instruction = ` IMPORTANT: When generating ES|QL queries, you MUST include a KEEP clause to limit results to only these essential fields: ${fieldsList}. This reduces context window usage by filtering out unnecessary nested data like DLL lists, call stacks, and memory regions. Add the KEEP clause before any LIMIT clause, or at the end if there's no LIMIT.`;

  // For count queries, add specific instructions to ensure optimal count query generation
  if (isCount) {
    instruction += ` CRITICAL: This is a count query. You MUST generate an ES|QL query that returns ONLY a count result, not individual document rows. Use STATS count = COUNT(*) to return a single number. If grouping is needed (e.g., "count by severity"), use STATS count = COUNT(*) BY [field] but ensure the result is aggregated counts, not individual document rows. Do NOT include a LIMIT clause for count queries unless grouping is used.`;
  }

  return `${nlQuery}${instruction}`;
};

export const alertsTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof alertsSchema> => {
  return {
    id: SECURITY_ALERTS_TOOL_ID,
    type: ToolType.builtin,
    description: `Search and analyze security alerts using full-text or structured queries for finding, counting, aggregating, or summarizing alerts. When the user asks for a count (e.g., "how many alerts", "count alerts", "total number of alerts"), set the isCount parameter to true to optimize the query for count results.`,
    schema: alertsSchema,
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (
      { query: nlQuery, index, isCount },
      { esClient, modelProvider, spaceId, events }
    ) => {
      const searchIndex = index ?? `${DEFAULT_ALERTS_INDEX}-${spaceId}`;

      // Enhance the query with KEEP clause instructions if searching alerts index
      const enhancedQuery = enhanceQueryForAlerts(nlQuery, searchIndex, isCount);

      logger.debug(
        `alerts tool called with query: ${nlQuery}, index: ${searchIndex}, isCount: ${
          isCount ?? false
        }`
      );
      const results = await runSearchTool({
        nlQuery: enhancedQuery,
        index: searchIndex,
        esClient: esClient.asCurrentUser,
        modelProvider,
        events,
        logger,
      });

      return { results };
    },
    tags: ['security', 'alerts'],
  };
};
