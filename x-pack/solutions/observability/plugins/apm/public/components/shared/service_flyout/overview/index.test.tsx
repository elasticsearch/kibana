/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import type { ServiceFlyoutTransactionsSection } from '@kbn/apm-ui-shared';
import type { ServiceNodeData } from '../../../../../common/service_map';
import { ServiceFlyoutOverview } from '.';

const mockUseServiceHasSystemMetrics = jest.fn<
  { hasSystemMetrics: boolean | undefined; isLoading: boolean },
  []
>();
let transactionsSectionProps: React.ComponentProps<typeof ServiceFlyoutTransactionsSection> | null =
  null;

jest.mock('../../../../context/apm_plugin/use_apm_plugin_context', () => ({
  useApmPluginContext: () => ({
    core: { http: {}, notifications: { toasts: { addDanger: jest.fn() } } },
    share: { url: { locators: { get: jest.fn() } } },
  }),
}));

jest.mock('../hooks/use_service_has_system_metrics', () => ({
  useServiceHasSystemMetrics: () => mockUseServiceHasSystemMetrics(),
}));

jest.mock('../../../../hooks/use_adhoc_apm_data_view', () => ({
  useAdHocApmDataView: () => ({ dataView: undefined }),
}));

jest.mock('@kbn/apm-ui-shared', () => ({
  ServiceFlyoutTransactionsSection: (
    props: React.ComponentProps<typeof ServiceFlyoutTransactionsSection>
  ) => {
    transactionsSectionProps = props;
    return <div data-test-subj="transactionsSectionMock" />;
  },
}));

jest.mock('./query_controls', () => ({
  ServiceFlyoutQueryControls: () => <div data-test-subj="queryControlsMock" />,
}));

jest.mock('./lens_chart', () => ({
  ServiceFlyoutLensChart: () => <div data-test-subj="lensChartMock" />,
}));

const mockServiceFlyoutApmCharts = jest.fn((_props: unknown) => (
  <div data-test-subj="apmChartsMock" />
));
jest.mock('./apm_charts', () => ({
  ServiceFlyoutApmCharts: (props: unknown) => mockServiceFlyoutApmCharts(props as never),
}));

const service: ServiceNodeData = {
  id: 'opbeans-java',
  label: 'opbeans-java',
  isService: true,
  agentName: 'java',
};

const defaultProps = {
  service,
  environment: 'production' as const,
  kuery: '',
  rangeFrom: 'now-15m',
  rangeTo: 'now',
  transactionType: 'request',
  refreshToken: 0,
  onEnvironmentChange: jest.fn(),
  onRangeChange: jest.fn(),
  onRefresh: jest.fn(),
  onTransactionTypeChange: jest.fn(),
};

function renderOverview(
  overrides: Partial<React.ComponentProps<typeof ServiceFlyoutOverview>> = {}
) {
  return render(
    <IntlProvider locale="en">
      <ServiceFlyoutOverview {...defaultProps} {...overrides} />
    </IntlProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  transactionsSectionProps = null;
});

describe('ServiceFlyoutOverview key metrics chart implementation', () => {
  it('renders the shared APM chart components for classic APM (non-OTel) services', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: false, isLoading: false });
    renderOverview({ service: { ...service, agentName: 'java' } });

    expect(screen.getByTestId('apmChartsMock')).toBeInTheDocument();
    expect(screen.queryByTestId('lensChartMock')).not.toBeInTheDocument();
    expect(screen.getByTestId('serviceFlyoutSection-keyMetrics')).toBeInTheDocument();
  });

  it('keeps the ES|QL Lens charts for OTel services', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: false, isLoading: false });
    renderOverview({ service: { ...service, agentName: 'opentelemetry/nodejs' } });

    expect(screen.queryByTestId('apmChartsMock')).not.toBeInTheDocument();
  });

  it('keeps the ES|QL Lens charts in document-based hosts (Discover)', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: false, isLoading: false });
    renderOverview({ preferDocumentBasedCharts: true });

    expect(screen.queryByTestId('apmChartsMock')).not.toBeInTheDocument();
  });

  it('seeds the latency aggregation type from the flyout options', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: false, isLoading: false });
    renderOverview({ latencyAggregationType: 'p95' as any });

    expect(mockServiceFlyoutApmCharts).toHaveBeenCalledWith(
      expect.objectContaining({ latencyAggregationType: 'p95' })
    );
  });
});

describe('ServiceFlyoutOverview transactions section props', () => {
  it('passes resolved ISO timestamps to ServiceFlyoutTransactionsSection, not raw relative date strings', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: false, isLoading: false });
    renderOverview();

    expect(transactionsSectionProps?.start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(transactionsSectionProps?.end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(transactionsSectionProps?.start).not.toBe('now-15m');
    expect(transactionsSectionProps?.end).not.toBe('now');
  });

  it('forwards refreshToken to ServiceFlyoutTransactionsSection', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: false, isLoading: false });
    renderOverview({ refreshToken: 42 });

    expect(transactionsSectionProps?.refreshToken).toBe(42);
  });
});

describe('ServiceFlyoutOverview infrastructure section visibility', () => {
  it('hides the infrastructure section while system metrics data is loading', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({
      hasSystemMetrics: undefined,
      isLoading: true,
    });

    renderOverview();

    expect(
      screen.queryByTestId('serviceFlyoutSection-infrastructureMetrics')
    ).not.toBeInTheDocument();
  });

  it('renders a skeleton placeholder while system metrics data is loading', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({
      hasSystemMetrics: undefined,
      isLoading: true,
    });

    renderOverview();

    expect(
      screen.getByTestId('serviceFlyoutSection-infrastructureMetricsSkeleton')
    ).toBeInTheDocument();
  });

  it('hides both skeleton and infrastructure section when the fetch fails', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({
      hasSystemMetrics: undefined,
      isLoading: false,
    });

    renderOverview();

    expect(
      screen.queryByTestId('serviceFlyoutSection-infrastructureMetricsSkeleton')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('serviceFlyoutSection-infrastructureMetrics')
    ).not.toBeInTheDocument();
  });

  it('hides the infrastructure section when the service has no system metrics', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: false, isLoading: false });

    renderOverview();

    expect(
      screen.queryByTestId('serviceFlyoutSection-infrastructureMetrics')
    ).not.toBeInTheDocument();
  });

  it('shows the infrastructure section when the service has system metrics', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: true, isLoading: false });

    renderOverview();

    expect(screen.getByTestId('serviceFlyoutSection-infrastructureMetrics')).toBeInTheDocument();
  });

  it('always renders the key metrics section regardless of system metrics', () => {
    mockUseServiceHasSystemMetrics.mockReturnValue({ hasSystemMetrics: false, isLoading: false });

    renderOverview();

    expect(screen.getByTestId('serviceFlyoutSection-keyMetrics')).toBeInTheDocument();
  });
});
