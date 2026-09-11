/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  API_VERSIONS,
  EVALS_EVALUATE_URL,
  EvaluateRequestBody,
  INTERNAL_API_ACCESS,
} from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { EVALS_API_PRIVILEGES } from '../../../common';
import {
  findDuplicateEvaluatorNames,
  getDuplicateEvaluatorNamesMessage,
} from '../../lib/duplicate_evaluator_names';
import type { RouteDependencies } from '../register_routes';
import {
  EvaluationExecutionError,
  executeEvaluators,
  type ResolvedEvaluator,
} from './shared/execute_evaluators';

export const registerEvaluateRoute = ({
  router,
  logger,
  evaluatorRegistry,
  getInferenceStart,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .post({
      path: EVALS_EVALUATE_URL,
      access: INTERNAL_API_ACCESS,
      enableQueryVersion: true,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
      },
      summary: 'Evaluate trace with one or more evaluators',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            body: buildRouteValidationWithZod(EvaluateRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const { subject, evaluators } = request.body;
        const duplicateEvaluatorNames = findDuplicateEvaluatorNames(evaluators);
        if (duplicateEvaluatorNames.length > 0) {
          return response.badRequest({
            body: { message: getDuplicateEvaluatorNamesMessage(duplicateEvaluatorNames) },
          });
        }

        const spaceId = getSpaceId ? await getSpaceId(request) : DEFAULT_SPACE_ID;
        const scopedRegistry = evaluatorRegistry.asScoped({ spaceId });
        const resolvedEvaluators: ResolvedEvaluator[] = [];

        for (const config of evaluators) {
          const definition = await scopedRegistry.get(config.name, config.version);
          if (!definition) {
            const message = config.version
              ? `Evaluator not found: ${config.name}@${config.version}`
              : `Evaluator not found: ${config.name}`;
            return response.badRequest({ body: { message } });
          }
          resolvedEvaluators.push({ definition, connectorId: config.connector_id });
        }

        const coreContext = await context.core;
        try {
          const results = await executeEvaluators({
            coreContext,
            request,
            subject,
            evaluators: resolvedEvaluators,
            logger,
            getInferenceStart,
          });

          return response.ok({ body: { results } });
        } catch (error) {
          if (error instanceof EvaluationExecutionError) {
            return response[error.responseType]({ body: { message: error.message } });
          }
          throw error;
        }
      }
    );
};
