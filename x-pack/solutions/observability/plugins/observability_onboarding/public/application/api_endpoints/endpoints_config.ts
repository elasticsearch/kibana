/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import { i18n } from '@kbn/i18n';
import { ApiEndpointId } from '../../../common/api_endpoints';
import type { SupportedLogo } from '../shared/logo_icon';

export interface ApiEndpointContext {
  elasticsearchUrl?: string;
  managedOtlpServiceUrl?: string;
  isManagedOtlpServiceAvailable: boolean;
  isServerless: boolean;
}

export interface ApiEndpointDefinition {
  id: ApiEndpointId;
  label: string;
  logo?: SupportedLogo;
  euiIconType?: EuiIconType;
  getUrl: (context: ApiEndpointContext) => string | undefined;
}

const trimTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

export const API_ENDPOINTS: readonly ApiEndpointDefinition[] = [
  {
    id: ApiEndpointId.Prometheus,
    label: i18n.translate('xpack.observability_onboarding.apiEndpoints.prometheus.label', {
      defaultMessage: 'Prometheus',
    }),
    logo: 'prometheus',
    getUrl: ({ isServerless, managedOtlpServiceUrl, elasticsearchUrl }) => {
      // The managed OTLP service only accepts Prometheus remote write on Serverless; every other
      // deployment (ECH, ECE, ECK, self-managed) uses the Elasticsearch-native Prometheus endpoint.
      if (isServerless && managedOtlpServiceUrl) {
        return `${trimTrailingSlashes(managedOtlpServiceUrl)}/api/v1/write`;
      }
      if (elasticsearchUrl) {
        return `${trimTrailingSlashes(elasticsearchUrl)}/_prometheus/api/v1/write`;
      }
      return undefined;
    },
  },
  {
    id: ApiEndpointId.OpenTelemetry,
    label: i18n.translate('xpack.observability_onboarding.apiEndpoints.openTelemetry.label', {
      defaultMessage: 'OpenTelemetry',
    }),
    logo: 'opentelemetry',
    getUrl: ({ isManagedOtlpServiceAvailable, managedOtlpServiceUrl, elasticsearchUrl }) => {
      if (isManagedOtlpServiceAvailable && managedOtlpServiceUrl) {
        return managedOtlpServiceUrl;
      }
      if (elasticsearchUrl) {
        return `${trimTrailingSlashes(elasticsearchUrl)}/_otlp`;
      }
      return undefined;
    },
  },
  {
    id: ApiEndpointId.Elasticsearch,
    label: i18n.translate('xpack.observability_onboarding.apiEndpoints.elasticsearch.label', {
      defaultMessage: 'Elasticsearch',
    }),
    euiIconType: 'logoElasticsearch',
    getUrl: ({ elasticsearchUrl }) => elasticsearchUrl,
  },
];
