/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition, StaticToolRegistration } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import dedent from 'dedent';
import type {
  ObservabilityAgentBuilderCoreSetup,
  ObservabilityAgentBuilderPluginSetupDependencies,
} from '../../types';
import { timeRangeSchemaOptional, indexDescription } from '../../utils/tool_schemas';
import {
  MAX_INDEX_PATTERN_LENGTH,
  MAX_KQL_FILTER_LENGTH,
  MAX_SHORT_STRING_LENGTH,
} from '../../utils/schema_limits';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { getToolHandler } from './handler';
import { OBSERVABILITY_GET_TRACES_TOOL_ID } from '../get_traces/tool';

export interface GetLogGroupsToolResult {
  type: ToolResultType.other;
  data: { groups: Awaited<ReturnType<typeof getToolHandler>> };
}

const DEFAULT_TIME_RANGE = {
  start: 'now-1h',
  end: 'now',
};

export const OBSERVABILITY_GET_LOG_GROUPS_TOOL_ID = 'observability.get_log_groups';

const getLogsSchema = z.object({
  ...timeRangeSchemaOptional(DEFAULT_TIME_RANGE),
  index: z.string().max(MAX_INDEX_PATTERN_LENGTH).describe(indexDescription).optional(),
  kqlFilter: z
    .string()
    .max(MAX_KQL_FILTER_LENGTH)
    .optional()
    .describe(
      dedent`A KQL query to filter logs and exceptions. Examples:
        - 'service.name: "payment"'
        - 'service.name: "payment" AND log.level: error'
        - 'error.exception.type: "NullPointerException"'
        - 'service.environment: "production" AND error.exception.handled: false'`
    ),
  fields: z
    .array(z.string().max(MAX_SHORT_STRING_LENGTH))
    .default([])
    .describe(
      'Additional fields to return for each log group sample. Common fields like @timestamp, message, service.name, trace.id, and error fields are included by default.'
    ),
  includeStackTrace: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      dedent`Include stack traces. Stack traces can be large, so only enable when needed for debugging.`
    ),
  includeFirstSeen: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      dedent`Include firstSeen timestamp for application exception groups. Useful for detecting new exceptions.`
    ),
  limit: z.number().optional().default(20).describe('Maximum number of log groups to return.'),
});

export function createGetLogGroupsTool({
  core,
  plugins,
  logger,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  plugins: ObservabilityAgentBuilderPluginSetupDependencies;
  logger: Logger;
}): StaticToolRegistration<typeof getLogsSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof getLogsSchema> = {
    id: OBSERVABILITY_GET_LOG_GROUPS_TOOL_ID,
    type: ToolType.builtin,
    description: dedent`
      Returns categorized log messages and exceptions from logs and spans within a specified time range.
      
      Returns a flat array of log groups, each with a \`type\` field:
      - \`spanException\`: Span exceptions (errors) from APM, grouped by error.grouping_key
      - \`logException\`: Log exceptions with exception attributes, grouped by message pattern
      - \`log\`: Regular log messages, grouped by message pattern

      When to use:
      - Getting a quick summary of log activity and exceptions in a service or time range
      - Identifying what exceptions are being thrown and what's being logged
      - Discovering unexpected log patterns or new error types
      - Answering "what kinds of things are happening?" rather than "what exactly happened?"

      After using this tool:
      - Use \`${OBSERVABILITY_GET_TRACES_TOOL_ID}\` to trace the full sequence of events leading up to a given log sample

      Do NOT use for:
      - Understanding the sequence of events for a specific error (use \`${OBSERVABILITY_GET_TRACES_TOOL_ID}\`)
      - Analyzing changes in log volume over time (use run_log_rate_analysis)
    `,
    schema: getLogsSchema,
    tags: ['observability', 'logs', 'exceptions', 'errors'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async (toolParams, context) => {
      const { index, start, end, kqlFilter, fields, includeStackTrace, includeFirstSeen, limit } =
        toolParams;
      const { request, esClient } = context;

      try {
        const result = await getToolHandler({
          core,
          plugins,
          request,
          logger,
          esClient,
          index,
          start,
          end,
          kqlFilter,
          fields,
          includeStackTrace,
          includeFirstSeen,
          size: limit,
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: { groups: result },
            },
          ],
        };
      } catch (error) {
        logger.error(`Error fetching log groups: ${error.message}`);
        logger.debug(error);

        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to fetch log groups: ${error.message}`,
                stack: error.stack,
              },
            },
          ],
        };
      }
    },
  };

  return toolDefinition;
}
