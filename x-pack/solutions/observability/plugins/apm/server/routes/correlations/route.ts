/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import Boom from '@hapi/boom';

import { i18n } from '@kbn/i18n';
import { toBooleanRt, toNumberRt } from '@kbn/io-ts-utils';

import { termQuery } from '@kbn/observability-plugin/server';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import { SPAN_DESTINATION_SERVICE_RESOURCE } from '@kbn/apm-types';
import { isActivePlatinumLicense } from '../../../common/license_check';
import { ENVIRONMENT_ALL_VALUE } from '../../../common/environment_filter_values';
import { createApmServerRoute } from '../apm_routes/create_apm_server_route';
import { environmentRt, kueryRt, rangeRt } from '../default_api_types';
import type { DurationFieldCandidatesResponse } from './queries/fetch_duration_field_candidates';
import { fetchDurationFieldCandidates } from './queries/fetch_duration_field_candidates';
import { SERVICE_NAME, TRANSACTION_NAME, TRANSACTION_TYPE } from '../../../common/es_fields/apm';
import { fetchFieldValueFieldStats } from './queries/field_stats/fetch_field_value_field_stats';
import type { FieldValuePairsResponse } from './queries/fetch_field_value_pairs';
import { fetchFieldValuePairs } from './queries/fetch_field_value_pairs';
import type { SignificantCorrelationsResponse } from './queries/fetch_significant_correlations';
import { fetchSignificantCorrelations } from './queries/fetch_significant_correlations';
import type { PValuesResponse } from './queries/fetch_p_values';
import { fetchPValues } from './queries/fetch_p_values';
import { getApmEventClient } from '../../lib/helpers/get_apm_event_client';
import type { TopValuesStats } from '../../../common/correlations/field_stats_types';
import type { CorrelationsResponse } from '../../../common/correlations/types';
import { fetchCorrelations } from './queries/fetch_correlations';

const INVALID_LICENSE = i18n.translate('xpack.apm.correlations.license.text', {
  defaultMessage:
    'To use the correlations API, you must be subscribed to an Elastic Platinum license.',
});

const fieldCandidatesTransactionsRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/correlations/field_candidates/transactions',
  params: t.type({
    query: t.intersection([
      t.partial({
        serviceName: t.string,
        transactionName: t.string,
        transactionType: t.string,
      }),
      environmentRt,
      kueryRt,
      rangeRt,
    ]),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<DurationFieldCandidatesResponse> => {
    const { context } = resources;
    const { license } = await context.licensing;
    if (!isActivePlatinumLicense(license)) {
      throw Boom.forbidden(INVALID_LICENSE);
    }

    const apmEventClient = await getApmEventClient(resources);

    const {
      query: { serviceName, transactionName, transactionType, start, end, environment, kuery },
    } = resources.params;

    return fetchDurationFieldCandidates({
      eventType: ProcessorEvent.transaction,
      start,
      end,
      environment,
      kuery,
      query: {
        bool: {
          filter: [
            ...termQuery(SERVICE_NAME, serviceName),
            ...termQuery(TRANSACTION_TYPE, transactionType),
            ...termQuery(TRANSACTION_NAME, transactionName),
          ],
        },
      },
      apmEventClient,
    });
  },
});

const fieldValueStatsTransactionsRoute = createApmServerRoute({
  endpoint: 'GET /internal/apm/correlations/field_value_stats/transactions',
  params: t.type({
    query: t.intersection([
      t.partial({
        serviceName: t.string,
        transactionName: t.string,
        transactionType: t.string,
        samplerShardSize: t.string,
      }),
      environmentRt,
      kueryRt,
      rangeRt,
      t.type({
        fieldName: t.string,
        fieldValue: t.union([t.string, t.number]),
      }),
    ]),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<TopValuesStats> => {
    const { context } = resources;
    const { license } = await context.licensing;
    if (!isActivePlatinumLicense(license)) {
      throw Boom.forbidden(INVALID_LICENSE);
    }

    const apmEventClient = await getApmEventClient(resources);

    const {
      query: {
        serviceName,
        transactionName,
        transactionType,
        start,
        end,
        environment,
        kuery,
        fieldName,
        fieldValue,
        samplerShardSize: samplerShardSizeStr,
      },
    } = resources.params;

    const samplerShardSize = samplerShardSizeStr ? parseInt(samplerShardSizeStr, 10) : undefined;
    return fetchFieldValueFieldStats({
      apmEventClient,
      eventType: ProcessorEvent.transaction,
      start,
      end,
      environment,
      kuery,
      query: {
        bool: {
          filter: [
            ...termQuery(SERVICE_NAME, serviceName),
            ...termQuery(TRANSACTION_TYPE, transactionType),
            ...termQuery(TRANSACTION_NAME, transactionName),
          ],
        },
      },
      field: {
        fieldName,
        fieldValue,
      },
      samplerShardSize,
    });
  },
});

const fieldValuePairsTransactionsRoute = createApmServerRoute({
  endpoint: 'POST /internal/apm/correlations/field_value_pairs/transactions',
  params: t.type({
    body: t.intersection([
      t.partial({
        serviceName: t.string,
        transactionName: t.string,
        transactionType: t.string,
      }),
      environmentRt,
      kueryRt,
      rangeRt,
      t.type({
        fieldCandidates: t.array(t.string),
      }),
    ]),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<FieldValuePairsResponse> => {
    const { context } = resources;
    const { license } = await context.licensing;
    if (!isActivePlatinumLicense(license)) {
      throw Boom.forbidden(INVALID_LICENSE);
    }

    const apmEventClient = await getApmEventClient(resources);

    const {
      body: {
        serviceName,
        transactionName,
        transactionType,
        start,
        end,
        environment,
        kuery,
        fieldCandidates,
      },
    } = resources.params;

    return fetchFieldValuePairs({
      apmEventClient,
      eventType: ProcessorEvent.transaction,
      start,
      end,
      environment,
      kuery,
      query: {
        bool: {
          filter: [
            ...termQuery(SERVICE_NAME, serviceName),
            ...termQuery(TRANSACTION_TYPE, transactionType),
            ...termQuery(TRANSACTION_NAME, transactionName),
          ],
        },
      },
      fieldCandidates,
    });
  },
});

const significantCorrelationsTransactionsRoute = createApmServerRoute({
  endpoint: 'POST /internal/apm/correlations/significant_correlations/transactions',
  params: t.type({
    body: t.intersection([
      t.partial({
        serviceName: t.string,
        transactionName: t.string,
        transactionType: t.string,
        durationMin: toNumberRt,
        durationMax: toNumberRt,
      }),
      environmentRt,
      kueryRt,
      rangeRt,
      t.type({
        fieldValuePairs: t.array(
          t.type({
            fieldName: t.string,
            fieldValue: t.union([t.string, toNumberRt]),
          })
        ),
      }),
    ]),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<SignificantCorrelationsResponse> => {
    const apmEventClient = await getApmEventClient(resources);
    const {
      body: {
        serviceName,
        transactionName,
        transactionType,
        start,
        end,
        environment,
        kuery,
        durationMin,
        durationMax,
        fieldValuePairs,
      },
    } = resources.params;

    return fetchSignificantCorrelations({
      apmEventClient,
      start,
      end,
      environment,
      kuery,
      query: {
        bool: {
          filter: [
            ...termQuery(SERVICE_NAME, serviceName),
            ...termQuery(TRANSACTION_TYPE, transactionType),
            ...termQuery(TRANSACTION_NAME, transactionName),
          ],
        },
      },
      durationMinOverride: durationMin,
      durationMaxOverride: durationMax,
      fieldValuePairs,
      entityType: 'transaction',
    });
  },
});

const pValuesTransactionsRoute = createApmServerRoute({
  endpoint: 'POST /internal/apm/correlations/p_values/transactions',
  params: t.type({
    body: t.intersection([
      t.partial({
        serviceName: t.string,
        transactionName: t.string,
        transactionType: t.string,
        durationMin: toNumberRt,
        durationMax: toNumberRt,
      }),
      environmentRt,
      kueryRt,
      rangeRt,
      t.type({
        fieldCandidates: t.array(t.string),
      }),
    ]),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<PValuesResponse> => {
    const apmEventClient = await getApmEventClient(resources);

    const {
      body: {
        serviceName,
        transactionName,
        transactionType,
        start,
        end,
        environment,
        kuery,
        durationMin,
        durationMax,
        fieldCandidates,
      },
    } = resources.params;

    return fetchPValues({
      apmEventClient,
      start,
      end,
      environment,
      kuery,
      query: {
        bool: {
          filter: [
            ...termQuery(SERVICE_NAME, serviceName),
            ...termQuery(TRANSACTION_TYPE, transactionType),
            ...termQuery(TRANSACTION_NAME, transactionName),
          ],
        },
      },
      durationMin,
      durationMax,
      fieldCandidates,
      entityType: 'transaction',
    });
  },
});

const entityTypeRt = t.union([t.literal('transaction'), t.literal('exit_span')]);

const metricRt = t.union([
  t.literal('latency'),
  t.literal('failure_rate'),
  t.literal('throughput'),
  t.literal('infra_metrics'),
]);

/**
 * Unified correlations API
 *
 * To run exit span latency correlations, call:
 *
 *  - `POST /internal/apm/correlations`
 *  - with `entityType` set to `'exit_span'`
 *  - and `metric` set to `'latency'`
 *
 * Example request body:
 *
 * {
 *   "entityType": "exit_span",
 *   "metric": "latency",
 *   "start": "<from>",
 *   "end": "<to>",
 *   "kuery": "<optional KQL>",
 *   "percentileThreshold": 95,
 * }
 *
 * When `scope` is omitted, the API defaults to transaction-based correlations.
 */
const unifiedCorrelationsRoute = createApmServerRoute({
  endpoint: 'POST /internal/apm/correlations',
  params: t.type({
    body: t.intersection([
      t.type({
        entityType: entityTypeRt,
        metric: metricRt,
      }),
      t.partial({
        serviceName: t.string,
        transactionName: t.string,
        transactionType: t.string,
        fieldCandidates: t.array(t.string),
        durationMin: toNumberRt,
        durationMax: toNumberRt,
        percentileThreshold: toNumberRt,
        includeHistogram: toBooleanRt,
        kuery: t.string,
      }),
      t.partial(environmentRt.props),
      rangeRt,
    ]),
  }),
  security: { authz: { requiredPrivileges: ['apm'] } },
  handler: async (resources): Promise<CorrelationsResponse> => {
    const { context } = resources;
    const { license } = await context.licensing;
    if (!isActivePlatinumLicense(license)) {
      throw Boom.forbidden(INVALID_LICENSE);
    }

    const apmEventClient = await getApmEventClient(resources);

    const {
      body: {
        entityType,
        metric,
        start,
        end,
        kuery = '',
        serviceName,
        transactionName,
        transactionType,
        fieldCandidates,
        durationMin,
        durationMax,
        percentileThreshold,
        includeHistogram = false,
        environment = ENVIRONMENT_ALL_VALUE,
      },
    } = resources.params;

    const scope: 'transactions' | 'exitSpans' =
      entityType === 'exit_span' ? 'exitSpans' : 'transactions';

    const scopeFilter =
      scope === 'exitSpans' ? [{ exists: { field: SPAN_DESTINATION_SERVICE_RESOURCE } }] : [];

    const query = {
      bool: {
        filter: [
          ...scopeFilter,
          ...termQuery(SERVICE_NAME, serviceName),
          ...termQuery(TRANSACTION_TYPE, transactionType),
          ...termQuery(TRANSACTION_NAME, transactionName),
        ] as object[],
      },
    };

    return fetchCorrelations({
      apmEventClient,
      metric,
      scope,
      start,
      end,
      environment,
      kuery,
      query,
      fieldCandidates,
      percentileThreshold,
      durationMin,
      durationMax,
      includeHistogram,
    });
  },
});

export const correlationsRouteRepository = {
  ...fieldCandidatesTransactionsRoute,
  ...fieldValueStatsTransactionsRoute,
  ...fieldValuePairsTransactionsRoute,
  ...significantCorrelationsTransactionsRoute,
  ...pValuesTransactionsRoute,
  ...unifiedCorrelationsRoute,
};
