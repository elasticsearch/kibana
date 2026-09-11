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
import { inventoryTitle } from '../../../translations';
import { Page } from './page';

const mockGetBreadcrumbOptions = jest.fn(() => ({
  text: inventoryTitle,
  link: { href: '/app/metrics/inventory' },
}));

jest.mock('../../../hooks/use_metrics_breadcrumbs', () => ({
  useMetricsBreadcrumbs: jest.fn(),
}));

jest.mock('../../../hooks/use_parent_breadcrumb_resolver', () => ({
  useParentBreadcrumbResolver: () => ({
    getBreadcrumbOptions: () => mockGetBreadcrumbOptions(),
  }),
}));

jest.mock('../../../hooks/use_kibana', () => ({
  useKibanaContextForPlugin: () => ({
    services: {
      telemetry: { reportAssetDetailsPageViewed: jest.fn() },
    },
  }),
}));

jest.mock('../hooks/use_metadata_state', () => ({
  useMetadataStateContext: () => ({
    metadata: { hasSystemIntegration: true },
    loading: false,
  }),
}));

jest.mock('../hooks/use_asset_details_render_props', () => ({
  useAssetDetailsRenderPropsContext: () => ({
    entity: { id: 'web-01', name: 'web-01', type: 'host' },
    loading: false,
    schema: 'ecs',
  }),
}));

jest.mock('../hooks/use_host_attachment_config', () => ({
  useHostAttachmentConfig: jest.fn(),
}));

jest.mock('../hooks/use_page_header', () => ({
  usePageHeader: () => ({
    rightSideItems: [],
    tabEntries: [],
    appHeaderTabs: [
      {
        id: 'overview',
        label: 'Overview',
        isSelected: true,
        onClick: jest.fn(),
        'data-test-subj': 'infraAssetDetailsOverviewTab',
      },
    ],
    breadcrumbs: [],
  }),
}));

jest.mock('../hooks/use_tab_switcher', () => ({
  useTabSwitcherContext: () => ({
    activeTabId: 'overview',
    showTab: jest.fn(),
    renderedTabsSet: { current: new Set(['overview']) },
  }),
}));

jest.mock('../hooks/use_date_picker', () => ({
  useDatePickerContext: () => ({
    dateRange: { from: 'now-15m', to: 'now' },
    setDateRange: jest.fn(),
  }),
}));

jest.mock('../hooks/use_profiling_kuery', () => ({
  useProfilingKuery: () => ({
    customKuery: '',
    setCustomKuery: jest.fn(),
  }),
}));

jest.mock('../date_picker/date_picker', () => ({
  DatePicker: () => <div data-test-subj="assetDetailsDatePicker" />,
}));

jest.mock('../content/content', () => ({
  Content: () => <div data-test-subj="assetDetailsContent" />,
}));

jest.mock('../header/host_header_title', () => ({
  getHostHeaderBadges: () => [
    {
      label: 'Host details',
      renderCustomBadge: () => <div data-test-subj="hostHeaderExtras" data-include-title="false" />,
    },
  ],
}));

let lastInfraPageTemplateProps: { onboardingFlow?: string; header?: React.ReactNode } = {};

jest.mock('../../shared/templates/infra_page_template', () => ({
  InfraPageTemplate: ({
    children,
    header,
    onboardingFlow,
  }: {
    children: React.ReactNode;
    header?: React.ReactNode;
    onboardingFlow?: string;
  }) => {
    lastInfraPageTemplateProps = { onboardingFlow, header };
    return (
      <div data-test-subj="infraPageTemplate">
        {header}
        {children}
      </div>
    );
  },
}));

jest.mock('../../../pages/metrics/header/use_metrics_app_header_menu', () => ({
  useMetricsAppHeaderMenu: () => ({
    menu: { items: [] },
    flyouts: null,
  }),
}));

const renderPage = () =>
  render(
    <EuiProvider>
      <MockAppHeaderProvider>
        <Page tabs={[]} />
      </MockAppHeaderProvider>
    </EuiProvider>
  );

describe('Asset details Page', () => {
  beforeEach(() => {
    lastInfraPageTemplateProps = {};
    mockGetBreadcrumbOptions.mockReturnValue({
      text: inventoryTitle,
      link: { href: '/app/metrics/inventory' },
    });
  });

  it('renders AppHeader with the asset name, required back, and tabs', async () => {
    renderPage();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('web-01');
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
      'href',
      '/app/metrics/inventory'
    );
    expect(screen.getByTestId('infraAssetDetailsOverviewTab')).toBeInTheDocument();
    expect(screen.getByTestId('assetDetailsContent')).toBeInTheDocument();
    expect(screen.getByTestId('assetDetailsDatePicker')).toBeInTheDocument();
    expect(screen.queryByTestId('infraAssetDetailsReturnButton')).not.toBeInTheDocument();
    expect(lastInfraPageTemplateProps.onboardingFlow).toBeUndefined();
  });

  it('keeps host extras out of the AppHeader title string', async () => {
    renderPage();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('web-01');
    expect(screen.getByTestId('hostHeaderExtras')).toHaveAttribute('data-include-title', 'false');
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).toContainElement(
      screen.getByTestId('hostHeaderExtras')
    );
  });
});
