/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { ApiEndpointId } from '../../../common/api_endpoints';
import { createShipperApiKey } from './create_shipper_api_key';
import { createManagedOtlpServiceApiKey } from './create_managed_otlp_service_api_key';
import { createPrometheusApiKey } from './create_prometheus_api_key';
import { createEsOtlpApiKey } from './create_es_otlp_api_key';

type ApiKeyFactory = (esClient: ElasticsearchClient, name: string) => Promise<{ encoded: string }>;

export interface ApiKeyFactoryContext {
  isManagedOtlpServiceAvailable: boolean;
  isServerless: boolean;
  managedOtlpPrwEndpointEnabled: boolean;
}

export function resolveApiKeyFactory(
  id: ApiEndpointId,
  {
    isManagedOtlpServiceAvailable,
    isServerless,
    managedOtlpPrwEndpointEnabled,
  }: ApiKeyFactoryContext
): ApiKeyFactory {
  switch (id) {
    case ApiEndpointId.OpenTelemetry:
      return isManagedOtlpServiceAvailable ? createManagedOtlpServiceApiKey : createEsOtlpApiKey;
    case ApiEndpointId.Prometheus:
      return isServerless || managedOtlpPrwEndpointEnabled
        ? createManagedOtlpServiceApiKey
        : createPrometheusApiKey;
    case ApiEndpointId.Elasticsearch:
      return (esClient, name) => createShipperApiKey(esClient, name, true);
  }
}
