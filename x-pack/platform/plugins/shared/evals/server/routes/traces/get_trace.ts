/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EVALS_TRACE_URL,
  API_VERSIONS,
  INTERNAL_API_ACCESS,
  TRACES_INDEX_PATTERN,
  GetTraceRequestParams,
} from '@kbn/evals-common';
import type { TraceSpan } from '@kbn/evals-common';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import { EVALS_API_PRIVILEGES } from '../../../common';
import type { RouteDependencies } from '../register_routes';
import { handleMaximumResponseSizeExceededError } from '../utils/handle_response_size_error';
import { MAX_SPANS_PER_TRACE_SEARCH, computeTraceDurationMs, shapeTraceSpan } from './trace_spans';
import type { TraceSpanSource } from './trace_spans';

export const registerGetTraceRoute = ({ router, logger }: RouteDependencies) => {
  router.versioned
    .get({
      path: EVALS_TRACE_URL,
      access: INTERNAL_API_ACCESS,
      security: {
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      },
      summary: 'Get trace spans',
    })
    .addVersion(
      {
        version: API_VERSIONS.internal.v1,
        validate: {
          request: {
            params: buildRouteValidationWithZod(GetTraceRequestParams),
          },
        },
      },
      async (context, request, response) => {
        try {
          const { traceId } = request.params;
          const coreContext = await context.core;
          const esClient = coreContext.elasticsearch.client.asCurrentUser;

          const searchResponse = await esClient.search<TraceSpanSource>({
            index: TRACES_INDEX_PATTERN,
            query: {
              term: { trace_id: traceId },
            },
            sort: [{ '@timestamp': { order: 'asc' } }],
            size: MAX_SPANS_PER_TRACE_SEARCH,
          });

          const hits = searchResponse.hits?.hits ?? [];
          const spans = hits
            .map((hit) => shapeTraceSpan(hit, traceId))
            .filter((span): span is TraceSpan => span !== null);

          return response.ok({
            body: {
              trace_id: traceId,
              spans,
              total_spans: spans.length,
              duration_ms: computeTraceDurationMs(spans),
            },
          });
        } catch (error) {
          const tooLarge = handleMaximumResponseSizeExceededError({
            error,
            response,
            logger,
            context: 'Get trace',
          });
          if (tooLarge) return tooLarge;

          logger.error(`Failed to get trace: ${error}`);
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to get trace' },
          });
        }
      }
    );
};
