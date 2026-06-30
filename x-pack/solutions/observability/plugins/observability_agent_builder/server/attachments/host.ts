/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import dedent from 'dedent';
import { z } from '@kbn/zod/v4';
import type { Logger } from '@kbn/core/server';
import { ToolResultType, ToolType } from '@kbn/agent-builder-common';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import { OBSERVABILITY_HOST_ATTACHMENT_TYPE_ID } from '../../common';
import type { ObservabilityAgentBuilderDataRegistry } from '../data_registry/data_registry';
import { MAX_SHORT_STRING_LENGTH } from '../utils/schema_limits';
import { observabilityAttachmentDataSchema } from './observability_attachment_data_schema';

const GET_HOST_DETAILS_TOOL_ID = 'get_host_details';

const hostDataSchema = observabilityAttachmentDataSchema.extend({
  hostName: z.string().max(MAX_SHORT_STRING_LENGTH),
  start: z.string().max(MAX_SHORT_STRING_LENGTH),
  end: z.string().max(MAX_SHORT_STRING_LENGTH),
});

export type HostAttachmentData = z.infer<typeof hostDataSchema>;

export function createHostAttachmentType({
  logger,
  dataRegistry,
}: {
  logger: Logger;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
}): AttachmentTypeDefinition<typeof OBSERVABILITY_HOST_ATTACHMENT_TYPE_ID, HostAttachmentData> {
  return {
    id: OBSERVABILITY_HOST_ATTACHMENT_TYPE_ID,
    validate: (input) => {
      const parsed = hostDataSchema.safeParse(input);
      if (parsed.success) {
        return { valid: true, data: parsed.data };
      }
      return { valid: false, error: parsed.error.message };
    },
    format: (attachment) => {
      const { hostName, start, end } = attachment.data;

      return {
        getRepresentation: () => ({
          type: 'text',
          value: `Observability Host Name: ${hostName}. Use the ${GET_HOST_DETAILS_TOOL_ID} tool to fetch full host details.`,
        }),
        getBoundedTools: () => [
          {
            id: GET_HOST_DETAILS_TOOL_ID,
            type: ToolType.builtin,
            description: `Fetch the full host details for host ${hostName}.`,
            schema: z.object({}),
            handler: async (_args, context) => {
              try {
                const hostDetails = await dataRegistry.getData('infraHosts', {
                  request: context.request,
                  from: start,
                  to: end,
                  limit: 1,
                  query: {
                    bool: {
                      filter: [
                        {
                          term: {
                            'host.name': hostName,
                          },
                        },
                      ],
                    },
                  },
                });

                const host = hostDetails?.nodes?.[0];

                if (!host) {
                  return {
                    results: [
                      {
                        type: ToolResultType.error,
                        data: {
                          message: `Host details not found for ${hostName}`,
                        },
                      },
                    ],
                  };
                }

                return {
                  results: [
                    {
                      type: ToolResultType.other,
                      data: {
                        hostName,
                        start,
                        end,
                        host,
                      },
                    },
                  ],
                };
              } catch (error) {
                logger.error(`Failed to fetch host details for attachment: ${error?.message}`);
                logger.debug(error);

                return {
                  results: [
                    {
                      type: ToolResultType.error,
                      data: {
                        message: `Failed to fetch host details: ${error.message}`,
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
        `An Observability host attachment. The host name and time range are provided - use the ${GET_HOST_DETAILS_TOOL_ID} tool to fetch the full host details.`
      ),
  };
}
