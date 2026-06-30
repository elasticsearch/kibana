/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformStreamsSigEventsTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  BuiltinToolDefinition,
  StaticToolRegistration,
  ToolAvailabilityResult,
} from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import { z } from '@kbn/zod/v4';
import {
  baseFeatureSchema,
  getStreamTypeFromDefinition,
  type StreamType,
} from '@kbn/streams-schema';
import dedent from 'dedent';
import type { StreamsServer } from '../../../types';
import type { GetScopedClients } from '../../../routes/types';
import { assertSignificantEventsAccess } from '../../../routes/utils/assert_significant_events_access';
import type { EbtTelemetryClient } from '../../../lib/telemetry/ebt';
import { createFeatureKnowledgeIndicatorToolHandler } from './handler';

export const STREAMS_CREATE_FEATURE_KNOWLEDGE_INDICATOR_TOOL_ID =
  platformStreamsSigEventsTools.createFeatureKnowledgeIndicator;

const createFeatureKISchema = baseFeatureSchema.extend({
  expires_at: z.iso
    .datetime()
    .optional()
    .describe(
      'Optional expiry deadline (ISO 8601). Provide to create a managed KI that expires at this date. ' +
        'Omit to create a durable KI with no expiry.'
    ),
});

export function createFeatureKnowledgeIndicatorTool({
  getScopedClients,
  server,
  logger,
  telemetry,
}: {
  getScopedClients: GetScopedClients;
  server: StreamsServer;
  logger: Logger;
  telemetry: EbtTelemetryClient;
}): StaticToolRegistration<typeof createFeatureKISchema> {
  const toolDefinition: BuiltinToolDefinition<typeof createFeatureKISchema> = {
    id: STREAMS_CREATE_FEATURE_KNOWLEDGE_INDICATOR_TOOL_ID,
    type: ToolType.builtin,
    description: dedent`
      Create a feature Knowledge Indicator (KI) for a stream and persist it to significant events
      feature storage.

      Use this tool when the conversation discovers a new stream behavior pattern and it should be
      saved as a feature KI for future investigations.
    `,
    schema: createFeatureKISchema,
    tags: ['streams', 'significant_events'],
    confirmation: {
      askUser: 'always',
      getConfirmation: async ({ toolParams }) => {
        const streamName = String(toolParams.stream_name ?? 'unknown stream');
        const id = String(toolParams.id ?? 'unknown-id');
        const type = String(toolParams.type ?? 'unknown-type');
        const subtype = toolParams.subtype ? String(toolParams.subtype) : undefined;
        const title = toolParams.title ? String(toolParams.title) : undefined;
        const typeLabel = subtype ? `${type}/${subtype}` : type;
        const titlePart = title ? `, title: "${title}"` : '';

        return {
          title: 'Save Feature KI',
          message: `Save Feature KI for stream "${streamName}" (id: "${id}", type: "${typeLabel}"${titlePart})?`,
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
    handler: async ({ stream_name: streamName, expires_at, ...featureInput }, context) => {
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
        const { id } = await createFeatureKnowledgeIndicatorToolHandler({
          kiClient,
          streamName,
          featureInput,
          expiresAt: expires_at,
          logger,
        });

        telemetry.trackAgentBuilderKnowledgeIndicatorCreated({
          ki_kind: 'feature',
          tool_id: 'ki_feature_create',
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
                feature: {
                  id,
                },
                acknowledged: true,
              },
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error running ki_feature_create: ${message}`);
        if (error instanceof Error) {
          logger.debug(error.stack ?? error.message);
        } else {
          logger.debug(String(error));
        }

        telemetry.trackAgentBuilderKnowledgeIndicatorCreated({
          ki_kind: 'feature',
          tool_id: 'ki_feature_create',
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
                message: `Failed to create feature knowledge indicator: ${message}`,
              },
            },
          ],
        };
      }
    },
  };

  return toolDefinition;
}
