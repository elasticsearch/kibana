/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common';
import { contextEngineAiIndexTools } from '@kbn/agent-builder-common/tools';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import {
  DEFAULT_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_LENGTH,
  MAX_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_PARAMS,
  MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH,
  MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH,
} from '@kbn/context-engine-plugin/common/constants';
import { z } from '@kbn/zod/v4';
import dedent from 'dedent';
import { aiIndexToolsAvailability } from '../ai_index_tools_availability';
import { getErrorMessage, type AiIndexToolDeps } from '../ai_index_read_service';
import { queryAiIndicesHandler } from './handler';

const queryAiIndicesSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(MAX_AI_INDEX_QUERY_LENGTH)
    .describe(
      'The ES|QL query to run. Its FROM decides which indices are read; use the esql_target returned by the list or describe AI index tools. Do not add a space condition: the server applies the space filter.'
    ),
  params: z
    .record(
      z.string().min(1).max(MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH),
      z.union([z.string().max(MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH), z.number(), z.boolean()])
    )
    .refine((params) => Object.keys(params).length <= MAX_AI_INDEX_QUERY_PARAMS, {
      message: `params must not have more than ${MAX_AI_INDEX_QUERY_PARAMS} entries.`,
    })
    .optional()
    .describe('(Optional) Values for ?named parameters in the query.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_AI_INDEX_QUERY_LIMIT)
    .optional()
    .default(DEFAULT_AI_INDEX_QUERY_LIMIT)
    .describe(
      `(Optional) Maximum rows to return. Defaults to ${DEFAULT_AI_INDEX_QUERY_LIMIT}, at most ${MAX_AI_INDEX_QUERY_LIMIT}; a smaller LIMIT in the query wins.`
    ),
});

export const createQueryAiIndicesTool = (
  deps: AiIndexToolDeps
): BuiltinToolDefinition<typeof queryAiIndicesSchema> => ({
  id: contextEngineAiIndexTools.queryAiIndices,
  type: ToolType.builtin,
  tags: ['context_engine'],
  annotations: {
    title: 'Query AI indices',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  description: dedent`
    Run an ES|QL query against Context Engine AI indices and return the rows.
    Call the describe AI index tool first: it gives the FROM target, the fields, and example queries to start from.

    The server applies the space filter and a row limit (at most ${MAX_AI_INDEX_QUERY_LIMIT}); do not write a space condition in the query.
    The space is taken from the request (over MCP, from the URL: /api/agent_builder/mcp is the default space, /s/{spaceId}/api/agent_builder/mcp another space).
    The query's FROM decides which indices are read, and the current user's Elasticsearch index privileges bound what it can reach; the query is not restricted to a single AI index.
    Express time constraints directly in ES|QL (e.g. WHERE @timestamp >= NOW() - 24 hours) or through params.
  `,
  schema: queryAiIndicesSchema,
  availability: aiIndexToolsAvailability,
  // Not esqlResults: UI replays those in Discover/Lens, dropping server-side space filter + limit.
  handler: async ({ query, params, limit }, context) => {
    try {
      const { columns, values } = await queryAiIndicesHandler({
        deps,
        request: { query, params, limit },
        context,
      });
      return { results: [{ type: ToolResultType.other, data: { columns, values } }] };
    } catch (error) {
      const message = getErrorMessage(error);
      context.logger.error(
        `Error running ${contextEngineAiIndexTools.queryAiIndices}: ${message}`,
        { error }
      );
      return { results: [{ type: ToolResultType.error, data: { message } }] };
    }
  },
});
