/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { FETCH_STATUS, useFetcher } from '../../../hooks/use_fetcher';
import { DataIngestStatus, type ActionLink } from './data_ingest_status';

jest.mock('@kbn/kibana-react-plugin/public');
jest.mock('../../../hooks/use_fetcher', () => {
  const actual = jest.requireActual('../../../hooks/use_fetcher');
  return {
    ...actual,
    useFetcher: jest.fn(),
  };
});

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;
const mockUseFetcher = useFetcher as jest.MockedFunction<typeof useFetcher>;

const FETCH_INTERVAL_MS = 2000;

const metricsAction: ActionLink = {
  id: 'metrics-dashboard',
  title: 'Explore metrics dashboard',
  label: 'Open dashboard',
  href: 'https://example/dashboard',
  requires: 'metrics',
};

const logsAction: ActionLink = {
  id: 'logs',
  title: 'Explore logs',
  label: 'Open logs',
  href: 'https://example/logs',
  requires: 'logs',
};

const renderStatus = (overrides: Partial<React.ComponentProps<typeof DataIngestStatus>> = {}) =>
  render(
    <I18nProvider>
      <DataIngestStatus
        onboardingId="test-onboarding-id"
        onboardingFlowType="kubernetes_otel"
        dataset="kubernetes"
        integration="kubernetes_otel"
        actionLinks={[metricsAction, logsAction]}
        {...overrides}
      />
    </I18nProvider>
  );

describe('DataIngestStatus polling gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockUseKibana.mockReturnValue({
      services: {
        analytics: { reportEvent: jest.fn() },
        http: {
          basePath: { get: () => '' },
          staticAssets: {
            getPluginAssetHref: (asset: string) => `/static/${asset}`,
          },
        },
      },
    } as unknown as ReturnType<typeof useKibana>);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('continues polling when metrics arrived but logs are still pending (metrics-first race)', () => {
    const refetch = jest.fn();
    mockUseFetcher.mockReturnValue({
      data: { hasData: true, hasLogs: false, hasMetrics: true },
      status: FETCH_STATUS.SUCCESS,
      refetch,
    });

    renderStatus();

    act(() => {
      jest.advanceTimersByTime(FETCH_INTERVAL_MS);
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('continues polling when logs arrived but metrics are still pending (logs-first race)', () => {
    const refetch = jest.fn();
    mockUseFetcher.mockReturnValue({
      data: { hasData: true, hasLogs: true, hasMetrics: false },
      status: FETCH_STATUS.SUCCESS,
      refetch,
    });

    renderStatus();

    act(() => {
      jest.advanceTimersByTime(FETCH_INTERVAL_MS);
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('stops polling once both required data types are present', () => {
    const refetch = jest.fn();
    mockUseFetcher.mockReturnValue({
      data: { hasData: true, hasLogs: true, hasMetrics: true },
      status: FETCH_STATUS.SUCCESS,
      refetch,
    });

    renderStatus();

    act(() => {
      jest.advanceTimersByTime(FETCH_INTERVAL_MS * 3);
    });

    expect(refetch).not.toHaveBeenCalled();
  });

  it('omits the logs action link until hasLogs flips to true', () => {
    const refetch = jest.fn();
    mockUseFetcher.mockReturnValue({
      data: { hasData: true, hasLogs: false, hasMetrics: true },
      status: FETCH_STATUS.SUCCESS,
      refetch,
    });

    const { queryByTestId } = renderStatus();

    expect(
      queryByTestId('observabilityOnboardingDataIngestStatusActionLink-logs')
    ).not.toBeInTheDocument();
  });

  it('treats action links without a requires constraint as satisfied by any data', () => {
    const refetch = jest.fn();
    mockUseFetcher.mockReturnValue({
      data: { hasData: true, hasLogs: true, hasMetrics: false },
      status: FETCH_STATUS.SUCCESS,
      refetch,
    });

    renderStatus({
      actionLinks: [
        {
          id: 'any',
          title: 'Open',
          label: 'Open',
          href: 'https://example/any',
        },
      ],
    });

    act(() => {
      jest.advanceTimersByTime(FETCH_INTERVAL_MS * 3);
    });

    expect(refetch).not.toHaveBeenCalled();
  });

  it('stops polling and notifies when hasPreExistingData is true even without required data', () => {
    const refetch = jest.fn();
    const onDataReceived = jest.fn();
    mockUseFetcher.mockReturnValue({
      data: { hasData: false, hasLogs: false, hasMetrics: false, hasPreExistingData: true },
      status: FETCH_STATUS.SUCCESS,
      refetch,
    });

    renderStatus({ onDataReceived });

    act(() => {
      jest.advanceTimersByTime(FETCH_INTERVAL_MS * 3);
    });

    expect(refetch).not.toHaveBeenCalled();
    expect(onDataReceived).toHaveBeenCalledTimes(1);
  });
});
