/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { createAttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { ATTACHMENT_REF_ACTOR } from '@kbn/agent-builder-common/attachments';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import type { RouteDependencies } from '../types';
import { getHandlerWrapper } from '../wrap_handler';
import { internalApiPath } from '../../../common/constants';
import {
  SML_HTTP_ATTACH_ITEMS_MAX,
  type SmlAttachHttpResponse,
  type SmlAttachHttpResultItem,
} from '../../../common/http_api/sml';
import { AGENT_BUILDER_WRITE_SECURITY } from '../route_security';

export function registerInternalSmlRoutes({
  router,
  getInternalServices,
  logger,
  coreSetup,
}: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

  router.post(
    {
      path: `${internalApiPath}/sml/_attach`,
      validate: {
        body: schema.object({
          conversation_id: schema.string(),
          entry_ids: schema.arrayOf(schema.string(), {
            minSize: 1,
            maxSize: SML_HTTP_ATTACH_ITEMS_MAX,
          }),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_WRITE_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const { conversations: conversationsService, attachments: attachmentsService } =
        getInternalServices();
      const { conversation_id: conversationId, entry_ids: entryIds } = request.body;
      const [coreStart, startDeps] = await coreSetup.getStartServices();
      const agentBuilderSml = startDeps.agentBuilderSml;
      const spaceId = (await ctx.agentBuilder).spaces.getSpaceId();
      const coreContext = await ctx.core;
      const esClient = coreContext.elasticsearch.client;
      const savedObjectsClient = coreStart.savedObjects.getScopedClient(request);
      const isExperimental = await coreContext.uiSettings.client.get<boolean>(
        AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID
      );
      const conversationClient = await conversationsService.getScopedClient({ request });

      const conversationForAttach = await conversationClient.get(conversationId);
      if (conversationForAttach.rounds.length === 0) {
        return response.badRequest({
          body: {
            message: `Conversation '${conversationId}' has no rounds — cannot attach SML items without an existing round`,
          },
        });
      }

      const resolvedItems = await agentBuilderSml.resolveSmlAttachItems({
        entryIds,
        esClient,
        request,
        spaceId,
        savedObjectsClient,
        logger,
      });

      const stateManager = createAttachmentStateManager(conversationForAttach.attachments ?? [], {
        getTypeDefinition: attachmentsService.getTypeDefinition,
      });

      // Format the results for the HTTP API
      const resultItems = await Promise.all(
        resolvedItems.map(async (r): Promise<SmlAttachHttpResultItem> => {
          if (!r.success) {
            return {
              success: false,
              entry_id: r.entry_id,
              attachment_type: r.attachment_type,
              message: r.message,
            };
          }

          if (!isExperimental && r.attachment.type !== 'connector') {
            return {
              success: false,
              entry_id: r.entry_id,
              attachment_type: r.attachment.type,
              message: `Attaching '${r.attachment.type}' items requires Agent Builder experimental features to be enabled`,
            };
          }

          try {
            const added = await stateManager.add(r.attachment, ATTACHMENT_REF_ACTOR.system, {
              request,
              spaceId,
              savedObjectsClient,
            });

            return {
              success: true,
              entry_id: r.entry_id,
              conversation_attachment_id: added.id,
              attachment_type: r.attachment.type,
              message: `Attachment '${added.id}' of type '${r.attachment.type}' created from SML item '${r.entry_id}'`,
            };
          } catch (e) {
            return {
              success: false,
              entry_id: r.entry_id,
              attachment_type: r.attachment.type,
              message: e instanceof Error ? e.message : String(e),
            };
          }
        })
      );

      if (resultItems.some((r) => r.success)) {
        await conversationClient.addAttachmentsToLastRound({
          id: conversationId,
          refs: stateManager.getAccessedRefs(),
          attachments: {
            snapshot: conversationForAttach.attachments ?? [],
            produced: stateManager.getAll(),
          },
        });
      }

      const body: SmlAttachHttpResponse = { results: resultItems };

      return response.ok({ body });
    })
  );
}
