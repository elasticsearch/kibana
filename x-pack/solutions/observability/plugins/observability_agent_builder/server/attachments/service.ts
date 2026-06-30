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
import { OBSERVABILITY_SERVICE_ATTACHMENT_TYPE_ID } from '../../common';
import type { ObservabilityAgentBuilderDataRegistry } from '../data_registry/data_registry';
import { MAX_SHORT_STRING_LENGTH } from '../utils/schema_limits';
import { observabilityAttachmentDataSchema } from './observability_attachment_data_schema';

const GET_SERVICE_DETAILS_TOOL_ID = 'get_service_details';

const serviceDataSchema = observabilityAttachmentDataSchema.extend({
  serviceName: z.string().max(MAX_SHORT_STRING_LENGTH),
  environment: z.string().max(MAX_SHORT_STRING_LENGTH),
  start: z.string().max(MAX_SHORT_STRING_LENGTH),
  end: z.string().max(MAX_SHORT_STRING_LENGTH),
});

export type ServiceAttachmentData = z.infer<typeof serviceDataSchema>;

export function createServiceAttachmentType({
  logger,
  dataRegistry,
}: {
  logger: Logger;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
}): AttachmentTypeDefinition<
  typeof OBSERVABILITY_SERVICE_ATTACHMENT_TYPE_ID,
  ServiceAttachmentData
> {
  return {
    id: OBSERVABILITY_SERVICE_ATTACHMENT_TYPE_ID,
    validate: (input) => {
      const parsed = serviceDataSchema.safeParse(input);
      if (parsed.success) {
        return { valid: true, data: parsed.data };
      }
      return { valid: false, error: parsed.error.message };
    },
    format: (attachment) => {
      const { serviceName, environment, start, end } = attachment.data;

      return {
        getRepresentation: () => ({
          type: 'text',
          value: `Observability Service Name: ${serviceName}. Use the ${GET_SERVICE_DETAILS_TOOL_ID} tool to fetch the full service details.`,
        }),
        getBoundedTools: () => [
          {
            id: GET_SERVICE_DETAILS_TOOL_ID,
            type: ToolType.builtin,
            description: `Fetch the full service details for service ${serviceName}.`,
            schema: z.object({}),
            handler: async (_args, context) => {
              try {
                const serviceDetails = await dataRegistry.getData('apmServiceSummary', {
                  request: context.request,
                  serviceName,
                  serviceEnvironment: environment,
                  start,
                  end,
                });

                if (!serviceDetails) {
                  return {
                    results: [
                      {
                        type: ToolResultType.error,
                        data: {
                          message: `Service details not found for ${serviceName}`,
                        },
                      },
                    ],
                  };
                }

                return {
                  results: [
                    {
                      type: ToolResultType.other,
                      data: serviceDetails,
                    },
                  ],
                };
              } catch (error) {
                logger.error(`Failed to fetch service details for attachment: ${error?.message}`);
                logger.debug(error);

                return {
                  results: [
                    {
                      type: ToolResultType.error,
                      data: {
                        message: `Failed to fetch service details: ${error.message}`,
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
        `An Observability service attachment. The service name, environment and the time range is provided - use the ${GET_SERVICE_DETAILS_TOOL_ID} tool to fetch the full service details.`
      ),
  };
}
