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
import type { ObservabilityAgentBuilderCoreSetup } from '../types';
import { OBSERVABILITY_LOG_ATTACHMENT_TYPE_ID } from '../../common';
import { getLogDocumentById } from '../routes/ai_insights/get_log_document_by_id';
import { MAX_INDEX_PATTERN_LENGTH, MAX_SHORT_STRING_LENGTH } from '../utils/schema_limits';
import { observabilityAttachmentDataSchema } from './observability_attachment_data_schema';

const GET_LOG_DOCUMENT_TOOL_ID = 'get_log_document';

const logDataSchema = observabilityAttachmentDataSchema.extend({
  id: z.string().max(MAX_SHORT_STRING_LENGTH),
  index: z.string().max(MAX_INDEX_PATTERN_LENGTH),
});

export type LogAttachmentData = z.infer<typeof logDataSchema>;

export function createLogAttachmentType({
  core,
  logger,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  logger: Logger;
}): AttachmentTypeDefinition<typeof OBSERVABILITY_LOG_ATTACHMENT_TYPE_ID, LogAttachmentData> {
  return {
    id: OBSERVABILITY_LOG_ATTACHMENT_TYPE_ID,
    validate: (input) => {
      const parsed = logDataSchema.safeParse(input);
      if (parsed.success) {
        return { valid: true, data: parsed.data };
      }
      return { valid: false, error: parsed.error.message };
    },
    format: (attachment) => {
      const { index, id } = attachment.data;

      return {
        getRepresentation: () => ({
          type: 'text',
          value: `Observability Log ID: ${index}:${id}. Use the ${GET_LOG_DOCUMENT_TOOL_ID} tool to fetch full log document.`,
        }),
        getBoundedTools: () => [
          {
            id: GET_LOG_DOCUMENT_TOOL_ID,
            type: ToolType.builtin,
            description: `Fetch the log document for ${index}:${id}.`,
            schema: z.object({}),
            handler: async (_args, context) => {
              try {
                const [coreStart] = await core.getStartServices();
                const esClient = coreStart.elasticsearch.client.asScoped(context.request);

                const logEntry = await getLogDocumentById({
                  esClient: esClient.asCurrentUser,
                  index,
                  id,
                });

                if (!logEntry) {
                  return {
                    results: [
                      {
                        type: ToolResultType.error,
                        data: {
                          message: `Log document not found for ${index}:${id}`,
                        },
                      },
                    ],
                  };
                }

                return {
                  results: [
                    {
                      type: ToolResultType.other,
                      data: logEntry,
                    },
                  ],
                };
              } catch (error) {
                logger.error(`Failed to fetch log document for attachment: ${error?.message}`);
                logger.debug(error);

                return {
                  results: [
                    {
                      type: ToolResultType.error,
                      data: {
                        message: `Failed to fetch log document: ${error.message}`,
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
        `An Observability Log attachment. The log ID is provided - use the ${GET_LOG_DOCUMENT_TOOL_ID} tool to fetch the full log information.`
      ),
  };
}
