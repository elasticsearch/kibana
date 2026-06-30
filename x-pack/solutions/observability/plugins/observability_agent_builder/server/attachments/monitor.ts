/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import dedent from 'dedent';
import { z } from '@kbn/zod/v4';
import type { Logger } from '@kbn/core/server';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import { OBSERVABILITY_MONITOR_ATTACHMENT_TYPE_ID } from '../../common';
import type { ObservabilityAgentBuilderDataRegistry } from '../data_registry/data_registry';
import { MAX_SHORT_STRING_LENGTH } from '../utils/schema_limits';
import { observabilityAttachmentDataSchema } from './observability_attachment_data_schema';

const GET_MONITOR_DETAILS_TOOL_ID = 'get_monitor_details';

const monitorDataSchema = observabilityAttachmentDataSchema.extend({
  configId: z.string().max(MAX_SHORT_STRING_LENGTH),
  monitorName: z.string().max(MAX_SHORT_STRING_LENGTH),
  monitorType: z.string().max(MAX_SHORT_STRING_LENGTH),
});

export type MonitorAttachmentData = z.infer<typeof monitorDataSchema>;

export function createMonitorAttachmentType({
  logger,
  dataRegistry,
}: {
  logger: Logger;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
}): AttachmentTypeDefinition<
  typeof OBSERVABILITY_MONITOR_ATTACHMENT_TYPE_ID,
  MonitorAttachmentData
> {
  return {
    id: OBSERVABILITY_MONITOR_ATTACHMENT_TYPE_ID,
    validate: (input) => {
      const parsed = monitorDataSchema.safeParse(input);
      if (parsed.success) {
        return { valid: true, data: parsed.data };
      }
      return { valid: false, error: parsed.error.message };
    },
    format: (attachment) => {
      const { configId, monitorName, monitorType } = attachment.data;

      return {
        getRepresentation: () => ({
          type: 'text',
          value: `Observability Synthetics Monitor: ${monitorName} (${monitorType}). Use the ${GET_MONITOR_DETAILS_TOOL_ID} tool to fetch full monitor details.`,
        }),
        getBoundedTools: () => [
          {
            id: GET_MONITOR_DETAILS_TOOL_ID,
            type: ToolType.builtin,
            description: `Fetch the full details for synthetics monitor "${monitorName}" (${monitorType}).`,
            schema: z.object({}),
            handler: async (_args, context) => {
              try {
                const monitorDetails = await dataRegistry.getData('syntheticsMonitorDetails', {
                  request: context.request,
                  configId,
                });

                if (!monitorDetails) {
                  return {
                    results: [
                      {
                        type: ToolResultType.error,
                        data: {
                          message: `Monitor details not found for ${monitorName} (${configId})`,
                        },
                      },
                    ],
                  };
                }

                return {
                  results: [
                    {
                      type: ToolResultType.other,
                      data: monitorDetails,
                    },
                  ],
                };
              } catch (error) {
                logger.error(`Failed to fetch monitor details for attachment: ${error?.message}`);
                logger.debug(error);

                return {
                  results: [
                    {
                      type: ToolResultType.error,
                      data: {
                        message: `Failed to fetch monitor details: ${error.message}`,
                        stack: error.stack,
                      },
                    },
                  ],
                };
              }
            },
          },
        ],
      };
    },
    getTools: () => [],
    getAgentDescription: () =>
      dedent(
        `An Observability synthetics monitor attachment. The monitor config ID is provided - Use the ${GET_MONITOR_DETAILS_TOOL_ID} tool to fetch the full monitor configuration details.`
      ),
  };
}
