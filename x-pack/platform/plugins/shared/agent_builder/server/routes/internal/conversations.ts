/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { RouteDependencies } from '../types';
import { getHandlerWrapper } from '../wrap_handler';
import type {
  MarkReadConversationResponse,
  RenameConversationResponse,
} from '../../../common/http_api/conversations';
import { apiPrivileges } from '../../../common/features';
import { internalApiPath } from '../../../common/constants';

export function registerInternalConversationRoutes({
  router,
  getInternalServices,
  logger,
}: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

  // rename conversation
  router.post(
    {
      path: `${internalApiPath}/conversations/{conversation_id}/_rename`,
      validate: {
        params: schema.object({
          conversation_id: schema.string(),
        }),
        body: schema.object({
          title: schema.string(),
        }),
      },
      options: { access: 'internal' },
      security: {
        authz: { requiredPrivileges: [apiPrivileges.readAgentBuilder] },
      },
    },
    wrapHandler(async (ctx, request, response) => {
      const { conversations: conversationsService } = getInternalServices();
      const { conversation_id: conversationId } = request.params;
      const { title } = request.body;

      const client = await conversationsService.getScopedClient({ request });
      const updatedConversation = await client.update({
        id: conversationId,
        title,
      });

      return response.ok<RenameConversationResponse>({
        body: {
          id: updatedConversation.id,
          title: updatedConversation.title,
        },
      });
    })
  );

  router.post(
    {
      path: `${internalApiPath}/conversations/{conversation_id}/_mark_read`,
      validate: {
        params: schema.object({
          conversation_id: schema.string({ maxLength: 256 }),
        }),
        body: schema.object({
          read: schema.boolean(),
        }),
      },
      options: { access: 'internal' },
      security: {
        authz: { requiredPrivileges: [apiPrivileges.readAgentBuilder] },
      },
    },
    wrapHandler(async (ctx, request, response) => {
      const { conversations: conversationsService } = getInternalServices();
      const { conversation_id: conversationId } = request.params;
      const { read } = request.body;

      const client = await conversationsService.getScopedClient({ request });
      const updatedConversation = await client.update(
        {
          id: conversationId,
          read,
        },
        { access: 'converse' }
      );

      return response.ok<MarkReadConversationResponse>({
        body: {
          id: updatedConversation.id,
          read: updatedConversation.read!,
        },
      });
    })
  );
}
