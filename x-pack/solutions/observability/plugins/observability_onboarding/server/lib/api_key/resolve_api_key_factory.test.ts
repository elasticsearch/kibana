/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { ApiEndpointId } from '../../../common/api_endpoints';
import { resolveApiKeyFactory } from './resolve_api_key_factory';
import { createShipperApiKey } from './create_shipper_api_key';
import { createManagedOtlpServiceApiKey } from './create_managed_otlp_service_api_key';
import { createPrometheusApiKey } from './create_prometheus_api_key';
import { createEsOtlpApiKey } from './create_es_otlp_api_key';

jest.mock('./create_shipper_api_key');
jest.mock('./create_managed_otlp_service_api_key');
jest.mock('./create_prometheus_api_key');
jest.mock('./create_es_otlp_api_key');

const esClient = {} as unknown as ElasticsearchClient;

describe('resolveApiKeyFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenTelemetry', () => {
    it('creates a managed OTLP service key when the managed service is available', async () => {
      const factory = resolveApiKeyFactory(ApiEndpointId.OpenTelemetry, {
        isManagedOtlpServiceAvailable: true,
        isServerless: false,
        managedOtlpPrwEndpointEnabled: false,
      });

      await factory(esClient, 'name');

      expect(createManagedOtlpServiceApiKey).toHaveBeenCalledWith(esClient, 'name');
      expect(createEsOtlpApiKey).not.toHaveBeenCalled();
    });

    it('creates an Elasticsearch OTLP key when the managed service is unavailable', async () => {
      const factory = resolveApiKeyFactory(ApiEndpointId.OpenTelemetry, {
        isManagedOtlpServiceAvailable: false,
        isServerless: false,
        managedOtlpPrwEndpointEnabled: false,
      });

      await factory(esClient, 'name');

      expect(createEsOtlpApiKey).toHaveBeenCalledWith(esClient, 'name');
      expect(createManagedOtlpServiceApiKey).not.toHaveBeenCalled();
    });
  });

  describe('Prometheus', () => {
    it('creates a managed OTLP service key on Serverless', async () => {
      const factory = resolveApiKeyFactory(ApiEndpointId.Prometheus, {
        isManagedOtlpServiceAvailable: true,
        isServerless: true,
        managedOtlpPrwEndpointEnabled: false,
      });

      await factory(esClient, 'name');

      expect(createManagedOtlpServiceApiKey).toHaveBeenCalledWith(esClient, 'name');
      expect(createPrometheusApiKey).not.toHaveBeenCalled();
    });

    it('creates an Elasticsearch-native Prometheus key on non-Serverless deployments', async () => {
      const factory = resolveApiKeyFactory(ApiEndpointId.Prometheus, {
        isManagedOtlpServiceAvailable: false,
        isServerless: false,
        managedOtlpPrwEndpointEnabled: false,
      });

      await factory(esClient, 'name');

      expect(createPrometheusApiKey).toHaveBeenCalledWith(esClient, 'name');
      expect(createManagedOtlpServiceApiKey).not.toHaveBeenCalled();
    });

    it('creates an Elasticsearch-native Prometheus key on non-Serverless when the managed OTLP PRW endpoint is disabled', async () => {
      const factory = resolveApiKeyFactory(ApiEndpointId.Prometheus, {
        isManagedOtlpServiceAvailable: true,
        isServerless: false,
        managedOtlpPrwEndpointEnabled: false,
      });

      await factory(esClient, 'name');

      expect(createPrometheusApiKey).toHaveBeenCalledWith(esClient, 'name');
      expect(createManagedOtlpServiceApiKey).not.toHaveBeenCalled();
    });

    it('creates a managed OTLP service key on non-Serverless when the managed OTLP PRW endpoint is enabled', async () => {
      const factory = resolveApiKeyFactory(ApiEndpointId.Prometheus, {
        isManagedOtlpServiceAvailable: true,
        isServerless: false,
        managedOtlpPrwEndpointEnabled: true,
      });

      await factory(esClient, 'name');

      expect(createManagedOtlpServiceApiKey).toHaveBeenCalledWith(esClient, 'name');
      expect(createPrometheusApiKey).not.toHaveBeenCalled();
    });
  });

  describe('Elasticsearch', () => {
    it('creates a shipper key that includes APM (traces) privileges', async () => {
      const factory = resolveApiKeyFactory(ApiEndpointId.Elasticsearch, {
        isManagedOtlpServiceAvailable: false,
        isServerless: false,
        managedOtlpPrwEndpointEnabled: false,
      });

      await factory(esClient, 'name');

      expect(createShipperApiKey).toHaveBeenCalledWith(esClient, 'name', true);
    });
  });
});
