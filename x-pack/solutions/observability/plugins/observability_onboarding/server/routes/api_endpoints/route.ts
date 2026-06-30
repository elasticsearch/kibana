/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import Boom from '@hapi/boom';
import type { ElasticsearchClient } from '@kbn/core/server';
import { createObservabilityOnboardingServerRoute } from '../create_observability_onboarding_server_route';
import { getFallbackESUrl } from '../../lib/get_fallback_urls';
import { getManagedOtlpServiceUrl } from '../../lib/get_managed_otlp_service_url';
import {
  resolveApiKeyFactory,
  type ApiKeyFactoryContext,
} from '../../lib/api_key/resolve_api_key_factory';
import { hasLogMonitoringPrivileges } from '../../lib/api_key/has_log_monitoring_privileges';
import { hasApiKeyPrivileges } from '../../lib/api_key/has_api_key_privileges';
import {
  APM_EVENT_WRITE_APPLICATION,
  INDEX_OTLP_LOGS_METRICS_AND_TRACES,
  INDEX_PROMETHEUS_REMOTE_WRITE,
} from '../../lib/api_key/privileges';
import { ApiEndpointId } from '../../../common/api_endpoints';
import {
  IS_MANAGED_OTLP_SERVICE_ENABLED,
  IS_MANAGED_OTLP_SERVICE_PRW_ENDPOINT_ENABLED,
} from '../../../common/feature_flags';

export interface ApiEndpointsRouteResponse {
  elasticsearchUrl: string;
  managedOtlpServiceUrl: string;
}

export interface ApiEndpointApiKeyResponse {
  encodedApiKey: string;
}

function hasRequiredPrivileges(
  id: ApiEndpointId,
  {
    isManagedOtlpServiceAvailable,
    isServerless,
    managedOtlpPrwEndpointEnabled,
  }: ApiKeyFactoryContext,
  esClient: ElasticsearchClient
): Promise<boolean> {
  switch (id) {
    case ApiEndpointId.OpenTelemetry:
      return isManagedOtlpServiceAvailable
        ? hasApiKeyPrivileges(esClient, { application: [APM_EVENT_WRITE_APPLICATION] })
        : hasApiKeyPrivileges(esClient, { index: [INDEX_OTLP_LOGS_METRICS_AND_TRACES] });
    case ApiEndpointId.Prometheus:
      return isServerless || managedOtlpPrwEndpointEnabled
        ? hasApiKeyPrivileges(esClient, { application: [APM_EVENT_WRITE_APPLICATION] })
        : hasApiKeyPrivileges(esClient, { index: [INDEX_PROMETHEUS_REMOTE_WRITE] });
    case ApiEndpointId.Elasticsearch:
      return hasLogMonitoringPrivileges(esClient, true);
  }
}

const apiEndpointsRoute = createObservabilityOnboardingServerRoute({
  endpoint: 'GET /internal/observability_onboarding/api_endpoints',
  security: {
    authz: {
      enabled: false,
      reason:
        'This route only returns deployment-level configuration URLs (Elasticsearch and managed OTLP service) that are already exposed by other onboarding routes',
    },
  },
  async handler(resources): Promise<ApiEndpointsRouteResponse> {
    const { plugins, services } = resources;

    const elasticsearchUrlList = plugins.cloud?.setup?.elasticsearchUrl
      ? [plugins.cloud.setup.elasticsearchUrl]
      : await getFallbackESUrl(services.esLegacyConfigService);

    return {
      elasticsearchUrl: elasticsearchUrlList.length > 0 ? elasticsearchUrlList[0] : '',
      managedOtlpServiceUrl: getManagedOtlpServiceUrl(plugins),
    };
  },
});

const createApiKeyRoute = createObservabilityOnboardingServerRoute({
  endpoint: 'POST /internal/observability_onboarding/api_endpoints/create_key/{id}',
  security: {
    authz: {
      enabled: false,
      reason: 'Authorization is checked by custom logic using the Elasticsearch client',
    },
  },
  params: t.type({
    path: t.type({
      id: t.keyof({
        [ApiEndpointId.Prometheus]: null,
        [ApiEndpointId.OpenTelemetry]: null,
        [ApiEndpointId.Elasticsearch]: null,
      }),
    }),
  }),
  async handler(resources): Promise<ApiEndpointApiKeyResponse> {
    const {
      context,
      config,
      plugins,
      params: {
        path: { id },
      },
    } = resources;
    const {
      elasticsearch: { client },
      featureFlags,
    } = await context.core;

    const isServerless = config.serverless.enabled;
    const managedOtlpServiceUrl = getManagedOtlpServiceUrl(plugins);
    const isManagedOtlpServiceAvailable =
      isServerless ||
      ((await featureFlags.getBooleanValue(IS_MANAGED_OTLP_SERVICE_ENABLED, false)) &&
        Boolean(managedOtlpServiceUrl));
    const managedOtlpPrwEndpointEnabled =
      (await featureFlags.getBooleanValue(IS_MANAGED_OTLP_SERVICE_PRW_ENDPOINT_ENABLED, false)) &&
      Boolean(managedOtlpServiceUrl);

    const apiKeyFactoryContext: ApiKeyFactoryContext = {
      isManagedOtlpServiceAvailable,
      isServerless,
      managedOtlpPrwEndpointEnabled,
    };

    const hasPrivileges = await hasRequiredPrivileges(
      id,
      apiKeyFactoryContext,
      client.asCurrentUser
    );
    if (!hasPrivileges) {
      throw Boom.forbidden(
        "You don't have enough privileges to create an API key. Contact your system administrator to grant you the required privileges."
      );
    }

    const createApiKey = resolveApiKeyFactory(id, apiKeyFactoryContext);
    const { encoded } = await createApiKey(client.asCurrentUser, `onboarding-${id}-api`);

    return { encodedApiKey: encoded };
  },
});

export const apiEndpointsRouteRepository = {
  ...apiEndpointsRoute,
  ...createApiKeyRoute,
};
