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
import {
  getStreamTypeFromDefinition,
  type StreamType,
  upsertStreamQueryRequestSchema,
} from '@kbn/streams-schema';
import dedent from 'dedent';
import type { StreamsServer } from '../../../types';
import type { GetScopedClients } from '../../../routes/types';
import { assertSignificantEventsAccess } from '../../../routes/utils/assert_significant_events_access';
import type { EbtTelemetryClient } from '../../../lib/telemetry/ebt';
import { createQueryKnowledgeIndicatorToolHandler } from './handler';

export const STREAMS_CREATE_QUERY_KNOWLEDGE_INDICATOR_TOOL_ID =
  platformStreamsSigEventsTools.createQueryKnowledgeIndicator;

const queryInputSchema = upsertStreamQueryRequestSchema.extend({
  id: z.string().optional(),
  expires_at: z.iso
    .datetime()
    .optional()
    .describe(
      'Optional expiry deadline (ISO 8601). Provide to create a managed KI that expires at this date. ' +
        'Omit to create a durable KI with no expiry.'
    ),
});

const createQueryKnowledgeIndicatorSchema = z
  .object({
    stream_name: z.string().describe('Target stream name where this query KI should be saved.'),
  })
  .extend(queryInputSchema.shape);

export function createQueryKnowledgeIndicatorTool({
  getScopedClients,
  server,
  logger,
  telemetry,
}: {
  getScopedClients: GetScopedClients;
  server: StreamsServer;
  logger: Logger;
  telemetry: EbtTelemetryClient;
}): StaticToolRegistration<typeof createQueryKnowledgeIndicatorSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof createQueryKnowledgeIndicatorSchema> = {
    id: STREAMS_CREATE_QUERY_KNOWLEDGE_INDICATOR_TOOL_ID,
    type: ToolType.builtin,
    description: dedent`
      Create a query Knowledge Indicator (KI) for a stream and persist it to significant events
      query storage.

      Use this tool when the conversation discovers a new detection query that should be saved for
      future investigations.
    `,
    schema: createQueryKnowledgeIndicatorSchema,
    tags: ['streams', 'significant_events'],
    confirmation: {
      askUser: 'always',
      getConfirmation: async ({ toolParams }) => {
        const streamName = String(toolParams.stream_name ?? 'unknown stream');
        const title = String(toolParams.title ?? 'Untitled query');
        const esql =
          typeof toolParams.esql === 'object' && toolParams.esql && 'query' in toolParams.esql
            ? String((toolParams.esql as { query?: unknown }).query ?? '')
            : '';

        return {
          title: 'Save Query KI',
          message: `Save Query KI for stream "${streamName}" (title: "${title}", esql: "${esql}")?`,
          confirm_text: 'Save',
          cancel_text: 'Cancel',
        };
      },
    },
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
    handler: async ({ stream_name: streamName, ...queryInput }, context) => {
      const { request } = context;
      let streamType: StreamType | 'unknown' = 'unknown';

      try {
        const { streamsClient, getKnowledgeIndicatorClient, licensing, uiSettingsClient } =
          await getScopedClients({
            request,
          });

        await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

        const definition = await streamsClient.getStream(streamName);
        streamType = getStreamTypeFromDefinition(definition);

        const kiClient = await getKnowledgeIndicatorClient();
        const { id } = await createQueryKnowledgeIndicatorToolHandler({
          kiClient,
          definition,
          queryInput,
          logger,
        });

        telemetry.trackAgentBuilderKnowledgeIndicatorCreated({
          ki_kind: 'query',
          tool_id: 'ki_query_create',
          success: true,
          stream_name: streamName,
          stream_type: streamType,
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                stream_name: streamName,
                query: {
                  id,
                },
                acknowledged: true,
              },
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error running ki_query_create: ${message}`);
        if (error instanceof Error) {
          logger.debug(error.stack ?? error.message);
        } else {
          logger.debug(String(error));
        }

        telemetry.trackAgentBuilderKnowledgeIndicatorCreated({
          ki_kind: 'query',
          tool_id: 'ki_query_create',
          success: false,
          stream_name: streamName,
          stream_type: streamType,
          error_message: message,
        });

        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to create query knowledge indicator: ${message}`,
              },
            },
          ],
        };
      }
    },
  };

  return toolDefinition;
}
