/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { generateEsql } from '@kbn/agent-builder-genai-utils';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { ToolHandlerResult } from '@kbn/agent-builder-server/tools';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { resolveTimeRange } from './screen_context_utils';

const nlToEsqlToolSchema = z.object({
  query: z.string().describe('A natural language query to generate an ES|QL query from.'),
  index: z
    .string()
    .optional()
    .describe(
      '(optional) Index or index-pattern to search against. If not provided, will automatically select the best index to use based on the query.'
    ),
  context: z
    .string()
    .optional()
    .describe('(optional) Additional context that could be useful to generate the ES|QL query'),
  execute_query: z
    .boolean()
    .default(true)
    .describe(
      '(optional) If false, only validate the query using AST. If true (default), will execute the query to ensure it is valid before returning it.'
    ),
  disable_named_params: z
    .boolean()
    .default(false)
    .describe(
      '(optional) If true, disables the instruction to use named parameters (?_tstart, ?_tend) for time range filtering. Defaults to false.'
    ),
  time_range: z
    .object({
      from: z
        .string()
        .describe(
          'Start of the time range in Elasticsearch-compatible date format - Date Math or ISO 8601,, e.g. "now-24h" or "2026-01-01T00:00:00Z"'
        ),
      to: z
        .string()
        .describe(
          'End of the time range in Elasticsearch-compatible date format - Date Math or ISO 8601,, e.g. "now" or "2026-01-31T23:59:59Z"'
        ),
    })
    .optional()
    .describe(
      '(optional) Time range to use for named parameters ?_tstart and ?_tend when validating the generated query. If not provided, falls back to the time range from the screen context.'
    ),
});

export const generateEsqlTool = (): BuiltinToolDefinition<typeof nlToEsqlToolSchema> => {
  return {
    id: platformCoreTools.generateEsql,
    type: ToolType.builtin,
    description: 'Generate an ES|QL query from a natural language query.',
    schema: nlToEsqlToolSchema,
    handler: async (
      {
        query: nlQuery,
        index,
        context,
        execute_query: executeQuery = true,
        disable_named_params: disableNamedParams = false,
        time_range: explicitTimeRange,
      },
      { esClient, modelProvider, logger, events, attachments }
    ) => {
      const timeRange = resolveTimeRange(attachments, explicitTimeRange);

      const esqlResponse = await generateEsql({
        nlQuery,
        index,
        additionalContext: context,
        executeQuery,
        disableNamedParams,
        timeRange,
        modelProvider,
        esClient: esClient.asCurrentUser,
        logger,
        events,
      });

      const toolResults: ToolHandlerResult[] = [];

      if (esqlResponse.error) {
        toolResults.push({
          type: ToolResultType.error,
          data: {
            message: esqlResponse.error,
          },
        });
      } else {
        if (esqlResponse.query) {
          toolResults.push({
            type: ToolResultType.query,
            data: {
              esql: esqlResponse.query,
            },
          });
        }
        if (esqlResponse.answer) {
          toolResults.push({
            type: ToolResultType.other,
            data: {
              answer: esqlResponse.answer,
            },
          });
        }
      }

      return {
        results: toolResults,
      };
    },
    tags: [],
  };
};
