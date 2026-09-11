/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  API_VERSIONS,
  EVALS_TEST_EVALUATOR_URL,
  INTERNAL_API_ACCESS,
  TestEvaluatorRequestBody,
  type TestEvaluatorResponse,
} from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { EVALS_API_PRIVILEGES } from '../../../common';
import { compileUserDefinedEvaluator } from '../../evaluators/user_defined/compile';
import {
  InvalidJudgeConfigError,
  validateJudgeConfig,
} from '../../evaluators/user_defined/validate_config';
import type { RouteDependencies } from '../register_routes';
import { builtInEvaluatorConflict } from './shared/handle_evaluator_error';
import { EvaluationExecutionError, executeEvaluators } from './shared/execute_evaluators';

export const registerTestEvaluatorRoute = ({
  router,
  logger,
  evaluatorRegistry,
  getInferenceStart,
}: RouteDependencies) => {
  router.versioned
    .post({
      path: EVALS_TEST_EVALUATOR_URL,
      access: INTERNAL_API_ACCESS,
      enableQueryVersion: true,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
      },
      summary: 'Test an unsaved evaluator',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            body: buildRouteValidationWithZod(TestEvaluatorRequestBody),
          },
        },
      },
      async (context, request, response) => {
        const { definition: draft, connector_id: connectorId, subject } = request.body;

        if (evaluatorRegistry.isBuiltIn(draft.name)) {
          return builtInEvaluatorConflict(response, draft.name);
        }

        try {
          validateJudgeConfig(draft.judge);
        } catch (error) {
          if (error instanceof InvalidJudgeConfigError) {
            return response.badRequest({ body: { message: error.message } });
          }
          throw error;
        }

        const evaluator = compileUserDefinedEvaluator({
          id: 'draft',
          ...draft,
          version: 'draft',
          kind: 'llm',
          created_at: '',
          updated_at: '',
        });

        try {
          const coreContext = await context.core;
          const [result] = await executeEvaluators({
            coreContext,
            request,
            subject,
            evaluators: [{ definition: evaluator, connectorId }],
            logger,
            getInferenceStart,
          });
          const testResult: TestEvaluatorResponse['result'] = {
            ...result,
            evaluator: {
              name: result.evaluator.name,
              kind: 'llm',
              direction: evaluator.direction,
              ...(result.evaluator.model ? { model: result.evaluator.model } : {}),
            },
          };

          return response.ok({ body: { result: testResult } });
        } catch (error) {
          if (error instanceof EvaluationExecutionError) {
            return response[error.responseType]({ body: { message: error.message } });
          }
          throw error;
        }
      }
    );
};
