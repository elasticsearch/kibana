/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';

import { SavedObjectsErrorHelpers } from '@kbn/core/server';

import type { ExternalRouteDeps } from '.';
import { API_VERSIONS } from '../../../../common';
import { wrapError } from '../../../lib/errors';
import { seedAgentChatExperienceForSolutionSpace } from '../../../lib/seed_agent_chat_experience_for_solution_space';
import { getSpaceSchema } from '../../../lib/space_schema';
import { createLicensedRouteHandler } from '../../lib';

export function initPostSpacesApi(deps: ExternalRouteDeps) {
  const { router, log, getSpacesService, getStartServices, isServerless, packageInfo } = deps;

  router.versioned
    .post({
      path: '/api/spaces/space',
      access: 'public',
      summary: `Create a space`,
      description: 'Create a new Kibana space.',
      options: {
        tags: ['oas-tag:spaces'],
      },
      security: {
        authz: {
          enabled: false,
          reason:
            'This route delegates authorization to the spaces service via a scoped spaces client',
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            body: getSpaceSchema(isServerless),
          },
          response: {
            200: {
              description: 'Indicates a successful call.',
              body: () => getSpaceSchema(isServerless),
            },
          },
        },
      },
      createLicensedRouteHandler(async (context, request, response) => {
        const spacesClient = getSpacesService().createSpacesClient(request);
        const space = request.body;
        try {
          const createdSpace = await spacesClient.create(space);

          const [coreStart] = await getStartServices();

          if (!isServerless && packageInfo) {
            await seedAgentChatExperienceForSolutionSpace({
              coreStart,
              log,
              spaceId: createdSpace.id,
              solution: createdSpace.solution,
              packageInfo,
            });
          }

          try {
            const { agentBuilderPlatform } = await coreStart.plugins.onStart<{
              agentBuilderPlatform: {
                tracingFeatures: {
                  sync: (options: { enabled: boolean; spaceId?: string }) => Promise<void>;
                };
              };
            }>('agentBuilderPlatform');

            if (agentBuilderPlatform.found) {
              await agentBuilderPlatform.contract.tracingFeatures.sync({
                enabled: true,
                spaceId: createdSpace.id,
              });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn(
              `Failed to sync Agent Builder tracing features for space "${createdSpace.id}": ${errorMessage}`
            );
          }

          return response.ok({ body: createdSpace });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isConflictError(error)) {
            const { body } = wrapError(
              Boom.conflict(`A space with the identifier ${space.id} already exists.`)
            );
            return response.conflict({ body });
          }
          return response.customError(wrapError(error));
        }
      })
    );
}
