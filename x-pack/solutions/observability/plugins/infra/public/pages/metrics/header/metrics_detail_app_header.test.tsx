/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';
import { MockAppHeaderProvider } from '@kbn/app-header/mocks';
import React from 'react';
import { hostsTitle, inventoryTitle } from '../../../translations';
import { MetricsDetailAppHeader } from './metrics_detail_app_header';

const mockGetBreadcrumbOptions = jest.fn(() => ({
  text: inventoryTitle,
  link: { href: '/app/metrics/inventory' },
}));

jest.mock('../../../hooks/use_parent_breadcrumb_resolver', () => ({
  useParentBreadcrumbResolver: () => ({
    getBreadcrumbOptions: () => mockGetBreadcrumbOptions(),
  }),
}));

jest.mock('./use_metrics_app_header_menu', () => ({
  useMetricsAppHeaderMenu: () => ({
    menu: { items: [] },
    flyouts: <div data-test-subj="metricsDetailAppHeaderFlyouts" />,
  }),
}));

const renderHeader = ({
  tabs,
  badges,
}: {
  tabs?: Array<{ id: string; label: string }>;
  badges?: Array<{ label: string; renderCustomBadge: () => React.ReactElement }>;
} = {}) =>
  render(
    <EuiProvider>
      <MockAppHeaderProvider>
        <MetricsDetailAppHeader title="web-01" tabs={tabs} badges={badges} />
      </MockAppHeaderProvider>
    </EuiProvider>
  );

describe('MetricsDetailAppHeader', () => {
  beforeEach(() => {
    mockGetBreadcrumbOptions.mockReturnValue({
      text: inventoryTitle,
      link: { href: '/app/metrics/inventory' },
    });
  });

  it('renders the title, required back, and menu flyouts', async () => {
    renderHeader();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('web-01');
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
      'href',
      '/app/metrics/inventory'
    );
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAccessibleName(
      `Back to ${inventoryTitle}`
    );
    expect(screen.getByTestId('metricsDetailAppHeaderFlyouts')).toBeInTheDocument();
    expect(screen.queryByTestId('infraAssetDetailsReturnButton')).not.toBeInTheDocument();
  });

  it('uses the resolved origin parent for back', async () => {
    mockGetBreadcrumbOptions.mockReturnValue({
      text: hostsTitle,
      link: { href: '/app/metrics/hosts?kuery=host.name:web-01' },
    });

    renderHeader();

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
      'href',
      '/app/metrics/hosts?kuery=host.name:web-01'
    );
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAccessibleName(
      `Back to ${hostsTitle}`
    );
  });

  it('renders asset-detail tabs on the header', async () => {
    renderHeader({ tabs: [{ id: 'overview', label: 'Overview' }] });

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.tabs)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  });

  it('renders badges next to the title', async () => {
    renderHeader({
      badges: [
        {
          label: 'OpenTelemetry',
          renderCustomBadge: () => <span data-test-subj="hostTitleIcon">icon</span>,
        },
      ],
    });

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('web-01');
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).toContainElement(
      screen.getByTestId('hostTitleIcon')
    );
  });
});
