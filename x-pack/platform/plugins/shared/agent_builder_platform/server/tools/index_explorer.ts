/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { indexExplorer } from '@kbn/agent-builder-genai-utils';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';

const indexExplorerSchema = z.object({
  query: z
    .string()
    .describe('A natural language query to infer which indices, aliases or datastreams to use.'),
  limit: z
    .number()
    .optional()
    .describe('(optional) Limit the max number of indices to return. Defaults to 1.'),
  indexPattern: z
    .string()
    .optional()
    .describe('(optional) Index pattern to filter indices by. Defaults to *.'),
});

export const indexExplorerTool = (): BuiltinToolDefinition<typeof indexExplorerSchema> => {
  return {
    id: platformCoreTools.indexExplorer,
    type: ToolType.builtin,
    description: `List relevant indices, aliases and datastreams based on a natural language query.

The 'indexPattern' parameter can be used to filter indices by a specific pattern, e.g. 'foo*'.
This should *only* be used if you know what you're doing (e.g. if the user explicitly specified a pattern).
Otherwise, leave it empty to search against all indices.

*Example:*
User: "Show me my latest alerts"
You: call tool 'index_explorer' with { query: 'indices containing user alerts' }
Tool result: [{ type: "index", name: '.alerts' }]
`,
    schema: indexExplorerSchema,
    handler: async (
      { query: nlQuery, indexPattern = '*', limit = 1 },
      { esClient, experimentalFeatures, modelProvider, logger }
    ) => {
      logger.debug(
        `Index explorer tool called with query: ${nlQuery}, indexPattern: ${indexPattern}, limit: ${limit}`
      );
      const model = await modelProvider.getDefaultModel();
      const response = await indexExplorer({
        nlQuery,
        indexPattern,
        limit,
        includeDatasets: experimentalFeatures.datasets,
        esClient: esClient.asCurrentUser,
        model,
      });

      return {
        results: [
          {
            type: ToolResultType.other,
            data: {
              resources: response.resources.map((resource) => ({
                type: resource.type,
                name: resource.name,
                reason: resource.reason,
              })),
            },
          },
        ],
      };
    },
    tags: [],
  };
};
