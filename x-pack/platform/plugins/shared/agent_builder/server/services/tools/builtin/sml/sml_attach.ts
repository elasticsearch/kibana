/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { ATTACHMENT_REF_ACTOR } from '@kbn/agent-builder-common/attachments';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId, createErrorResult } from '@kbn/agent-builder-server';
import type { SmlToolsOptions } from './types';

const smlAttachSchema = z.object({
  entry_ids: z
    .array(z.string())
    .min(1)
    .max(50)
    .describe(
      'One or more entry_id values exactly as returned by sml_search, or the path after sml:// in a user @-mention link.'
    ),
});

/**
 * Creates the sml_attach tool.
 * Converts SML search results into conversation attachments.
 */
export const createSmlAttachTool = ({
  getAgentBuilderSml,
}: SmlToolsOptions): BuiltinToolDefinition<typeof smlAttachSchema> => ({
  id: platformCoreTools.smlAttach,
  type: ToolType.builtin,
  description:
    'Attach assets found by sml_search to the conversation. ' +
    'When the user @-mentions an SML asset, their message contains a link like [@label](sml://ENTRY_ID); call this tool with that ENTRY_ID first so the asset is available as a conversation attachment before other work. ' +
    'Pass one or more entry_id strings exactly as returned by sml_search or taken from those sml:// links. ' +
    'Entry id follows the format: attachment_type:origin_id:uuid and could be referenced by sml://{attachment_type}/{origin_id}. ' +
    'Each entry is resolved into a full conversation attachment (e.g. a Lens visualization). ' +
    'Entries that cannot be resolved return individual errors without failing the entire call.',
  schema: smlAttachSchema,
  tags: ['sml', 'attachment'],
  excludeFromMcp: true,
  annotations: {
    title: 'Attach SML Item',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ entry_ids: entryIds }, context) => {
    const agentBuilderSml = getAgentBuilderSml();
    const { spaceId, savedObjectsClient, request, attachments, esClient, logger } = context;

    const resolvedItems = await agentBuilderSml.resolveSmlAttachItems({
      entryIds,
      esClient,
      request,
      spaceId,
      savedObjectsClient,
      logger,
    });

    const results = await Promise.all(
      resolvedItems.map(async (r) => {
        if (!r.success) {
          return createErrorResult({
            message: r.message,
            metadata: { entry_id: r.entry_id, attachment_type: r.attachment_type },
          });
        }

        const added = await attachments.add(r.attachment, ATTACHMENT_REF_ACTOR.agent);

        return {
          tool_result_id: getToolResultId(),
          type: ToolResultType.other,
          data: {
            success: true,
            attachment_id: added.id,
            attachment_type: r.attachment.type,
            message: `Attachment '${added.id}' of type '${r.attachment.type}' created from SML item '${r.entry_id}'`,
          },
        };
      })
    );

    return { results };
  },
});
