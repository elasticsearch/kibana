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
      'The ES|QL query to run. Its FROM decides which indices are read; use the esql_target from the list or describe AI Index tools. Do not add a space condition: the server adds the space filter.'
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
      `(Optional) Maximum rows to return. Defaults to ${DEFAULT_AI_INDEX_QUERY_LIMIT}, at most ${MAX_AI_INDEX_QUERY_LIMIT}. If the query has a smaller LIMIT, that smaller value is used.`
    ),
});

export const createQueryAiIndicesTool = (
  deps: AiIndexToolDeps
): BuiltinToolDefinition<typeof queryAiIndicesSchema> => ({
  id: contextEngineAiIndexTools.queryAiIndices,
  type: ToolType.builtin,
  tags: ['context_engine'],
  annotations: {
    title: 'Query AI Indices',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  description: dedent`
    Run an ES|QL query against Context Engine AI Indices and return the rows.
    Call the describe AI Index tool first: it gives the FROM target, the fields, and example queries to start from.

    The server adds the space filter and a row limit (at most ${MAX_AI_INDEX_QUERY_LIMIT}). Do not write a space condition in the query.
    The space comes from the request. Over MCP that is the URL: /api/agent_builder/mcp is the default space, /s/{spaceId}/api/agent_builder/mcp is another space.
    The query's FROM decides which indices are read. It is not limited to one AI Index, and it can only read indices you have Elasticsearch read access to.
    Put time constraints in the ES|QL itself (for example WHERE @timestamp >= NOW() - 24 hours) or in params.
  `,
  schema: queryAiIndicesSchema,
  availability: aiIndexToolsAvailability,
  // Not esql_results: the UI re-runs those in Discover and Lens without the server's space filter and limit.
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
