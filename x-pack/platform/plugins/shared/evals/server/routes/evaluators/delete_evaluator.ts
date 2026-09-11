/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  API_VERSIONS,
  DeleteEvaluatorRequestParams,
  DeleteEvaluatorRequestQuery,
  EVALS_EVALUATOR_URL,
  INTERNAL_API_ACCESS,
} from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { EVALS_API_PRIVILEGES } from '../../../common';
import { EvaluatorNotFoundError } from '../../storage/evaluators/evaluator_not_found_error';
import type { RouteDependencies } from '../register_routes';
import { builtInEvaluatorConflict, handleEvaluatorError } from './shared/handle_evaluator_error';

export const registerDeleteEvaluatorRoute = ({
  router,
  logger,
  getSpaceId,
  evaluatorRegistry,
}: RouteDependencies) => {
  router.versioned
    .delete({
      path: EVALS_EVALUATOR_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
      },
      summary: 'Delete evaluator',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(DeleteEvaluatorRequestParams),
            query: buildRouteValidationWithZod(DeleteEvaluatorRequestQuery),
          },
        },
      },
      async (context, request, response) => {
        const { name } = request.params;
        const { version } = request.query;

        if (evaluatorRegistry.isBuiltIn(name)) {
          return builtInEvaluatorConflict(response, name);
        }

        try {
          const spaceId = getSpaceId ? await getSpaceId(request) : DEFAULT_SPACE_ID;
          const { evaluatorDefinitionService } = await context.evals;

          const { deleted } = await evaluatorDefinitionService
            .getClient({ spaceId })
            .delete(name, { version });

          if (deleted === 0) {
            throw new EvaluatorNotFoundError(name, version);
          }

          return response.ok({ body: { success: true, deleted } });
        } catch (error) {
          return handleEvaluatorError({
            error,
            response,
            logger,
            fallbackMessage: 'Failed to delete evaluator',
          });
        }
      }
    );
};
