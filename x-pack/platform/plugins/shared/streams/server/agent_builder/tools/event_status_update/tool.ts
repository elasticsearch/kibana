/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformStreamsSigEventsTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition, StaticToolRegistration } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import { significantEventStatusSchema } from '@kbn/streams-schema';
import { z } from '@kbn/zod/v4';
import dedent from 'dedent';
import type { EbtTelemetryClient } from '../../../lib/telemetry/ebt';
import type { GetScopedClients } from '../../../routes/types';
import { assertSignificantEventsAccess } from '../../../routes/utils/assert_significant_events_access';
import type { StreamsServer } from '../../../types';
import { createSignificantEventsAvailability } from '../significant_events_availability';
import { updateEventStatusToolHandler } from './handler';

export const STREAMS_EVENT_STATUS_UPDATE_TOOL_ID = platformStreamsSigEventsTools.updateEventStatus;

const eventStatusUpdateSchema = z.object({
  event_id: z.string().describe(
    i18n.translate('xpack.streams.agentBuilder.tools.eventStatusUpdate.schema.eventId', {
      defaultMessage: 'Identifier of the significant event to update.',
    })
  ),
  status: significantEventStatusSchema.describe(
    i18n.translate('xpack.streams.agentBuilder.tools.eventStatusUpdate.schema.status', {
      defaultMessage: 'Target status value to set.',
    })
  ),
});

export function createEventStatusUpdateTool({
  getScopedClients,
  server,
  logger,
  telemetry,
}: {
  getScopedClients: GetScopedClients;
  server: StreamsServer;
  logger: Logger;
  telemetry: EbtTelemetryClient;
}): StaticToolRegistration<typeof eventStatusUpdateSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof eventStatusUpdateSchema> = {
    id: STREAMS_EVENT_STATUS_UPDATE_TOOL_ID,
    type: ToolType.builtin,
    description: dedent`
      ${i18n.translate('xpack.streams.agentBuilder.tools.eventStatusUpdate.description', {
        defaultMessage: 'Update the status of an existing significant event.',
      })}
    `,
    schema: eventStatusUpdateSchema,
    tags: ['streams', 'significant_events'],
    availability: createSignificantEventsAvailability({ server, logger }),
    handler: async (toolParams, context) => {
      const { request } = context;
      try {
        const { getEventClient, licensing, uiSettingsClient } = await getScopedClients({ request });
        await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

        const data = await updateEventStatusToolHandler({
          eventClient: getEventClient(),
          eventId: toolParams.event_id,
          status: toolParams.status,
        });

        telemetry.trackAgentToolEventStatusUpdate({
          success: true,
          event_id: toolParams.event_id,
          status: toolParams.status,
        });

        return { results: [{ type: ToolResultType.other, data }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error running event_status_update: ${message}`);
        telemetry.trackAgentToolEventStatusUpdate({
          success: false,
          event_id: toolParams.event_id,
          status: toolParams.status,
          error_message: message,
        });
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: i18n.translate(
                  'xpack.streams.agentBuilder.tools.eventStatusUpdate.errorMessage',
                  {
                    defaultMessage: 'Failed to update significant event status: {message}',
                    values: { message },
                  }
                ),
              },
            },
          ],
        };
      }
    },
  };

  return toolDefinition;
}
