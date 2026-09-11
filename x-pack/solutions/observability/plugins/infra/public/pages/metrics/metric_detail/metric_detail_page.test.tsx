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
import { MetricDetailPage } from './metric_detail_page';

const mockInventoryTitle = 'Infrastructure inventory';

interface MockMetadataState {
  name: string;
  filteredRequiredMetrics: string[];
  loading: boolean;
  cloudId: string;
  metadata: { name?: string } | undefined;
}

const mockMetadataState: MockMetadataState = {
  name: '',
  filteredRequiredMetrics: [],
  loading: true,
  cloudId: '',
  metadata: undefined,
};

jest.mock('react-router-dom', () => ({
  useRouteMatch: () => ({
    params: { type: 'pod', node: 'pod-1' },
  }),
}));

jest.mock('@kbn/metrics-data-access-plugin/common', () => ({
  findInventoryModel: () => ({
    metrics: { requiredTsvb: [] },
  }),
}));

jest.mock('../../../hooks/use_metrics_breadcrumbs', () => ({
  useMetricsBreadcrumbs: jest.fn(),
}));

jest.mock('../../../hooks/use_parent_breadcrumb_resolver', () => ({
  useParentBreadcrumbResolver: () => ({
    getBreadcrumbOptions: () => ({
      text: mockInventoryTitle,
      link: { href: '/app/metrics/inventory' },
    }),
  }),
}));

jest.mock('../../../containers/metrics_source', () => ({
  useSourceContext: () => ({ sourceId: 'default' }),
}));

jest.mock('./hooks/use_metrics_time', () => ({
  useMetricsTimeContext: () => ({
    timeRange: { from: 'now-1h', to: 'now', interval: '>=1m' },
    parsedTimeRange: { from: 1, to: 2 },
    setTimeRange: jest.fn(),
    refreshInterval: 0,
    setRefreshInterval: jest.fn(),
    isAutoReloading: false,
    setAutoReload: jest.fn(),
    triggerRefresh: jest.fn(),
  }),
}));

jest.mock('../../../components/asset_details/hooks/use_metadata', () => ({
  useMetadata: () => mockMetadataState,
}));

jest.mock('../header/use_metrics_app_header_menu', () => ({
  useMetricsAppHeaderMenu: () => ({
    menu: { items: [] },
    flyouts: null,
  }),
}));

jest.mock('../../../components/loading', () => ({
  InfraLoadingPanel: () => <div data-test-subj="metricDetailLoadingPanel" />,
}));

jest.mock('./components/node_details_page', () => ({
  NodeDetailsPage: () => <div data-test-subj="metricDetailNodePage" />,
}));

let lastInfraPageTemplateProps: { onboardingFlow?: string } = {};

jest.mock('../../../components/shared/templates/infra_page_template', () => ({
  InfraPageTemplate: ({
    children,
    header,
    onboardingFlow,
  }: {
    children: React.ReactNode;
    header?: React.ReactNode;
    onboardingFlow?: string;
  }) => {
    lastInfraPageTemplateProps = { onboardingFlow };
    return (
      <div data-test-subj="infraPageTemplate">
        {header}
        {children}
      </div>
    );
  },
}));

const renderPage = () =>
  render(
    <EuiProvider>
      <MockAppHeaderProvider>
        <MetricDetailPage />
      </MockAppHeaderProvider>
    </EuiProvider>
  );

describe('MetricDetailPage', () => {
  beforeEach(() => {
    mockMetadataState.name = '';
    mockMetadataState.filteredRequiredMetrics = [];
    mockMetadataState.loading = true;
    mockMetadataState.metadata = undefined;
    lastInfraPageTemplateProps = {};
  });

  it('keeps AppHeader mounted while metadata loads', async () => {
    renderPage();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('pod-1');
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
      'href',
      '/app/metrics/inventory'
    );
    expect(screen.getByTestId('metricDetailLoadingPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('infraAssetDetailsReturnButton')).not.toBeInTheDocument();
    expect(lastInfraPageTemplateProps.onboardingFlow).toBeUndefined();
  });

  it('renders the node body under AppHeader after metadata loads', async () => {
    mockMetadataState.loading = false;
    mockMetadataState.name = 'pod-1';
    mockMetadataState.metadata = { name: 'pod-1' };

    renderPage();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('pod-1');
    expect(screen.getByTestId('metricDetailNodePage')).toBeInTheDocument();
    expect(screen.queryByTestId('metricDetailLoadingPanel')).not.toBeInTheDocument();
    expect(lastInfraPageTemplateProps.onboardingFlow).toBeUndefined();
  });
});
