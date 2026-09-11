/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EVALS_EXPERIMENT_RUNS_URL,
  API_VERSIONS,
  INTERNAL_API_ACCESS,
  MAX_SCORES_PER_QUERY,
  buildExperimentFilterQuery,
  buildExperimentRunsAggregation,
  parseExperimentRunsAggregation,
  buildExperimentRunsFetchQuery,
  GetEvaluationExperimentRunsRequestParams,
  GetEvaluationExperimentRunsRequestQuery,
} from '@kbn/evals-common';
import type {
  EvaluationScoreDocument,
  ExperimentRun,
  ExperimentRunKey,
  GetEvaluationExperimentRunsResponse,
} from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { EVALS_API_PRIVILEGES } from '../../../common';
import type { RouteDependencies } from '../register_routes';
import { handleMaximumResponseSizeExceededError } from '../utils/handle_response_size_error';

const isScoreDocument = (source: unknown): source is EvaluationScoreDocument => {
  if (source === null || typeof source !== 'object') {
    return false;
  }
  const maybeScore = source as { example?: { id?: unknown }; task?: unknown; evaluator?: unknown };
  return (
    typeof maybeScore.example?.id === 'string' &&
    maybeScore.task != null &&
    maybeScore.evaluator != null
  );
};

const runKeyOf = ({
  dataset_id: datasetId,
  example_id: exampleId,
  repetition_index: repetition,
}: {
  dataset_id: string;
  example_id: string;
  repetition_index: number;
}): string => `${datasetId}|${exampleId}|${repetition}`;

/**
 * A model is never attributed to a `code` evaluator, which invokes none;
 * stray models on legacy documents are dropped rather than reported.
 */
const toEvaluatorResult = (
  evaluator: EvaluationScoreDocument['evaluator']
): ExperimentRun['evaluators'][number] => {
  if (evaluator.kind === 'code') {
    const { model, ...rest } = evaluator;
    return rest;
  }
  return evaluator;
};

/**
 * Groups the fetched score documents under their run keys, in page order.
 * The example and task sections are shared by every document of a run (one
 * task execution, scored by each evaluator), so they are read from the first.
 */
const groupDocumentsIntoRuns = (
  runKeys: ExperimentRunKey[],
  documents: EvaluationScoreDocument[]
): ExperimentRun[] => {
  const documentsByRun = new Map<string, EvaluationScoreDocument[]>();
  for (const document of documents) {
    const key = runKeyOf({
      dataset_id: document.example.dataset.id,
      example_id: document.example.id,
      repetition_index: document.task.repetition_index,
    });
    const group = documentsByRun.get(key);
    if (group) {
      group.push(document);
    } else {
      documentsByRun.set(key, [document]);
    }
  }

  return runKeys.flatMap((runKey) => {
    const group = documentsByRun.get(runKeyOf(runKey));
    // Drop any run whose document count is below the aggregation's score_count:
    // this means the ES fetch was capped and the run is incomplete. Returning
    // partial evaluator lists without a signal would silently mislead callers.
    if (!group || group.length === 0 || group.length < runKey.score_count) {
      return [];
    }
    const [first] = group;
    return [
      {
        example: first.example,
        task: first.task,
        evaluators: group.map((document) => toEvaluatorResult(document.evaluator)),
      },
    ];
  });
};

export const registerGetExperimentRunsRoute = ({
  router,
  logger,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .get({
      path: EVALS_EXPERIMENT_RUNS_URL,
      access: INTERNAL_API_ACCESS,
      enableQueryVersion: true,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      },
      summary: 'Get evaluation experiment runs',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetEvaluationExperimentRunsRequestParams),
            query: buildRouteValidationWithZod(GetEvaluationExperimentRunsRequestQuery),
          },
        },
      },
      async (context, request, response) => {
        try {
          const { experimentId } = request.params;
          const { suite_id: suiteId, model_id: modelId, page, per_page: perPage } = request.query;
          const evalsContext = await context.evals;
          const spaceId = getSpaceId ? await getSpaceId(request) : DEFAULT_SPACE_ID;

          const query = buildExperimentFilterQuery(experimentId, {
            suiteId,
            modelId,
            spaceId,
          });

          const aggregationResponse = await evalsContext.evaluationScoreService.search({
            query,
            size: 0,
            aggs: buildExperimentRunsAggregation(),
          });

          const { total, runs: runKeys } = parseExperimentRunsAggregation(
            aggregationResponse.aggregations as Record<string, unknown> | undefined,
            { page, perPage }
          );

          if (total === 0) {
            return response.notFound({
              body: { message: `Experiment not found for experiment: ${experimentId}` },
            });
          }

          const emptyBody: GetEvaluationExperimentRunsResponse = {
            experiment_id: experimentId,
            runs: [],
            total,
            page,
            per_page: perPage,
          };
          if (runKeys.length === 0) {
            return response.ok({ body: emptyBody });
          }

          // Exactly the page's documents, one per evaluator result of each run.
          const pageDocumentCount = Math.min(
            runKeys.reduce((sum, run) => sum + run.score_count, 0),
            MAX_SCORES_PER_QUERY
          );
          const searchResponse = await evalsContext.evaluationScoreService.search({
            query: buildExperimentRunsFetchQuery(query, runKeys),
            sort: [{ 'evaluator.name': { order: 'asc' } }],
            size: pageDocumentCount,
          });

          const documents = (searchResponse.hits?.hits ?? [])
            .map((hit) => hit._source)
            .filter(isScoreDocument);

          const body: GetEvaluationExperimentRunsResponse = {
            ...emptyBody,
            runs: groupDocumentsIntoRuns(runKeys, documents),
          };

          return response.ok({ body });
        } catch (error) {
          const tooLarge = handleMaximumResponseSizeExceededError({
            error,
            response,
            logger,
            context: 'Get evaluation experiment runs',
          });
          if (tooLarge) return tooLarge;

          logger.error(`Failed to get evaluation experiment runs: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to get evaluation experiment runs' },
          });
        }
      }
    );
};
