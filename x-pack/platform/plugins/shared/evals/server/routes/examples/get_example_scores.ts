/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EVALS_EXAMPLE_SCORES_URL,
  API_VERSIONS,
  INTERNAL_API_ACCESS,
  MAX_SCORES_PER_QUERY,
  buildExampleScoresQuery,
  SCORES_SORT_ORDER,
  GetExampleScoresRequestParams,
  GetExampleScoresRequestQuery,
  type EvaluationScoreDocument,
} from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { EVALS_API_PRIVILEGES } from '../../../common';
import type { RouteDependencies } from '../register_routes';
import { handleMaximumResponseSizeExceededError } from '../utils/handle_response_size_error';
import { UNBOUNDED_SCORE_FIELDS } from '../utils/score_source_fields';

const EXAMPLE_SCORES_SORT_ORDER = [
  { '@timestamp': { order: 'desc' as const } },
  ...SCORES_SORT_ORDER,
];

export const registerGetExampleScoresRoute = ({
  router,
  logger,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .get({
      path: EVALS_EXAMPLE_SCORES_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      },
      summary: 'Get example scores',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetExampleScoresRequestParams),
            query: buildRouteValidationWithZod(GetExampleScoresRequestQuery),
          },
        },
      },
      async (context, request, response) => {
        try {
          const { exampleId } = request.params;
          const {
            dataset_id: datasetId,
            execution_id: executionId,
            model_id: modelId,
          } = request.query;
          const evalsContext = await context.evals;
          const spaceId = getSpaceId ? await getSpaceId(request) : DEFAULT_SPACE_ID;

          const searchResponse = await evalsContext.evaluationScoreService.search({
            query: buildExampleScoresQuery(exampleId, {
              spaceId,
              datasetId,
              executionId,
              modelId,
            }),
            sort: EXAMPLE_SCORES_SORT_ORDER,
            size: MAX_SCORES_PER_QUERY,
            _source_excludes: UNBOUNDED_SCORE_FIELDS,
          });

          const hits = searchResponse.hits?.hits ?? [];
          const scores = hits
            .map((hit) => hit._source)
            .filter((source): source is EvaluationScoreDocument => source !== undefined);

          return response.ok({
            body: { scores, total: scores.length },
          });
        } catch (error) {
          const tooLarge = handleMaximumResponseSizeExceededError({
            error,
            response,
            logger,
            context: 'Get example scores',
          });
          if (tooLarge) return tooLarge;

          logger.error(`Failed to get example scores: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to get example scores' },
          });
        }
      }
    );
};
