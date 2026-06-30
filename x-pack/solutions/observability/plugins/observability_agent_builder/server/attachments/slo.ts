/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import dedent from 'dedent';
import type { Logger } from '@kbn/core/server';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { OBSERVABILITY_SLO_ATTACHMENT_TYPE_ID } from '../../common';
import type { ObservabilityAgentBuilderDataRegistry } from '../data_registry/data_registry';
import { MAX_SHORT_STRING_LENGTH } from '../utils/schema_limits';
import { observabilityAttachmentDataSchema } from './observability_attachment_data_schema';

const GET_SLO_DETAILS_TOOL_ID = 'get_slo_details';

const sloDataSchema = observabilityAttachmentDataSchema.extend({
  sloId: z.string().max(MAX_SHORT_STRING_LENGTH),
  sloInstanceId: z.string().max(MAX_SHORT_STRING_LENGTH).optional(),
  remoteName: z.string().max(MAX_SHORT_STRING_LENGTH).optional(),
});

export type SloAttachmentData = z.infer<typeof sloDataSchema>;

export function createSloAttachmentType({
  logger,
  dataRegistry,
}: {
  logger: Logger;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
}): AttachmentTypeDefinition<typeof OBSERVABILITY_SLO_ATTACHMENT_TYPE_ID, SloAttachmentData> {
  return {
    id: OBSERVABILITY_SLO_ATTACHMENT_TYPE_ID,
    validate: (input) => {
      const parsed = sloDataSchema.safeParse(input);
      if (parsed.success) {
        return { valid: true, data: parsed.data };
      }
      return { valid: false, error: parsed.error.message };
    },
    format: (attachment) => {
      const { sloId, sloInstanceId, remoteName } = attachment.data;

      return {
        getRepresentation: () => ({
          type: 'text',
          value: `Observability SLO ID: ${sloId}. Use the ${GET_SLO_DETAILS_TOOL_ID} tool to fetch full SLO information.`,
        }),
        getBoundedTools: () => [
          {
            id: GET_SLO_DETAILS_TOOL_ID,
            type: ToolType.builtin,
            description: `Fetch the full details for SLO ${sloId}.`,
            schema: z.object({}),
            handler: async (_args, context) => {
              try {
                const sloDetails = await dataRegistry.getData('sloDetails', {
                  request: context.request,
                  sloId,
                  sloInstanceId,
                  remoteName,
                });

                if (!sloDetails) {
                  return {
                    results: [
                      {
                        type: ToolResultType.error,
                        data: {
                          message: `SLO details not found for ${sloId}`,
                        },
                      },
                    ],
                  };
                }

                return {
                  results: [
                    {
                      type: ToolResultType.other,
                      data: sloDetails,
                    },
                  ],
                };
              } catch (error) {
                logger.error(`Failed to fetch SLO details for attachment: ${error?.message}`);
                logger.debug(error);

                return {
                  results: [
                    {
                      type: ToolResultType.error,
                      data: {
                        message: `Failed to fetch SLO details: ${error.message}`,
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
        `An Observability SLO attachment. The SLO ID is provided - use the ${GET_SLO_DETAILS_TOOL_ID} tool to fetch the full SLO information.`
      ),
  };
}
