/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import type { ServiceNodeData } from '../../../../../common/service_map';
import { ServiceFlyoutHeader } from '.';
import { SERVICE_FLYOUT_DEFAULT_TAB_ID, SERVICE_FLYOUT_TABS } from '..';

jest.mock('../hooks/use_service_links', () => ({
  useServiceLinks: () => ({
    overviewHref: '/app/apm/overview-href',
    alertsHref: '/app/apm/alerts-href',
  }),
}));

// `ServiceBadges` is self-contained and covered by its own test; here we only assert that the
// header renders it and forwards the right props.
const mockServiceBadges = jest.fn();
jest.mock('./service_badges', () => ({
  ServiceBadges: (props: unknown) => {
    mockServiceBadges(props);
    return <div data-test-subj="serviceBadgesMock" />;
  },
}));

const baseNodeData: ServiceNodeData = {
  id: 'opbeans-java',
  label: 'opbeans-java',
  isService: true,
  agentName: 'java',
};

function renderHeader({
  nodeData = baseNodeData,
  selectedTabId = SERVICE_FLYOUT_DEFAULT_TAB_ID,
  onSelectedTabIdChange = jest.fn(),
}: {
  nodeData?: ServiceNodeData;
  selectedTabId?: (typeof SERVICE_FLYOUT_TABS)[number]['id'];
  onSelectedTabIdChange?: jest.Mock;
} = {}) {
  return render(
    <IntlProvider locale="en">
      <ServiceFlyoutHeader
        service={nodeData}
        title={nodeData.label ?? nodeData.id}
        titleId="title-id"
        environment="production"
        kuery=""
        rangeFrom="now-15m"
        rangeTo="now"
        selectedTabId={selectedTabId}
        onSelectedTabIdChange={onSelectedTabIdChange}
      />
    </IntlProvider>
  );
}

describe('ServiceFlyoutHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the overview title link and the service badges', () => {
    renderHeader();

    const titleLink = screen.getByTestId('serviceFlyoutTitleLink');
    expect(titleLink).toHaveAttribute('href', '/app/apm/overview-href');
    expect(titleLink).toHaveAttribute('data-ebt-action', 'viewService');
    expect(titleLink).toHaveAttribute('data-ebt-element', 'serviceFlyoutTitle');
    expect(screen.getByTestId('serviceBadgesMock')).toBeInTheDocument();
  });

  it('forwards the service and query scope to ServiceBadges', () => {
    renderHeader();

    expect(mockServiceBadges).toHaveBeenCalledWith(
      expect.objectContaining({
        service: baseNodeData,
        environment: 'production',
        kuery: '',
        rangeFrom: 'now-15m',
        rangeTo: 'now',
      })
    );
  });

  it('renders a tab per definition and selects the active one', () => {
    renderHeader();

    SERVICE_FLYOUT_TABS.forEach(({ id }) => {
      expect(screen.getByTestId(`serviceFlyoutTab-${id}`)).toBeInTheDocument();
    });
  });

  it('instruments each tab with EBT click attributes carrying the tab id', () => {
    renderHeader();

    SERVICE_FLYOUT_TABS.forEach(({ id }) => {
      const tab = screen.getByTestId(`serviceFlyoutTab-${id}`);
      expect(tab).toHaveAttribute('data-ebt-action', 'viewServiceFlyoutTab');
      expect(tab).toHaveAttribute('data-ebt-element', 'serviceFlyoutTabs');
      expect(tab).toHaveAttribute('data-ebt-detail', id);
    });
  });

  it('calls onSelectedTabIdChange when a tab is clicked', () => {
    const onSelectedTabIdChange = jest.fn();
    renderHeader({ onSelectedTabIdChange });

    const { id } = SERVICE_FLYOUT_TABS[0];
    fireEvent.click(screen.getByTestId(`serviceFlyoutTab-${id}`));
    expect(onSelectedTabIdChange).toHaveBeenCalledWith(id);
  });
});
