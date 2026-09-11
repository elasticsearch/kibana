/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';
import { MockAppHeaderProvider } from '@kbn/app-header/mocks';
import { MetricsExplorerPage } from '.';
import { metricsExplorerTitle } from '../../../translations';

jest.mock('@kbn/core/public', () => ({
  APP_WRAPPER_CLASS: 'kbnAppWrapper',
}));

type MockFetchStatus = 'loading' | 'success' | 'failure' | 'not_initiated' | 'pending';

const mockFetcherState: { hasData: boolean; status: MockFetchStatus } = {
  hasData: true,
  status: 'success',
};

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  useTrackPageview: jest.fn(),
}));

jest.mock('@kbn/ebt-tools', () => ({
  usePerformanceContext: () => ({ onPageReady: jest.fn() }),
}));

jest.mock('../../../hooks/use_metrics_breadcrumbs', () => ({
  useMetricsBreadcrumbs: jest.fn(),
}));

jest.mock('../../../hooks/use_fetcher', () => ({
  FETCH_STATUS: {
    LOADING: 'loading',
    SUCCESS: 'success',
    FAILURE: 'failure',
    NOT_INITIATED: 'not_initiated',
    PENDING: 'pending',
  },
  isPending: (status: string) =>
    status === 'loading' || status === 'not_initiated' || status === 'pending',
  isSuccess: (status: string) => status === 'success',
  useFetcher: () => ({
    data: mockFetcherState.status === 'failure' ? undefined : { hasData: mockFetcherState.hasData },
    status: mockFetcherState.status,
  }),
}));

jest.mock('../../../hooks/use_kibana', () => ({
  useKibanaContextForPlugin: () => ({
    services: {
      share: {
        url: {
          locators: {
            get: () => ({ getRedirectUrl: () => '/app/observabilityOnboarding' }),
          },
        },
      },
      docLinks: { links: { observability: { guide: 'https://docs.elastic.co' } } },
    },
  }),
}));

jest.mock('@kbn/shared-ux-page-no-data', () => ({
  NoDataPage: () => <div data-test-subj="kbnNoDataPage" />,
}));

let lastInfraPageTemplateProps: { hasDataOverride?: boolean } = {};

jest.mock('../../../components/shared/templates/infra_page_template', () => ({
  InfraPageTemplate: ({
    children,
    hasDataOverride,
    header,
  }: {
    children: React.ReactNode;
    hasDataOverride?: boolean;
    header?: React.ReactNode;
  }) => {
    lastInfraPageTemplateProps = { hasDataOverride };
    return (
      <div data-test-subj="infraPageTemplate">
        {header}
        {children}
      </div>
    );
  },
}));

jest.mock('../../../containers/metrics_explorer/with_metrics_explorer_options_url_state', () => ({
  WithMetricsExplorerOptionsUrlState: () => null,
}));

jest.mock('../../../hooks/use_metrics_explorer_views', () => ({
  useMetricsExplorerViews: () => ({ currentView: { id: '0' } }),
}));

jest.mock('./hooks/use_metrics_explorer_options', () => ({
  MetricsExplorerOptionsContainer: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('./hooks/use_metric_explorer_state', () => ({
  useMetricsExplorerState: () => ({
    isLoading: false,
    error: null,
    data: undefined,
    timeRange: { from: 'now-1h', to: 'now', interval: '>=10s' },
    options: { aggregation: 'avg', metrics: [] },
    chartOptions: {},
    setChartOptions: jest.fn(),
    handleAggregationChange: jest.fn(),
    handleMetricsChange: jest.fn(),
    handleFilterQuerySubmit: jest.fn(),
    handleGroupByChange: jest.fn(),
    handleTimeChange: jest.fn(),
    handleLoadMore: jest.fn(),
    onViewStateChange: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('./components/toolbar', () => ({
  MetricsExplorerToolbar: () => <div data-test-subj="metricsExplorerToolbar" />,
}));

jest.mock('./components/charts', () => ({
  MetricsExplorerCharts: () => <div data-test-subj="metricsExplorerCharts" />,
}));

jest.mock('./components/metrics_in_discover_callout', () => ({
  MetricsInDiscoverCallout: () => null,
}));

jest.mock('../header/use_metrics_app_header_menu', () => ({
  useMetricsAppHeaderMenu: () => ({
    menu: { items: [] },
    flyouts: null,
  }),
}));

const renderMetricsExplorerPage = () =>
  render(
    <EuiProvider>
      <MockAppHeaderProvider>
        <MetricsExplorerPage />
      </MockAppHeaderProvider>
    </EuiProvider>
  );

describe('MetricsExplorerPage', () => {
  beforeEach(() => {
    mockFetcherState.hasData = true;
    mockFetcherState.status = 'success';
    lastInfraPageTemplateProps = {};
  });

  it('renders AppHeader with the explorer title and no back control when metrics exist', async () => {
    renderMetricsExplorerPage();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
      metricsExplorerTitle
    );
    expect(screen.queryByTestId(APP_HEADER_TEST_SUBJECTS.back)).not.toBeInTheDocument();
    expect(screen.getByTestId('metricsExplorerToolbar')).toBeInTheDocument();
    expect(screen.getByTestId('metricsExplorerCharts')).toBeInTheDocument();
    expect(screen.queryByTestId('kbnNoDataPage')).not.toBeInTheDocument();
    expect(lastInfraPageTemplateProps.hasDataOverride).toBe(true);
  });

  it('keeps AppHeader and shows onboarding instead of toolbar and charts when there is no metrics data', async () => {
    mockFetcherState.hasData = false;

    renderMetricsExplorerPage();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
      metricsExplorerTitle
    );
    expect(screen.queryByTestId(APP_HEADER_TEST_SUBJECTS.back)).not.toBeInTheDocument();
    expect(screen.getByTestId('kbnNoDataPage')).toBeInTheDocument();
    expect(screen.queryByTestId('metricsExplorerToolbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metricsExplorerCharts')).not.toBeInTheDocument();
    expect(lastInfraPageTemplateProps.hasDataOverride).toBe(false);
  });

  it('does not show onboarding while metrics data is loading', async () => {
    mockFetcherState.hasData = false;
    mockFetcherState.status = 'loading';

    renderMetricsExplorerPage();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
      metricsExplorerTitle
    );
    expect(screen.queryByTestId('kbnNoDataPage')).not.toBeInTheDocument();
    expect(screen.getByTestId('metricsExplorerToolbar')).toBeInTheDocument();
    expect(screen.getByTestId('metricsExplorerCharts')).toBeInTheDocument();
    expect(lastInfraPageTemplateProps.hasDataOverride).toBe(true);
  });

  it('keeps toolbar and charts mounted when the has-data check fails', async () => {
    mockFetcherState.hasData = false;
    mockFetcherState.status = 'failure';

    renderMetricsExplorerPage();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
      metricsExplorerTitle
    );
    expect(screen.queryByTestId('kbnNoDataPage')).not.toBeInTheDocument();
    expect(screen.getByTestId('metricsExplorerToolbar')).toBeInTheDocument();
    expect(screen.getByTestId('metricsExplorerCharts')).toBeInTheDocument();
    expect(lastInfraPageTemplateProps.hasDataOverride).toBe(true);
  });
});
