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
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';
import type { SmlToolsOptions } from './types';

const smlAttachSchema = z.object({
  chunk_ids: z
    .array(z.string())
    .min(1)
    .max(50)
    .describe(
      'One or more chunk_id values exactly as returned by sml_search, or the path after sml:// in a user @-mention link.'
    ),
});

/**
 * Creates the sml_attach tool.
 * Converts SML search results into conversation attachments.
 */
export const createSmlAttachTool = ({
  getAgentContextLayer,
}: SmlToolsOptions): BuiltinToolDefinition<typeof smlAttachSchema> => ({
  id: platformCoreTools.smlAttach,
  type: ToolType.builtin,
  description:
    'Attach assets found by sml_search to the conversation. ' +
    'When the user @-mentions an SML asset, their message contains a link like [@label](sml://CHUNK_ID); call this tool with that CHUNK_ID first so the asset is available as a conversation attachment before other work. ' +
    'Pass one or more chunk_id strings exactly as returned by sml_search or taken from those sml:// links. ' +
    'Chunk id follows the format: attachment_type:origin_id:uuid and could be referenced by sml://{attachment_type}/{origin_id}. ' +
    'Each chunk is resolved into a full conversation attachment (e.g. a Lens visualization). ' +
    'Chunks that cannot be resolved return individual errors without failing the entire call.',
  schema: smlAttachSchema,
  tags: ['sml', 'attachment'],
  availability: {
    cacheMode: 'global',
    // SML lives inside Agent Builder, so it requires the Agent Builder experimental
    // flag in addition to the dedicated Context Engine flag. Both must be enabled.
    handler: async ({ uiSettings }) => {
      const [experimentalEnabled, contextEngineEnabled] = await Promise.all([
        uiSettings.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID),
        uiSettings.get<boolean>(CONTEXT_ENGINE_ENABLED_SETTING_ID),
      ]);
      return experimentalEnabled && contextEngineEnabled
        ? { status: 'available' }
        : {
            status: 'unavailable',
            reason:
              'SML features require Agent Builder experimental features and the Context Engine to be enabled',
          };
    },
  },
  handler: async ({ chunk_ids: chunkIds }, context) => {
    const agentContextLayer = getAgentContextLayer();
    const { spaceId, savedObjectsClient, request, attachments, esClient, logger } = context;

    const resolvedItems = await agentContextLayer.resolveSmlAttachItems({
      chunkIds,
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
            metadata: { chunk_id: r.chunk_id, attachment_type: r.attachment_type },
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
            message: `Attachment '${added.id}' of type '${r.attachment.type}' created from SML item '${r.chunk_id}'`,
          },
        };
      })
    );

    return { results };
  },
});
