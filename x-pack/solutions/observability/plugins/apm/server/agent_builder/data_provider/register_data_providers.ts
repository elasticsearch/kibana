/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, Logger } from '@kbn/core/server';
import { getRollupIntervalForTimeRange } from '@kbn/apm-data-access-plugin/server/utils';
import type { TraceMetrics } from '@kbn/observability-agent-builder-plugin/server/data_registry/data_registry_types';
import type { APMConfig } from '../..';
import { getErrorSampleDetails } from '../../routes/errors/get_error_groups/get_error_sample_details';
import { parseDatemath } from '../utils/time';
import { getApmServiceSummary } from './get_apm_service_summary';
import { getTraceSampleIds } from '../../routes/service_map/get_trace_sample_ids';
import { fetchExitSpanSamplesFromTraceIds } from '../../routes/service_map/fetch_exit_span_samples';
import { getConnectionStatsItems } from '../../lib/connections/get_connection_stats/get_connection_stats_items';
import { getConnectionStats } from '../../lib/connections/get_connection_stats';
import { getServicesItems } from '../../routes/services/get_services/get_services_items';
import { ApmDocumentType } from '../../../common/document_type';
import { ENVIRONMENT_ALL } from '../../../common/environment_filter_values';
import { getExitSpanChangePoints, getServiceChangePoints } from './get_change_points';
import { buildApmToolResources } from '../utils/build_apm_tool_resources';
import type { APMPluginSetupDependencies, APMPluginStartDependencies } from '../../types';
import { getTransaction } from '../../routes/transactions/get_transaction';
import { getTransactionByName } from '../../routes/transactions/get_transaction_by_name';
import {
  getApmTimeseriesForAttachment,
  getApmMetricsForAttachment,
} from './get_apm_attachment_data';
import { getServiceMapServiceBadges } from '../../routes/service_map/get_service_map_service_badges';

export function registerDataProviders({
  core,
  plugins,
  config,
  logger,
}: {
  core: CoreSetup<APMPluginStartDependencies>;
  plugins: APMPluginSetupDependencies;
  config: APMConfig;
  logger: Logger;
}) {
  const { observabilityAgentBuilder } = plugins;
  if (!observabilityAgentBuilder) {
    return;
  }

  observabilityAgentBuilder.registerDataProvider(
    'apmServiceSummary',
    async ({ request, serviceName, serviceEnvironment, start, end, transactionType }) => {
      const { apmEventClient, apmAlertsClient, mlClient, esClient } = await buildApmToolResources({
        core,
        plugins,
        request,
      });

      return getApmServiceSummary({
        apmEventClient,
        esClient: esClient.asCurrentUser,
        apmAlertsClient,
        mlClient,
        logger,
        arguments: {
          'service.name': serviceName,
          'service.environment': serviceEnvironment,
          start,
          end,
          'transaction.type': transactionType,
        },
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmExitSpanChangePoints',
    async ({ request, serviceName, serviceEnvironment, start, end }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      return getExitSpanChangePoints({
        apmEventClient,
        serviceName,
        serviceEnvironment,
        start,
        end,
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmServiceChangePoints',
    async ({
      request,
      serviceName,
      serviceEnvironment,
      transactionType,
      transactionName,
      start,
      end,
    }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      return getServiceChangePoints({
        apmEventClient,
        serviceName,
        serviceEnvironment,
        transactionType,
        transactionName,
        start,
        end,
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmErrorDetails',
    async ({ request, errorId, serviceName, serviceEnvironment, start, end, kuery = '' }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      return getErrorSampleDetails({
        apmEventClient,
        errorId,
        serviceName,
        start: parseDatemath(start),
        end: parseDatemath(end),
        environment: serviceEnvironment ?? '',
        kuery,
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'servicesItems',
    async ({ request, environment, kuery, start, end, searchQuery }) => {
      const { apmEventClient, randomSamplerSeed, mlClient, apmAlertsClient } =
        await buildApmToolResources({ core, plugins, request });

      const startMs = parseDatemath(start);
      const endMs = parseDatemath(end);

      return getServicesItems({
        apmEventClient,
        apmAlertsClient,
        randomSampler: { seed: randomSamplerSeed, probability: 1 },
        mlClient,
        logger,
        environment: environment ?? ENVIRONMENT_ALL.value,
        kuery: kuery ?? '',
        start: startMs,
        end: endMs,
        serviceGroup: null,
        documentType: ApmDocumentType.TransactionMetric,
        rollupInterval: getRollupIntervalForTimeRange(startMs, endMs),
        useDurationSummary: true, // Note: This will not work for pre 8.7 data. See: https://github.com/elastic/kibana/issues/167578
        searchQuery,
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmTraceSampleIds',
    async ({ request, serviceName, start, end }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      return getTraceSampleIds({
        config,
        apmEventClient,
        serviceName,
        environment: ENVIRONMENT_ALL.value,
        start,
        end,
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmExitSpanSamples',
    async ({ request, traceIds, start, end }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      return fetchExitSpanSamplesFromTraceIds({
        apmEventClient,
        traceIds,
        start,
        end,
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmConnectionStatsItems',
    async ({ request, start, end, filter }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      const items = await getConnectionStatsItems({
        apmEventClient,
        start,
        end,
        filter,
        numBuckets: 1, // not used when withTimeseries: false, but required param
        withTimeseries: false,
      });

      return items.map((item) => ({
        from: { serviceName: item.from.serviceName },
        to: {
          dependencyName: item.to.dependencyName,
          spanType: item.to.spanType,
          spanSubtype: item.to.spanSubtype,
        },
        value: item.value,
      }));
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmConnectionStats',
    async ({ request, start, end, filter }) => {
      const { apmEventClient, randomSamplerSeed } = await buildApmToolResources({
        core,
        plugins,
        request,
      });

      const { statsItems } = await getConnectionStats({
        apmEventClient,
        start,
        end,
        filter,
        collapseBy: 'downstream',

        // getDestinationMap (called by getConnectionStats) computes its own dynamic
        // probability internally. probability: 1 here is only used as a fallback
        // for small datasets (<20M docs) where sampling is unnecessary.
        randomSampler: { seed: randomSamplerSeed, probability: 1 },
        numBuckets: 1, // not used when withTimeseries: false, but required param
        withTimeseries: false,
      });

      return statsItems.map((item) => {
        const { location, stats } = item;
        const metrics: TraceMetrics = {
          latencyUs: stats.latency.value,
          throughputPerMin: stats.throughput.value,
          errorRate: stats.errorRate.value,
        };

        if ('serviceName' in location) {
          return { type: 'service' as const, serviceName: location.serviceName, metrics };
        }

        return {
          type: 'dependency' as const,
          dependencyName: location.dependencyName,
          spanType: location.spanType,
          spanSubtype: location.spanSubtype,
          metrics,
        };
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmTransactionDetails',
    async ({ request, serviceName, transactionName, transactionId, traceId, start, end }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      const startMs = parseDatemath(start);
      const endMs = parseDatemath(end, { roundUp: true });

      if (!startMs || !endMs) {
        throw new Error('Invalid date range provided.');
      }

      let resolvedTransactionId = transactionId;
      let resolvedTraceId = traceId;

      if (!resolvedTransactionId) {
        const redirectInfo = await getTransactionByName({
          transactionName,
          serviceName,
          apmEventClient,
          start: startMs,
          end: endMs,
        });

        resolvedTransactionId = redirectInfo?.transaction?.id;
        resolvedTraceId = redirectInfo?.trace?.id;
      }

      if (!resolvedTransactionId) {
        return {
          transaction: undefined,
          transactionId: resolvedTransactionId,
          traceId: resolvedTraceId,
        };
      }

      const transaction = await getTransaction({
        transactionId: resolvedTransactionId,
        traceId: resolvedTraceId,
        apmEventClient,
        start: startMs,
        end: endMs,
      });

      return {
        transaction,
        transactionId: resolvedTransactionId,
        traceId: resolvedTraceId,
      };
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmTimeseries',
    async ({ request, serviceName, environment, kqlFilter, metric, latencyType, start, end }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      return getApmTimeseriesForAttachment({
        apmEventClient,
        serviceName,
        environment,
        kqlFilter,
        metric,
        latencyType,
        start,
        end,
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'apmMetrics',
    async ({
      request,
      serviceName,
      environment,
      kqlFilter,
      latencyType,
      currentStart,
      currentEnd,
      baselineStart,
      baselineEnd,
    }) => {
      const { apmEventClient } = await buildApmToolResources({ core, plugins, request });

      return getApmMetricsForAttachment({
        apmEventClient,
        serviceName,
        environment,
        kqlFilter,
        latencyType,
        currentStart,
        currentEnd,
        baselineStart,
        baselineEnd,
      });
    }
  );

  observabilityAgentBuilder.registerDataProvider(
    'servicesAlertsAndSlo',
    async ({ request, serviceNames, environment, kuery, start, end }) => {
      const { apmAlertsClient, sloClient } = await buildApmToolResources({
        core,
        plugins,
        request,
      });

      const { alerts, slos } = await getServiceMapServiceBadges({
        serviceNames,
        environment: environment ?? ENVIRONMENT_ALL.value,
        start: parseDatemath(start),
        end: parseDatemath(end),
        kuery,
        apmAlertsClient,
        sloClient,
      });

      // Merge the alert + SLO arrays into a single map keyed by service name,
      // shaped to drop straight into the service-map attachment's `nodeMetadata`.
      const nodeMetadata: Record<
        string,
        { alertsCount?: number; sloStatus?: string; sloCount?: number }
      > = {};
      for (const alert of alerts) {
        nodeMetadata[alert.serviceName] = {
          ...nodeMetadata[alert.serviceName],
          alertsCount: alert.alertsCount,
        };
      }
      for (const slo of slos) {
        nodeMetadata[slo.serviceName] = {
          ...nodeMetadata[slo.serviceName],
          sloStatus: slo.sloStatus,
          sloCount: slo.sloCount,
        };
      }
      return nodeMetadata;
    }
  );
}
