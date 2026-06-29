/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { API_ENDPOINTS, type ApiEndpointContext } from './endpoints_config';

const getEndpoint = (id: string) => {
  const endpoint = API_ENDPOINTS.find((definition) => definition.id === id);
  if (!endpoint) {
    throw new Error(`No endpoint definition found for id "${id}"`);
  }
  return endpoint;
};

const createContext = (overrides: Partial<ApiEndpointContext> = {}): ApiEndpointContext => ({
  elasticsearchUrl: undefined,
  managedOtlpServiceUrl: undefined,
  isManagedOtlpServiceAvailable: false,
  isServerless: false,
  managedOtlpPrwEndpointEnabled: false,
  ...overrides,
});

describe('API_ENDPOINTS', () => {
  describe('getUrl', () => {
    it('returns the Elasticsearch URL unchanged', () => {
      expect(
        getEndpoint('elasticsearch').getUrl(
          createContext({ elasticsearchUrl: 'https://es.example.com' })
        )
      ).toBe('https://es.example.com');
    });

    describe('OpenTelemetry URL', () => {
      it('returns the managed OTLP URL when the managed service is available', () => {
        expect(
          getEndpoint('opentelemetry').getUrl(
            createContext({
              isManagedOtlpServiceAvailable: true,
              managedOtlpServiceUrl: 'https://otlp.example.com:443',
            })
          )
        ).toBe('https://otlp.example.com:443');
      });

      it('falls back to the Elasticsearch OTLP endpoint when the managed service is unavailable', () => {
        expect(
          getEndpoint('opentelemetry').getUrl(
            createContext({
              isManagedOtlpServiceAvailable: false,
              elasticsearchUrl: 'https://es.example.com',
            })
          )
        ).toBe('https://es.example.com/_otlp');
      });

      it('trims trailing slashes from the Elasticsearch URL in the fallback', () => {
        expect(
          getEndpoint('opentelemetry').getUrl(
            createContext({
              isManagedOtlpServiceAvailable: false,
              elasticsearchUrl: 'https://es.example.com//',
            })
          )
        ).toBe('https://es.example.com/_otlp');
      });

      it('falls back to the Elasticsearch OTLP endpoint when the managed OTLP URL is missing', () => {
        expect(
          getEndpoint('opentelemetry').getUrl(
            createContext({
              isManagedOtlpServiceAvailable: true,
              managedOtlpServiceUrl: undefined,
              elasticsearchUrl: 'https://es.example.com',
            })
          )
        ).toBe('https://es.example.com/_otlp');
      });

      it('returns undefined when no URL can be derived', () => {
        expect(getEndpoint('opentelemetry').getUrl(createContext())).toBeUndefined();
      });
    });

    describe('Prometheus remote write URL', () => {
      it('derives the ES-native URL from the Elasticsearch URL on non-Serverless deployments', () => {
        expect(
          getEndpoint('prometheus').getUrl(
            createContext({
              isServerless: false,
              elasticsearchUrl: 'https://es.example.com',
            })
          )
        ).toBe('https://es.example.com/_prometheus/api/v1/write');
      });

      it('trims trailing slashes from the Elasticsearch URL', () => {
        expect(
          getEndpoint('prometheus').getUrl(
            createContext({
              isServerless: false,
              elasticsearchUrl: 'https://es.example.com//',
            })
          )
        ).toBe('https://es.example.com/_prometheus/api/v1/write');
      });

      it('uses the managed OTLP URL on Serverless', () => {
        expect(
          getEndpoint('prometheus').getUrl(
            createContext({
              isServerless: true,
              managedOtlpServiceUrl: 'https://otlp.example.com:443',
            })
          )
        ).toBe('https://otlp.example.com:443/api/v1/write');
      });

      it('uses the ES-native URL when not Serverless and the managed OTLP PRW endpoint is disabled', () => {
        expect(
          getEndpoint('prometheus').getUrl(
            createContext({
              isServerless: false,
              isManagedOtlpServiceAvailable: true,
              managedOtlpPrwEndpointEnabled: false,
              managedOtlpServiceUrl: 'https://otlp.example.com:443',
              elasticsearchUrl: 'https://es.example.com',
            })
          )
        ).toBe('https://es.example.com/_prometheus/api/v1/write');
      });

      it('uses the managed OTLP URL on ECH when the managed OTLP PRW endpoint is enabled', () => {
        expect(
          getEndpoint('prometheus').getUrl(
            createContext({
              isServerless: false,
              managedOtlpPrwEndpointEnabled: true,
              managedOtlpServiceUrl: 'https://otlp.example.com:443',
              elasticsearchUrl: 'https://es.example.com',
            })
          )
        ).toBe('https://otlp.example.com:443/api/v1/write');
      });

      it('falls back to the ES-native URL when the managed OTLP PRW endpoint is enabled but the managed OTLP URL is missing', () => {
        expect(
          getEndpoint('prometheus').getUrl(
            createContext({
              isServerless: false,
              managedOtlpPrwEndpointEnabled: true,
              managedOtlpServiceUrl: undefined,
              elasticsearchUrl: 'https://es.example.com',
            })
          )
        ).toBe('https://es.example.com/_prometheus/api/v1/write');
      });

      it('falls back to the ES-native URL on Serverless when the managed OTLP URL is missing', () => {
        expect(
          getEndpoint('prometheus').getUrl(
            createContext({
              isServerless: true,
              managedOtlpServiceUrl: undefined,
              elasticsearchUrl: 'https://es.example.com',
            })
          )
        ).toBe('https://es.example.com/_prometheus/api/v1/write');
      });

      it('returns undefined when no URL can be derived', () => {
        expect(getEndpoint('prometheus').getUrl(createContext())).toBeUndefined();
      });
    });
  });
});
