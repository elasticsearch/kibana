/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EVALS_EXPERIMENT_TRACES_URL,
  API_VERSIONS,
  INTERNAL_API_ACCESS,
  TRACES_INDEX_PATTERN,
  buildExperimentFilterQuery,
  buildExperimentTracesAggregation,
  parseExperimentTracesAggregation,
  GetEvaluationExperimentTracesRequestParams,
  GetEvaluationExperimentTracesRequestQuery,
} from '@kbn/evals-common';
import type { GetEvaluationExperimentTracesResponse, TraceSpan } from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { EVALS_API_PRIVILEGES } from '../../../common';
import type { RouteDependencies } from '../register_routes';
import { handleMaximumResponseSizeExceededError } from '../utils/handle_response_size_error';
import {
  MAX_SPANS_PER_TRACE_SEARCH,
  computeTraceDurationMs,
  shapeTraceSpan,
} from '../traces/trace_spans';
import type { TraceSpanSource } from '../traces/trace_spans';

export const registerGetExperimentTracesRoute = ({
  router,
  logger,
  getSpaceId,
}: RouteDependencies) => {
  router.versioned
    .get({
      path: EVALS_EXPERIMENT_TRACES_URL,
      access: INTERNAL_API_ACCESS,
      enableQueryVersion: true,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      },
      summary: 'Get evaluation experiment traces',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetEvaluationExperimentTracesRequestParams),
            query: buildRouteValidationWithZod(GetEvaluationExperimentTracesRequestQuery),
          },
        },
      },
      async (context, request, response) => {
        try {
          const { experimentId } = request.params;
          const { role, evaluator, page, per_page: perPage } = request.query;

          if (evaluator !== undefined && role !== 'evaluator') {
            return response.badRequest({
              body: { message: 'The evaluator filter is only valid together with role=evaluator' },
            });
          }

          const evalsContext = await context.evals;
          const coreContext = await context.core;
          const esClient = coreContext.elasticsearch.client.asCurrentUser;
          const spaceId = getSpaceId ? await getSpaceId(request) : DEFAULT_SPACE_ID;

          // Trace ids are always resolved through the experiment's score
          // documents; traces-* is never searched on experiment attributes.
          const query = buildExperimentFilterQuery(experimentId, {
            evaluatorName: evaluator,
            spaceId,
          });

          const aggregationResponse = await evalsContext.evaluationScoreService.search({
            query,
            size: 0,
            aggs: buildExperimentTracesAggregation(role),
          });

          const totalHits = aggregationResponse.hits?.total;
          const matchedScores = typeof totalHits === 'number' ? totalHits : totalHits?.value ?? 0;
          if (matchedScores === 0) {
            const message = evaluator
              ? `Experiment not found for evaluator ${evaluator}: ${experimentId}`
              : `Experiment not found for experiment: ${experimentId}`;
            return response.notFound({ body: { message } });
          }

          const { total, traces: traceReferences } = parseExperimentTracesAggregation(
            aggregationResponse.aggregations as Record<string, unknown> | undefined,
            { page, perPage }
          );

          const emptyBody: GetEvaluationExperimentTracesResponse = {
            experiment_id: experimentId,
            traces: [],
            total,
            page,
            per_page: perPage,
          };
          if (traceReferences.length === 0) {
            return response.ok({ body: emptyBody });
          }

          const spanResponse = await esClient.msearch<TraceSpanSource>({
            index: TRACES_INDEX_PATTERN,
            searches: traceReferences.flatMap((reference) => [
              {},
              {
                query: { term: { trace_id: reference.trace_id } },
                sort: [{ '@timestamp': { order: 'asc' } }],
                size: MAX_SPANS_PER_TRACE_SEARCH,
              },
            ]),
          });

          const body: GetEvaluationExperimentTracesResponse = {
            ...emptyBody,
            traces: traceReferences.map((reference, index) => {
              const item = spanResponse.responses[index];
              if (item === undefined || 'error' in item) {
                const reason =
                  item !== undefined && 'error' in item
                    ? item.error?.reason ?? item.error?.type ?? 'unknown error'
                    : 'missing msearch response item';
                logger.warn(`Span search failed for trace ${reference.trace_id}: ${reason}`);
                return { ...reference, spans: [], total_spans: 0, duration_ms: 0 };
              }
              // A trace whose spans aged out of traces-* keeps its reference with
              // empty spans, so callers can tell an expired trace from a run that
              // was never traced (which has no reference at all).
              const spans = (item.hits?.hits ?? [])
                .map((hit) => shapeTraceSpan(hit, reference.trace_id))
                .filter((span): span is TraceSpan => span !== null);
              return {
                ...reference,
                spans,
                total_spans: spans.length,
                duration_ms: computeTraceDurationMs(spans),
              };
            }),
          };

          return response.ok({ body });
        } catch (error) {
          const tooLarge = handleMaximumResponseSizeExceededError({
            error,
            response,
            logger,
            context: 'Get evaluation experiment traces',
          });
          if (tooLarge) return tooLarge;

          logger.error(`Failed to get evaluation experiment traces: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to get evaluation experiment traces' },
          });
        }
      }
    );
};
