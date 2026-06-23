/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId, createErrorResult } from '@kbn/agent-builder-server';
import { SEARCH_MODES } from '../../../../common/queries';
import { platformStreamsMemoryTools } from './tool_ids';
import type { MemoryToolsOptions } from './types';

const memorySearchSchema = z.object({
  query: z
    .string()
    .max(1000)
    .describe(
      'Search query to find relevant memory pages. Matched against titles, content, tags, names, and categories.'
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe('Optional tag filter — only return pages with at least one of these tags.'),
  categories: z
    .array(z.string())
    .optional()
    .describe(
      'Optional category filter — only return pages in at least one of these categories (e.g. ["services", "streams/logs-otel"]).'
    ),
  references: z
    .array(z.string())
    .optional()
    .describe('Optional filter by referenced page IDs — only return pages that reference these.'),
  size: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of results to return (defaults to 10).'),
  mode: z
    .enum(SEARCH_MODES)
    .optional()
    .describe(
      'Search mode — omit for the default "hybrid" behaviour, which combines keyword and semantic ' +
        'matching and finds pages that are thematically related even when they share no keywords with the query. ' +
        '"keyword": fast fuzzy/wildcard match only — use when you know the exact name, tag, or category and want ' +
        'to avoid false positives from semantic drift. ' +
        '"semantic": vector-similarity only — rarely the right choice because it ignores exact matches; prefer hybrid.'
    ),
});

export const createMemorySearchTool = ({
  getMemoryService,
}: MemoryToolsOptions): BuiltinToolDefinition<typeof memorySearchSchema> => ({
  id: platformStreamsMemoryTools.memorySearch,
  type: ToolType.builtin,
  description:
    'Search the shared memory for relevant pages. Returns metadata and short snippets only — ' +
    'use memory_read to get full content of specific pages. ' +
    'Memory contains persistent knowledge accumulated across conversations.',
  schema: memorySearchSchema,
  tags: ['memory'],
  handler: async ({ query, tags, categories, references, size, mode }, context) => {
    const memoryService = getMemoryService(context.esClient.asCurrentUser);

    try {
      const results = await memoryService.search({
        query,
        tags,
        categories,
        references,
        size,
        mode,
      });

      if (results.length === 0) {
        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                message: 'No memory pages found matching the query.',
                query,
                total: 0,
                items: [],
              },
            },
          ],
        };
      }

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: {
              query,
              total: results.length,
              items: results.map((r) => ({
                id: r.id,
                name: r.name,
                title: r.title,
                snippet: r.snippet,
                score: r.score,
                categories: r.categories,
                updated_at: r.updated_at,
                updated_by: r.updated_by,
              })),
            },
          },
        ],
      };
    } catch (error) {
      return {
        results: [
          createErrorResult({
            message: `Memory search failed: ${(error as Error).message}`,
            metadata: { query },
          }),
        ],
      };
    }
  },
  summarizeToolReturn: (toolReturn) => {
    if (toolReturn.results.length === 0) return undefined;
    const result = toolReturn.results[0];
    if (result.type !== ToolResultType.other) return undefined;
    const data = result.data as Record<string, unknown>;
    return [
      {
        ...result,
        data: {
          summary: `Memory search for "${data.query}" returned ${data.total} results`,
          total: data.total,
        },
      },
    ];
  },
});
