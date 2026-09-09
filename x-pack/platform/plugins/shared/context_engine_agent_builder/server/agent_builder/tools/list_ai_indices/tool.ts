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
    title: 'List AI indices',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  description: dedent`
    List the Context Engine AI indices you can read in the current space.
    Start here, then call the describe AI index tool on an entry before writing a query for the query AI indices tool.

    Each entry has the id, the ES|QL target to put in FROM (esql_target), a description, whether Elastic manages it, and, when running inside an agent, whether the agent is configured with it (assigned_to_agent).
    The space is taken from the request (over MCP, from the URL: /api/agent_builder/mcp is the default space, /s/{spaceId}/api/agent_builder/mcp another space).
    Entries whose visibility probe fails, or whose documents all belong to other spaces, are omitted; empty or unresolved targets may remain listed.
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
