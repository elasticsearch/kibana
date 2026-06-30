/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { PromptsConfigAttributes } from '../../../../lib/significant_events/saved_objects/prompts_config_service';
import { PromptsConfigService } from '../../../../lib/significant_events/saved_objects/prompts_config_service';
import { StatusError } from '../../../../lib/streams/errors/status_error';
import { createServerRoute } from '../../../create_server_route';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';

export const setStreamsPromptRoute = createServerRoute({
  endpoint: 'PUT /internal/streams/_prompts',
  options: {
    access: 'internal',
    summary: 'Set prompts for streams',
    description: 'Set custom prompts for streams features and significant events generation',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    body: z.object({
      featurePromptOverride: z.string().max(50_000).optional(),
      significantEventsPromptOverride: z.string().max(50_000).optional(),
      descriptionPromptOverride: z.string().max(50_000).optional(),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    logger,
  }): Promise<{ results: PromptsConfigAttributes }> => {
    const { soClient } = await getScopedClients({
      request,
    });
    const promptsConfigService = new PromptsConfigService({
      soClient,
      logger,
    });

    if (!Object.values(params.body ?? {}).some((value) => value?.length > 0)) {
      throw new StatusError('At least one prompt template must be provided', 400);
    }
    const results = await promptsConfigService.upsertPrompt(params.body);
    return { results };
  },
});

export const resetStreamsPromptRoute = createServerRoute({
  endpoint: 'DELETE /internal/streams/_prompts',
  options: {
    access: 'internal',
    summary: 'Reset prompts for streams',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({}),
  handler: async ({ request, getScopedClients, logger }): Promise<{ success: boolean }> => {
    const { soClient } = await getScopedClients({
      request,
    });
    const promptsConfigService = new PromptsConfigService({
      soClient,
      logger,
    });

    await promptsConfigService.resetPrompts();
    return { success: true };
  },
});

export const getStreamsPromptRoute = createServerRoute({
  endpoint: 'GET /internal/streams/_prompts',
  options: {
    access: 'internal',
    summary: 'Get prompts for streams',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({}),
  handler: async ({ request, getScopedClients, logger }): Promise<PromptsConfigAttributes> => {
    const { soClient } = await getScopedClients({
      request,
    });
    const promptsConfigService = new PromptsConfigService({
      soClient,
      logger,
    });
    return await promptsConfigService.getPrompt();
  },
});

export const internalPromptsRoutes = {
  ...setStreamsPromptRoute,
  ...getStreamsPromptRoute,
  ...resetStreamsPromptRoute,
};
