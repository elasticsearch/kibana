/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EVALS_EXPERIMENT_URL,
  API_VERSIONS,
  INTERNAL_API_ACCESS,
  buildExperimentFilterQuery,
  buildStatsAggregation,
  parseStatsAggregationResponse,
  buildEvaluatorModelsAggregation,
  parseEvaluatorModelsAggregation,
  buildExperimentEvaluatorsAggregation,
  parseExperimentEvaluatorsAggregation,
  buildModelDisplayId,
  GetEvaluationExperimentRequestParams,
  GetEvaluationExperimentRequestQuery,
} from '@kbn/evals-common';
import type { Model, ScoreMetadata } from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { EVALS_API_PRIVILEGES } from '../../../common';
import type { RouteDependencies } from '../register_routes';

interface EvalDocSource {
  '@timestamp'?: string;
  experiment_name?: string;
  task?: { model?: Partial<Model> };
  metadata?: Partial<ScoreMetadata>;
}

export const registerGetExperimentRoute = ({ router, logger, getSpaceId }: RouteDependencies) => {
  router.versioned
    .get({
      path: EVALS_EXPERIMENT_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      },
      summary: 'Get evaluation experiment detail',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetEvaluationExperimentRequestParams),
            query: buildRouteValidationWithZod(GetEvaluationExperimentRequestQuery),
          },
        },
      },
      async (context, request, response) => {
        try {
          const { experimentId } = request.params;
          const { suite_id: suiteId, model_id: modelId, execution_id: executionId } = request.query;
          const evalsContext = await context.evals;
          const spaceId = getSpaceId ? await getSpaceId(request) : DEFAULT_SPACE_ID;

          const filterId = executionId ?? experimentId;
          const filterField = executionId ? 'metadata.execution_id' : 'experiment_id';
          const query = buildExperimentFilterQuery(filterId, {
            suiteId,
            modelId,
            filterField,
            spaceId,
          });

          const metadataResponse = await evalsContext.evaluationScoreService.search({
            query,
            size: 1,
          });

          const firstHit = metadataResponse.hits?.hits[0];
          const firstDoc = firstHit?._source as EvalDocSource | undefined;
          if (!firstDoc) {
            return response.notFound({
              body: { message: `Experiment not found: ${experimentId}` },
            });
          }

          const aggResponse = await evalsContext.evaluationScoreService.search({
            size: 0,
            query,
            aggs: {
              ...buildStatsAggregation(),
              evaluator_models: buildEvaluatorModelsAggregation(),
              evaluators: buildExperimentEvaluatorsAggregation(),
              first_score: { min: { field: '@timestamp' } },
              last_score: { max: { field: '@timestamp' } },
            },
          });

          const aggregations = aggResponse.aggregations as
            | (Record<string, unknown> & {
                first_score?: { value_as_string?: string };
                last_score?: { value_as_string?: string };
              })
            | undefined;
          const stats = parseStatsAggregationResponse(aggregations);
          const evaluators = parseExperimentEvaluatorsAggregation(aggregations);
          // Every distinct judge, most scores first; empty when only code evaluators ran. Derived
          // from the same aggregation as the listing so both agree on the predominant judge,
          // unlike `firstDoc`, which reflects whichever judge the unsorted search happens to hit.
          const evaluatorModels = parseEvaluatorModelsAggregation(aggregations);

          const toModelDisplay = (model?: { id?: string; family?: string; provider?: string }) => {
            if (!model) return undefined;
            return {
              id: buildModelDisplayId(model.id, model.family, model.provider),
              family: model.family,
              provider: model.provider,
            };
          };

          return response.ok({
            body: {
              experiment_id: experimentId,
              experiment_name: firstDoc.experiment_name ?? null,
              execution_id: firstDoc.metadata?.execution_id,
              suite_id: firstDoc.metadata?.suite_id ?? null,
              timestamp: firstDoc['@timestamp'],
              task_model: toModelDisplay(firstDoc.task?.model),
              evaluator_model: evaluatorModels[0],
              evaluator_models: evaluatorModels,
              git_branch: firstDoc.metadata?.git?.branch ?? null,
              git_commit_sha: firstDoc.metadata?.git?.commit_sha ?? null,
              ci: firstDoc.metadata?.ci,
              hostname: firstDoc.metadata?.hostname,
              first_score_at: aggregations?.first_score?.value_as_string,
              last_score_at: aggregations?.last_score?.value_as_string,
              total_repetitions: firstDoc.metadata?.total_repetitions ?? 1,
              evaluators,
              stats,
            },
          });
        } catch (error) {
          logger.error(`Failed to get evaluation experiment: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to get evaluation experiment' },
          });
        }
      }
    );
};
