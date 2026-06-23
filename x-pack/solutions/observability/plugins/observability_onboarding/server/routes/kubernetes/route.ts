/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import * as t from 'io-ts';
import Boom from '@hapi/boom';
import { termQuery } from '@kbn/observability-plugin/server';
import type { estypes } from '@elastic/elasticsearch';
import {
  isNoShardsAvailableError,
  throwHasDataSearchError,
} from '../../lib/handle_has_data_search_error';
import { checkPreExistingData } from '../../lib/check_pre_existing_data';
import { resolveProbe } from './resolve_has_data_probes';
import type { ElasticAgentVersionInfo } from '../../../common/types';
import { getFallbackESUrl } from '../../lib/get_fallback_urls';
import { createObservabilityOnboardingServerRoute } from '../create_observability_onboarding_server_route';
import { hasLogMonitoringPrivileges } from '../../lib/api_key/has_log_monitoring_privileges';
import { hasFleetIntegrationPrivileges } from '../../lib/api_key/has_fleet_integration_privileges';
import { createShipperApiKey } from '../../lib/api_key/create_shipper_api_key';
import { getAgentVersionInfo } from '../../lib/get_agent_version';
import { createManagedOtlpServiceApiKey } from '../../lib/api_key/create_managed_otlp_service_api_key';
import { getManagedOtlpServiceUrl } from '../../lib/get_managed_otlp_service_url';
import { IS_MANAGED_OTLP_SERVICE_ENABLED } from '../../../common/feature_flags';

export interface CreateKubernetesOnboardingFlowRouteResponse {
  apiKeyEncoded: string;
  onboardingId: string;
  elasticsearchUrl: string;
  elasticAgentVersionInfo: ElasticAgentVersionInfo;
  managedOtlpServiceUrl: string;
}

export interface HasKubernetesDataRouteResponse {
  hasData: boolean;
  hasLogs?: boolean;
  hasMetrics?: boolean;
  hasPreExistingData?: boolean;
}

const createKubernetesOnboardingFlowRoute = createObservabilityOnboardingServerRoute({
  endpoint: 'POST /internal/observability_onboarding/kubernetes/flow',
  params: t.type({
    body: t.type({ pkgName: t.union([t.literal('kubernetes'), t.literal('kubernetes_otel')]) }),
  }),
  security: {
    authz: {
      enabled: false,
      reason:
        'Authorization is checked by custom logic using Elasticsearch client and by the Package Service client',
    },
  },
  async handler(resources): Promise<CreateKubernetesOnboardingFlowRouteResponse> {
    const { context, request, plugins, services, kibanaVersion, config, params } = resources;
    const {
      elasticsearch: { client },
      featureFlags,
    } = await context.core;

    const hasPrivileges = await hasLogMonitoringPrivileges(client.asCurrentUser, true);

    if (!hasPrivileges) {
      throw Boom.forbidden(
        "You don't have enough privileges to start a new onboarding flow. Contact your system administrator to grant you the required privileges."
      );
    }

    const fleetPluginStart = await plugins.fleet.start();

    // Check Fleet integration privileges before attempting to install packages
    const hasFleetPrivileges = await hasFleetIntegrationPrivileges(request, fleetPluginStart);

    if (!hasFleetPrivileges) {
      throw Boom.forbidden(
        "You don't have adequate permissions to install Fleet packages. Contact your system administrator to grant you the required 'Integrations All' privilege."
      );
    }

    const packageClient = fleetPluginStart.packageService.asScoped(request);
    const managedOtlpServiceUrl = getManagedOtlpServiceUrl(plugins);
    const isManagedOtlpServiceAvailable =
      config.serverless.enabled ||
      ((await featureFlags.getBooleanValue(IS_MANAGED_OTLP_SERVICE_ENABLED, false)) &&
        Boolean(managedOtlpServiceUrl));

    const apiKeyPromise =
      params.body.pkgName === 'kubernetes'
        ? createShipperApiKey(client.asCurrentUser, 'kubernetes_onboarding', true)
        : isManagedOtlpServiceAvailable
        ? createManagedOtlpServiceApiKey(client.asCurrentUser, `ingest-otel-k8s`)
        : createShipperApiKey(client.asCurrentUser, 'otel-kubernetes', true);

    const [{ encoded: apiKeyEncoded }, elasticAgentVersionInfo] = await Promise.all([
      apiKeyPromise,
      getAgentVersionInfo(fleetPluginStart, kibanaVersion),
      // System package is always required
      packageClient.ensureInstalledPackage({ pkgName: 'system' }),
      // The EA flow uses this package directly; EDOT stack values also reference its assets.
      packageClient.ensureInstalledPackage({ pkgName: 'kubernetes' }),
      params.body.pkgName === 'kubernetes_otel'
        ? packageClient.ensureInstalledPackage({ pkgName: 'kubernetes_otel' })
        : undefined,
    ]);

    const elasticsearchUrlList = plugins.cloud?.setup?.elasticsearchUrl
      ? [plugins.cloud?.setup?.elasticsearchUrl]
      : await getFallbackESUrl(services.esLegacyConfigService);

    return {
      onboardingId: uuidv4(),
      apiKeyEncoded,
      elasticsearchUrl: elasticsearchUrlList.length > 0 ? elasticsearchUrlList[0] : '',
      elasticAgentVersionInfo,
      managedOtlpServiceUrl: getManagedOtlpServiceUrl(plugins),
    };
  },
});

const hasKubernetesDataRoute = createObservabilityOnboardingServerRoute({
  endpoint: 'GET /internal/observability_onboarding/kubernetes/{onboardingId}/has-data',
  params: t.type({
    path: t.type({
      onboardingId: t.string,
    }),
    query: t.partial({
      start: t.string,
    }),
  }),
  security: {
    authz: {
      enabled: false,
      reason: 'Authorization is checked by Elasticsearch',
    },
  },
  async handler(resources): Promise<HasKubernetesDataRouteResponse> {
    const { onboardingId } = resources.params.path;
    const { start } = resources.params.query;
    const { elasticsearch } = await resources.context.core;

    try {
      const commonSearchParams = {
        ignore_unavailable: true,
        allow_partial_search_results: true,
        size: 0 as const,
        terminate_after: 1,
      };

      // Classic data streams: use indexed onboarding ID fields (fast inverted-index lookups).
      const indexedQuery: estypes.QueryDslQueryContainer = {
        bool: {
          filter: [
            {
              bool: {
                should: [
                  ...termQuery('fields.onboarding_id', onboardingId),
                  ...termQuery('resource.attributes.onboarding.id', onboardingId),
                  ...termQuery('labels.onboarding_id', onboardingId),
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      };

      const wiredStreamIndices = ['logs.otel*', 'logs.ecs*', 'metrics.otel*', 'metrics.ecs*'];

      // Check if data was already flowing into wired stream indices before
      // the user started onboarding. If so, time-range detection on those
      // indices would produce false positives, so we skip it.
      const hasPreExistingData = start
        ? await checkPreExistingData(elasticsearch.client.asCurrentUser, wiredStreamIndices, start)
        : false;

      // Wired streams (logs.otel*, logs.ecs*) use passthrough mapping where
      // onboarding.id is not indexed, so we cannot filter by it without a
      // runtime mapping (which times out on large clusters). Instead, fall
      // back to a time-range-only query when a start time is provided and
      // no pre-existing data would cause false positives.
      const wiredStreamQuery: estypes.QueryDslQueryContainer | undefined =
        start && !hasPreExistingData
          ? { bool: { filter: [{ range: { '@timestamp': { gte: start } } }] } }
          : undefined;

      const searches: Array<Promise<estypes.SearchResponse>> = [
        elasticsearch.client.asCurrentUser.search({
          index: ['logs-*'],
          ...commonSearchParams,
          query: indexedQuery,
        }),
        elasticsearch.client.asCurrentUser.search({
          index: ['metrics-*'],
          ...commonSearchParams,
          query: indexedQuery,
        }),
      ];

      if (wiredStreamQuery) {
        searches.push(
          elasticsearch.client.asCurrentUser.search({
            index: ['logs.otel*', 'logs.ecs*'],
            ...commonSearchParams,
            query: wiredStreamQuery,
          }),
          elasticsearch.client.asCurrentUser.search({
            index: ['metrics.otel*', 'metrics.ecs*'],
            ...commonSearchParams,
            query: wiredStreamQuery,
          })
        );
      }

      const results = await Promise.allSettled(searches);
      const [logsResult, metricsResult, wiredLogsResult, wiredMetricsResult] = results;

      const hasLogs =
        resolveProbe(logsResult) || (wiredLogsResult ? resolveProbe(wiredLogsResult) : false);
      const hasMetrics =
        resolveProbe(metricsResult) ||
        (wiredMetricsResult ? resolveProbe(wiredMetricsResult) : false);

      return {
        hasData: hasLogs || hasMetrics,
        hasLogs,
        hasMetrics,
        hasPreExistingData: hasPreExistingData || undefined,
      };
    } catch (error) {
      if (isNoShardsAvailableError(error)) {
        return {
          hasData: false,
          hasLogs: false,
          hasMetrics: false,
        };
      }

      throwHasDataSearchError(error);
    }
  },
});

export const kubernetesOnboardingRouteRepository = {
  ...createKubernetesOnboardingFlowRoute,
  ...hasKubernetesDataRoute,
};
