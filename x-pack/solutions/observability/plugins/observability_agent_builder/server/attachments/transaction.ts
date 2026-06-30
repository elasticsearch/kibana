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
import { OBSERVABILITY_TRANSACTION_ATTACHMENT_TYPE_ID } from '../../common';
import type { ObservabilityAgentBuilderDataRegistry } from '../data_registry/data_registry';
import { MAX_SHORT_STRING_LENGTH } from '../utils/schema_limits';
import { observabilityAttachmentDataSchema } from './observability_attachment_data_schema';

const GET_TRANSACTION_DETAILS_TOOL_ID = 'get_transaction_details';

const transactionDataSchema = observabilityAttachmentDataSchema.extend({
  serviceName: z.string().max(MAX_SHORT_STRING_LENGTH),
  transactionName: z.string().max(MAX_SHORT_STRING_LENGTH),
  transactionType: z.string().max(MAX_SHORT_STRING_LENGTH),
  traceId: z.string().max(MAX_SHORT_STRING_LENGTH).optional(),
  transactionId: z.string().max(MAX_SHORT_STRING_LENGTH).optional(),
  start: z.string().max(MAX_SHORT_STRING_LENGTH),
  end: z.string().max(MAX_SHORT_STRING_LENGTH),
});

export type TransactionAttachmentData = z.infer<typeof transactionDataSchema>;

export function createTransactionAttachmentType({
  logger,
  dataRegistry,
}: {
  logger: Logger;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
}): AttachmentTypeDefinition<
  typeof OBSERVABILITY_TRANSACTION_ATTACHMENT_TYPE_ID,
  TransactionAttachmentData
> {
  return {
    id: OBSERVABILITY_TRANSACTION_ATTACHMENT_TYPE_ID,
    validate: (input) => {
      const parsed = transactionDataSchema.safeParse(input);
      if (parsed.success) {
        return { valid: true, data: parsed.data };
      }
      return { valid: false, error: parsed.error.message };
    },
    format: (attachment) => {
      const { serviceName, transactionName, transactionType, transactionId, traceId, start, end } =
        attachment.data;

      return {
        getRepresentation: () => ({
          type: 'text',
          value: `Observability APM Transaction: ${transactionName} (${transactionType}) in service ${serviceName}. Use the ${GET_TRANSACTION_DETAILS_TOOL_ID} tool to fetch full transaction details.`,
        }),
        getBoundedTools: () => [
          {
            id: GET_TRANSACTION_DETAILS_TOOL_ID,
            type: ToolType.builtin,
            description: `Fetch the full transaction details for transaction "${transactionName}" (${transactionType}) in service ${serviceName}.`,
            schema: z.object({}),
            handler: async (_args, context) => {
              try {
                const transactionDetails = await dataRegistry.getData('apmTransactionDetails', {
                  request: context.request,
                  serviceName,
                  transactionName,
                  transactionId,
                  traceId,
                  start,
                  end,
                });

                if (!transactionDetails?.transaction) {
                  return {
                    results: [
                      {
                        type: ToolResultType.error,
                        data: {
                          message: `Transaction details not found for ${transactionName}`,
                        },
                      },
                    ],
                  };
                }

                return {
                  results: [
                    {
                      type: ToolResultType.other,
                      data: transactionDetails,
                    },
                  ],
                };
              } catch (error) {
                logger.error(
                  `Failed to fetch transaction details for attachment: ${error?.message}`
                );
                logger.debug(error);

                return {
                  results: [
                    {
                      type: ToolResultType.error,
                      data: {
                        message: `Failed to fetch transaction details: ${error.message}`,
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
        `An Observability APM transaction attachment. The service name, transaction name, transaction type and time range are provided - use the ${GET_TRANSACTION_DETAILS_TOOL_ID} tool to fetch the full transaction details.`
      ),
  };
}
