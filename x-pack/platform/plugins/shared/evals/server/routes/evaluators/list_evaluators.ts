/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { API_VERSIONS, EVALS_EVALUATORS_URL, INTERNAL_API_ACCESS } from '@kbn/evals-common';
import { EVALS_API_PRIVILEGES } from '../../../common';
import type { RouteDependencies } from '../register_routes';

export const registerListEvaluatorsRoute = ({
  router,
  logger,
  evaluatorRegistry,
}: RouteDependencies) => {
  router.versioned
    .get({
      path: EVALS_EVALUATORS_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      },
      summary: 'List evaluator definitions',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: false,
      },
      async (_context, _request, response) => {
        if (!evaluatorRegistry) {
          logger.error('Evaluator registry is not configured');
          return response.customError({
            statusCode: 500,
            body: { message: 'Evaluator registry is not configured' },
          });
        }

        const evaluators = evaluatorRegistry.list().map((evaluator) => ({
          name: evaluator.name,
          version: evaluator.version,
          kind: evaluator.kind,
          description: evaluator.description,
          supported_inputs: evaluator.supportedInputs,
        }));

        return response.ok({
          body: {
            evaluators,
          },
        });
      }
    );
};
