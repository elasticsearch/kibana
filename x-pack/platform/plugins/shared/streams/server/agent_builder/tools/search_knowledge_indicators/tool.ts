/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformStreamsSigEventsTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  BuiltinToolDefinition,
  StaticToolRegistration,
  ToolAvailabilityResult,
} from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import dedent from 'dedent';
import type { StreamsServer } from '../../../types';
import type { GetScopedClients } from '../../../routes/types';
import { assertSignificantEventsAccess } from '../../../routes/utils/assert_significant_events_access';
import { searchKnowledgeIndicatorsToolHandler } from './handler';

export const STREAMS_SEARCH_KNOWLEDGE_INDICATORS_TOOL_ID =
  platformStreamsSigEventsTools.searchKnowledgeIndicators;

const searchKnowledgeIndicatorsSchema = z.object({
  stream_names: z
    .array(z.string())
    .optional()
    .describe('Optional. If omitted, search across all accessible streams.'),
  search_text: z
    .string()
    .optional()
    .describe(
      'Optional. Natural-language search with semantic ranking (hybrid keyword + vector). Descriptive phrases work better than single keywords.'
    ),
  kind: z
    .array(z.enum(['feature', 'query']))
    .optional()
    .default([])
    .describe(
      dedent`What to return.
      - ['query']: queries-only KIs
      - ['feature']: feature-based KIs only
      - default (empty array or omitted): both features and queries`
    ),
  limit: z
    .number()
    .min(1)
    .optional()
    .default(50)
    .describe('Optional safety cap for returned items.'),
});

export function createSearchKnowledgeIndicatorsTool({
  getScopedClients,
  server,
  logger,
}: {
  getScopedClients: GetScopedClients;
  server: StreamsServer;
  logger: Logger;
}): StaticToolRegistration<typeof searchKnowledgeIndicatorsSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof searchKnowledgeIndicatorsSchema> = {
    id: STREAMS_SEARCH_KNOWLEDGE_INDICATORS_TOOL_ID,
    type: ToolType.builtin,
    description: dedent`
      Search Knowledge Indicators (KIs) derived from streams data to enrich context for a target
      stream, service, or group of streams.

      KIs include:
      - Feature-based indicators (stream features)
      - Query-based indicators (stored stream queries)

      Use this tool to:
      - Gather domain context for a specific stream or group of streams
      - Narrow results by \`stream_names\`, \`kind\`, and \`limit\`
      - Find relevant KIs via semantic text using \`search_text\`
      - Retrieve queries-only KIs with \`kind: ['query']\`
    `,
    schema: searchKnowledgeIndicatorsSchema,
    tags: ['streams', 'significant_events'],
    availability: {
      cacheMode: 'space',
      handler: async ({ uiSettings }): Promise<ToolAvailabilityResult> => {
        try {
          await assertSignificantEventsAccess({
            server,
            licensing: server.licensing,
            uiSettingsClient: uiSettings,
          });
          return { status: 'available' };
        } catch (error) {
          if (error instanceof Error) {
            logger.debug(error.stack ?? error.message);
          } else {
            logger.debug(String(error));
          }
          return {
            status: 'unavailable',
            reason:
              error instanceof Error
                ? error.message
                : 'Significant events access is not available in the current context',
          };
        }
      },
    },
    handler: async (toolParams, context) => {
      const { request } = context;

      try {
        const scopedClients = await getScopedClients({ request });

        await assertSignificantEventsAccess({
          server,
          licensing: scopedClients.licensing,
          uiSettingsClient: scopedClients.uiSettingsClient,
        });

        const kiClient = await scopedClients.getKnowledgeIndicatorClient();

        const output = await searchKnowledgeIndicatorsToolHandler({
          streamsClient: scopedClients.streamsClient,
          kiClient,
          logger,
          params: toolParams,
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: output,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error running ki_search: ${message}`);
        if (error instanceof Error) {
          logger.debug(error.stack ?? error.message);
        } else {
          logger.debug(String(error));
        }

        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to search knowledge indicators: ${message}`,
              },
            },
          ],
        };
      }
    },
  };

  return toolDefinition;
}
