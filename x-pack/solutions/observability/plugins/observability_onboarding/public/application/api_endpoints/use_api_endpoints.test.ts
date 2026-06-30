/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { FETCH_STATUS, useFetcher } from '../../hooks/use_fetcher';
import { useManagedOtlpServiceAvailability } from '../shared/use_managed_otlp_service_availability';
import { useApiEndpoints } from './use_api_endpoints';

jest.mock('../../hooks/use_fetcher', () => {
  const actual = jest.requireActual('../../hooks/use_fetcher');
  return {
    ...actual,
    useFetcher: jest.fn(),
  };
});

jest.mock('../shared/use_managed_otlp_service_availability', () => ({
  useManagedOtlpServiceAvailability: jest.fn(),
}));

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(),
}));

const mockUseFetcher = useFetcher as jest.MockedFunction<typeof useFetcher>;
const mockUseManagedOtlpServiceAvailability =
  useManagedOtlpServiceAvailability as jest.MockedFunction<
    typeof useManagedOtlpServiceAvailability
  >;
const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;

interface Options {
  isManagedOtlpServiceAvailable?: boolean;
  isServerless?: boolean;
  managedOtlpPrwEndpointEnabled?: boolean;
  elasticsearchUrl?: string;
  managedOtlpServiceUrl?: string;
  status?: FETCH_STATUS;
}

const setup = ({
  isManagedOtlpServiceAvailable = false,
  isServerless = false,
  managedOtlpPrwEndpointEnabled = false,
  elasticsearchUrl = 'https://es.example.com',
  managedOtlpServiceUrl = '',
  status = FETCH_STATUS.SUCCESS,
}: Options = {}) => {
  mockUseManagedOtlpServiceAvailability.mockReturnValue(isManagedOtlpServiceAvailable);
  mockUseKibana.mockReturnValue({
    services: {
      context: { isServerless },
      featureFlags: {
        getBooleanValue: jest.fn().mockReturnValue(managedOtlpPrwEndpointEnabled),
      },
    },
  } as unknown as ReturnType<typeof useKibana>);
  mockUseFetcher.mockReturnValue({
    data: { elasticsearchUrl, managedOtlpServiceUrl },
    status,
    refetch: jest.fn(),
  });

  return renderHook(() => useApiEndpoints());
};

const findEndpoint = (result: ReturnType<typeof setup>['result'], id: string) =>
  result.current.endpoints.find((endpoint) => endpoint.id === id);

describe('useApiEndpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the Elasticsearch URL returned by the server', () => {
    const { result } = setup({ elasticsearchUrl: 'https://es.example.com' });

    expect(result.current.isLoading).toBe(false);
    expect(findEndpoint(result, 'elasticsearch')?.url).toBe('https://es.example.com');
  });

  it('uses the on-prem Elasticsearch URL resolved server-side for Prometheus', () => {
    const { result } = setup({
      isServerless: false,
      elasticsearchUrl: 'https://es.onprem.local:9200',
    });

    expect(findEndpoint(result, 'prometheus')?.url).toBe(
      'https://es.onprem.local:9200/_prometheus/api/v1/write'
    );
  });

  it('falls back to the Elasticsearch OTLP endpoint when the managed service is unavailable', () => {
    const { result } = setup({
      isManagedOtlpServiceAvailable: false,
      elasticsearchUrl: 'https://es.onprem.local:9200',
    });

    expect(findEndpoint(result, 'opentelemetry')?.url).toBe('https://es.onprem.local:9200/_otlp');
  });

  it('exposes the OpenTelemetry endpoint with the managed OTLP URL when available', () => {
    const { result } = setup({
      isManagedOtlpServiceAvailable: true,
      managedOtlpServiceUrl: 'https://otlp.example.com:443',
    });

    expect(findEndpoint(result, 'opentelemetry')?.url).toBe('https://otlp.example.com:443');
  });

  it('builds the managed Prometheus URL from the managed OTLP URL on Serverless', () => {
    const { result } = setup({
      isServerless: true,
      managedOtlpServiceUrl: 'https://otlp.example.com:443',
    });

    expect(findEndpoint(result, 'prometheus')?.url).toBe(
      'https://otlp.example.com:443/api/v1/write'
    );
  });

  it('uses the ES-native Prometheus URL on ECH when the managed OTLP PRW endpoint is disabled', () => {
    const { result } = setup({
      isServerless: false,
      isManagedOtlpServiceAvailable: true,
      managedOtlpPrwEndpointEnabled: false,
      managedOtlpServiceUrl: 'https://otlp.example.com:443',
      elasticsearchUrl: 'https://es.cloud.example.com',
    });

    expect(findEndpoint(result, 'prometheus')?.url).toBe(
      'https://es.cloud.example.com/_prometheus/api/v1/write'
    );
  });

  it('builds the managed Prometheus URL on ECH when the managed OTLP PRW endpoint is enabled', () => {
    const { result } = setup({
      isServerless: false,
      managedOtlpPrwEndpointEnabled: true,
      managedOtlpServiceUrl: 'https://otlp.example.com:443',
      elasticsearchUrl: 'https://es.cloud.example.com',
    });

    expect(findEndpoint(result, 'prometheus')?.url).toBe(
      'https://otlp.example.com:443/api/v1/write'
    );
  });

  it('reports loading while the request is in flight', () => {
    const { result } = setup({ status: FETCH_STATUS.LOADING });

    expect(result.current.isLoading).toBe(true);
  });
});
