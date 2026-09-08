/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  routeDefinitions,
  type RootTransactionByTraceIdResponse,
  type SpanFromTraceByIdResponse,
  type TopTracesPrimaryStatsResponse,
  type TransactionByIdResponse,
  type TransactionByNameResponse,
  type TransactionFromTraceByIdResponse,
  type UnifiedTracesByIdResponse,
  type UnifiedTracesByIdSummaryResponse,
  type UnifiedTraceSpanResponse,
  type UnifiedTracesRootSpanResponse,
} from '@kbn/apm-api-shared';
import type { ErrorsByTraceId } from '@kbn/apm-types';
import {
  DURATION,
  SPAN_DURATION,
  SPAN_ID,
  TRANSACTION_DURATION,
} from '../../../common/es_fields/apm';
import { asMutableArray } from '../../../common/utils/as_mutable_array';
import { createLogsClient } from '../../lib/helpers/create_es_client/create_logs_client';
import { getApmEventClient } from '../../lib/helpers/get_apm_event_client';
import { getRandomSampler } from '../../lib/helpers/get_random_sampler';
import { parseOtelDuration } from '../../lib/helpers/parse_otel_duration';
import { getSearchTransactionsEvents } from '../../lib/helpers/transactions';
import { createApmServerRoute } from '../apm_routes/create_apm_server_route';
import { getSpan } from '../transactions/get_span';
import { getTransaction } from '../transactions/get_transaction';
import { getTransactionByName } from '../transactions/get_transaction_by_name';
import { getRootTransactionByTraceId } from '../transactions/get_transaction_by_trace';
import { buildFocusedTraceItems, findRootItem } from './build_focused_trace_items';
import { getTopTracesPrimaryStats } from './get_top_traces_primary_stats';
import { getTraceSummaryCount } from './get_trace_summary_count';
import { getUnifiedTraceErrors } from './get_unified_trace_errors';
import { getUnifiedTraceItems } from './get_unified_trace_items';
import { getUnifiedTraceSpan } from './get_unified_trace_span';

const tracesRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.traces.endpoint,
  params: routeDefinitions.traces.traces.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<TopTracesPrimaryStatsResponse> => {
    const { config, params, request, core } = resources;

    const { environment, kuery, start, end, probability } = params.query;

    const coreStart = await core.start();
    const [apmEventClient, randomSampler] = await Promise.all([
      getApmEventClient(resources),
      getRandomSampler({ coreStart, request, probability }),
    ]);

    const searchAggregatedTransactions = await getSearchTransactionsEvents({
      apmEventClient,
      config,
      kuery,
      start,
      end,
    });

    return await getTopTracesPrimaryStats({
      environment,
      kuery,
      apmEventClient,
      searchAggregatedTransactions,
      start,
      end,
      randomSampler,
    });
  },
});

const unifiedTracesByIdRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.unifiedTracesById.endpoint,
  params: routeDefinitions.traces.unifiedTracesById.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<UnifiedTracesByIdResponse> => {
    const [apmEventClient, logsClient] = await Promise.all([
      getApmEventClient(resources),
      createLogsClient(resources),
    ]);

    const { params, config } = resources;
    const { traceId } = params.path;
    const { start, end, serviceName, entryTransactionId, ecsOnly } = params.query;
    const maxTraceItems = config.ui.maxTraceItems;

    const [{ traceItems, agentMarks, unifiedTraceErrors, traceDocsTotal }, entryTransaction] =
      await Promise.all([
        getUnifiedTraceItems({
          apmEventClient,
          logsClient,
          traceId,
          start,
          end,
          maxTraceItems,
          serviceName,
          ecsOnly: ecsOnly ?? false,
          focusedDocId: entryTransactionId,
        }),
        entryTransactionId
          ? getTransaction({
              transactionId: entryTransactionId,
              traceId,
              apmEventClient,
              start,
              end,
            })
          : Promise.resolve(undefined),
      ]);

    return {
      traceItems,
      // For now we, we only return apm errors to show as marks in the waterfall
      errors: unifiedTraceErrors.apmErrors,
      agentMarks,
      entryTransaction,
      traceDocsTotal,
      maxTraceItems,
    };
  },
});

const unifiedTracesByIdSummaryRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.unifiedTracesByIdSummary.endpoint,
  params: routeDefinitions.traces.unifiedTracesByIdSummary.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<UnifiedTracesByIdSummaryResponse> => {
    const [apmEventClient, logsClient] = await Promise.all([
      getApmEventClient(resources),
      createLogsClient(resources),
    ]);

    const { params, config } = resources;
    const { traceId } = params.path;
    const { start, end, docId } = params.query;

    const maxTraceItems = params.query.maxTraceItems ?? config.ui.maxTraceItems;

    const [{ traceItems, unifiedTraceErrors }, traceSummaryCount] = await Promise.all([
      getUnifiedTraceItems({
        apmEventClient,
        logsClient,
        traceId,
        start,
        end,
        maxTraceItems,
        focusedDocId: docId,
      }),
      getTraceSummaryCount({ apmEventClient, start, end, traceId }),
    ]);

    const focusedDocId = docId ?? findRootItem(traceItems)?.id;
    const focusedTraceItems = focusedDocId
      ? buildFocusedTraceItems({ traceItems, docId: focusedDocId })
      : undefined;

    return {
      traceItems: focusedTraceItems,
      summary: { ...traceSummaryCount, errors: unifiedTraceErrors.totalErrors },
    };
  },
});

const unifiedTracesByIdErrorsRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.unifiedTracesByIdErrors.endpoint,
  params: routeDefinitions.traces.unifiedTracesByIdErrors.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<ErrorsByTraceId> => {
    const [apmEventClient, logsClient] = await Promise.all([
      getApmEventClient(resources),
      createLogsClient(resources),
    ]);

    const { params } = resources;
    const { traceId } = params.path;
    const { start, end, docId } = params.query;

    const { apmErrors, unprocessedOtelErrors } = await getUnifiedTraceErrors({
      apmEventClient,
      logsClient,
      docId,
      traceId,
      start,
      end,
    });

    if (apmErrors.length > 0) {
      return { traceErrors: apmErrors, source: 'apm' };
    }

    return { traceErrors: unprocessedOtelErrors, source: 'unprocessedOtel' };
  },
});

const rootTransactionByTraceIdRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.rootTransactionByTraceId.endpoint,
  params: routeDefinitions.traces.rootTransactionByTraceId.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<RootTransactionByTraceIdResponse> => {
    const {
      params: {
        path: { traceId },
        query: { start, end },
      },
    } = resources;

    const apmEventClient = await getApmEventClient(resources);

    return getRootTransactionByTraceId({ traceId, apmEventClient, start, end });
  },
});

const rootItemByTraceIdRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.unifiedTracesRootSpan.endpoint,
  params: routeDefinitions.traces.unifiedTracesRootSpan.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<UnifiedTracesRootSpanResponse | undefined> => {
    const {
      params: {
        path: { traceId },
        query: { start, end },
      },
    } = resources;

    const apmEventClient = await getApmEventClient(resources);
    const optionalFields = asMutableArray([
      TRANSACTION_DURATION,
      SPAN_DURATION,
      DURATION,
      SPAN_ID,
    ] as const);

    const span = await getUnifiedTraceSpan({
      traceId,
      apmEventClient,
      start,
      end,
      fields: optionalFields,
    });

    if (!span) {
      return undefined;
    }

    const apmDuration = span.transaction?.duration?.us ?? span.span?.duration?.us;
    const otelDuration = span.duration;

    const duration = apmDuration ?? parseOtelDuration(otelDuration);

    if (duration === undefined) {
      return undefined;
    }

    return {
      duration,
    };
  },
});

const transactionByIdRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.transactionById.endpoint,
  params: routeDefinitions.traces.transactionById.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<TransactionByIdResponse> => {
    const {
      params: {
        path: { transactionId },
        query: { start, end },
      },
    } = resources;

    const apmEventClient = await getApmEventClient(resources);
    return {
      transaction: await getTransaction({
        transactionId,
        apmEventClient,
        start,
        end,
      }),
    };
  },
});

const transactionByNameRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.transactionByName.endpoint,
  params: routeDefinitions.traces.transactionByName.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<TransactionByNameResponse> => {
    const {
      params: {
        query: { start, end, transactionName, serviceName, environment },
      },
    } = resources;

    const apmEventClient = await getApmEventClient(resources);
    return {
      transaction: await getTransactionByName({
        transactionName,
        apmEventClient,
        start,
        end,
        serviceName,
        environment,
      }),
    };
  },
});

const transactionFromTraceByIdRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.transactionFromTraceById.endpoint,
  params: routeDefinitions.traces.transactionFromTraceById.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<TransactionFromTraceByIdResponse | undefined> => {
    const { params } = resources;
    const {
      path: { transactionId, traceId },
      query: { start, end },
    } = params;

    const apmEventClient = await getApmEventClient(resources);
    return await getTransaction({
      transactionId,
      traceId,
      apmEventClient,
      start,
      end,
    });
  },
});

const spanFromTraceByIdRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.spanFromTraceById.endpoint,
  params: routeDefinitions.traces.spanFromTraceById.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<SpanFromTraceByIdResponse> => {
    const { params } = resources;
    const {
      path: { spanId, traceId },
      query: { start, end, parentTransactionId },
    } = params;

    const apmEventClient = await getApmEventClient(resources);
    return await getSpan({
      spanId,
      parentTransactionId,
      traceId,
      apmEventClient,
      start,
      end,
    });
  },
});

const unifiedTraceSpanRoute = createApmServerRoute({
  endpoint: routeDefinitions.traces.unifiedTraceSpan.endpoint,
  params: routeDefinitions.traces.unifiedTraceSpan.params,
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<UnifiedTraceSpanResponse | undefined> => {
    const {
      params: {
        path: { traceId, spanId },
        query: { start, end },
      },
    } = resources;

    const apmEventClient = await getApmEventClient(resources);

    return getUnifiedTraceSpan({ spanId, traceId, apmEventClient, start, end });
  },
});

export const traceRouteRepository = {
  ...unifiedTracesByIdRoute,
  ...tracesRoute,
  ...rootTransactionByTraceIdRoute,
  ...rootItemByTraceIdRoute,
  ...transactionByIdRoute,
  ...transactionFromTraceByIdRoute,
  ...spanFromTraceByIdRoute,
  ...transactionByNameRoute,
  ...unifiedTracesByIdSummaryRoute,
  ...unifiedTracesByIdErrorsRoute,
  ...unifiedTraceSpanRoute,
};
