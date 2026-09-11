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
import { z } from '@kbn/zod/v4';
import dedent from 'dedent';
import { aiIndexToolsAvailability } from '../ai_index_tools_availability';
import { getErrorMessage, type AiIndexToolDeps } from '../ai_index_read_service';
import { listAiIndicesHandler } from './handler';

const listAiIndicesSchema = z.object({});

export const createListAiIndicesTool = (
  deps: AiIndexToolDeps
): BuiltinToolDefinition<typeof listAiIndicesSchema> => ({
  id: contextEngineAiIndexTools.listAiIndices,
  type: ToolType.builtin,
  tags: ['context_engine'],
  annotations: {
    title: 'List AI Indices',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  description: dedent`
    List the Context Engine AI Indices you can use in the current space.
    Start here. Then call the describe AI Index tool on an entry before writing a query for the query AI Indices tool.

    Each entry has: the id, the ES|QL target to put in FROM (esql_target), a description, whether Elastic manages it, and, when running inside an agent, whether the agent is set up with it (assigned_to_agent).
    An AI Index is left out when you cannot read its backing index, or when every document in it belongs to another space. An empty AI Index is still listed.
    The space comes from the request. Over MCP that is the URL: /api/agent_builder/mcp is the default space, /s/{spaceId}/api/agent_builder/mcp is another space.
  `,
  schema: listAiIndicesSchema,
  availability: aiIndexToolsAvailability,
  handler: async (_params, context) => {
    try {
      const result = await listAiIndicesHandler({ deps, context });
      return { results: [{ type: ToolResultType.other, data: result }] };
    } catch (error) {
      const message = getErrorMessage(error);
      context.logger.error(`Error running ${contextEngineAiIndexTools.listAiIndices}: ${message}`, {
        error,
      });
      return { results: [{ type: ToolResultType.error, data: { message } }] };
    }
  },
});
