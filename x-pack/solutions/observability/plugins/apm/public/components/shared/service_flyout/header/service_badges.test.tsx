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
import { ServiceBadges } from './service_badges';

const mockNavigateToUrl = jest.fn();
const mockUseApmPluginContext = jest.fn();
jest.mock('../../../../context/apm_plugin/use_apm_plugin_context', () => ({
  useApmPluginContext: () => mockUseApmPluginContext(),
}));

const mockUseServiceBadgesData = jest.fn();
jest.mock('../hooks/use_service_badges_data', () => ({
  useServiceBadgesData: (...args: unknown[]) => mockUseServiceBadgesData(...args),
}));

jest.mock('../hooks/use_service_links', () => ({
  useServiceLinks: () => ({
    overviewHref: '/app/apm/overview-href',
    alertsHref: '/app/apm/alerts-href',
  }),
}));

const mockUseManageSlosUrl = jest.fn();
jest.mock('../../../../hooks/use_manage_slos_url', () => ({
  useManageSlosUrl: (...args: unknown[]) => mockUseManageSlosUrl(...args),
}));

const baseNodeData: ServiceNodeData = {
  id: 'opbeans-java',
  label: 'opbeans-java',
  isService: true,
  agentName: 'java',
};

function setupContext({ canReadSlos = true }: { canReadSlos?: boolean } = {}) {
  mockUseApmPluginContext.mockReturnValue({
    core: {
      application: {
        navigateToUrl: mockNavigateToUrl,
        capabilities: { slo: { read: canReadSlos } },
      },
    },
  });
}

function setupBadgesData({
  alertsCount,
  anomalyScore,
}: { alertsCount?: number; anomalyScore?: number } = {}) {
  mockUseServiceBadgesData.mockReturnValue({ alertsCount, anomalyScore });
}

function renderBadges({ service = baseNodeData }: { service?: ServiceNodeData } = {}) {
  return render(
    <IntlProvider locale="en">
      <ServiceBadges
        service={service}
        environment="production"
        kuery=""
        rangeFrom="now-15m"
        rangeTo="now"
      />
    </IntlProvider>
  );
}

describe('ServiceBadges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseManageSlosUrl.mockReturnValue('/app/slos/slos-href');
  });

  it('always renders the service badge', () => {
    setupContext();
    setupBadgesData();
    renderBadges();
    expect(screen.getByTestId('serviceFlyoutServiceBadge')).toBeInTheDocument();
  });

  describe('alerts badge', () => {
    it('shows the alerts count and navigates to the alerts tab on click', () => {
      setupContext();
      setupBadgesData({ alertsCount: 3 });
      renderBadges();

      const badge = screen.getByTestId('serviceFlyoutAlertsBadge');
      expect(badge).toHaveTextContent('3');

      expect(badge).toHaveAttribute('data-ebt-action', 'viewAlerts');
      expect(badge).toHaveAttribute('data-ebt-element', 'serviceFlyoutAlertsBadge');

      fireEvent.click(badge);
      expect(mockNavigateToUrl).toHaveBeenCalledWith('/app/apm/alerts-href');
    });

    it('hides the alerts badge when the hook returns no count', () => {
      setupContext();
      setupBadgesData({ alertsCount: undefined });
      renderBadges();

      expect(screen.queryByTestId('serviceFlyoutAlertsBadge')).not.toBeInTheDocument();
    });
  });

  describe('SLO badge', () => {
    it('shows the SLO badge from node data and navigates to the SLO list on click', () => {
      setupContext();
      setupBadgesData();
      renderBadges({ service: { ...baseNodeData, sloStatus: 'violated', sloCount: 2 } });

      const badge = screen.getByTestId('apmSloBadge');
      expect(badge).toHaveAttribute('data-slo-status', 'violated');
      expect(badge).toHaveAttribute('data-ebt-action', 'viewSlos');
      expect(badge).toHaveAttribute('data-ebt-element', 'serviceFlyoutSloBadge');

      fireEvent.click(badge);
      expect(mockNavigateToUrl).toHaveBeenCalledWith('/app/slos/slos-href');
    });

    it('shows the "No SLOs" badge when the node has no SLO status', () => {
      setupContext();
      setupBadgesData();
      renderBadges({ service: { ...baseNodeData, sloStatus: undefined } });

      const badge = screen.getByTestId('apmSloBadge');

      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('data-slo-status', 'noSLOs');
    });

    it('hides the SLO badge when the user cannot read SLOs', () => {
      setupContext({ canReadSlos: false });
      setupBadgesData();
      renderBadges({ service: { ...baseNodeData, sloStatus: 'violated', sloCount: 1 } });

      expect(screen.queryByTestId('apmSloBadge')).not.toBeInTheDocument();
    });
  });

  describe('anomaly badge', () => {
    it('shows the anomaly badge when the hook returns a score', () => {
      setupContext();
      setupBadgesData({ anomalyScore: 75 });
      renderBadges();

      expect(screen.getByTestId('serviceFlyoutAnomaliesBadge')).toBeInTheDocument();
    });

    it('hides the anomaly badge when the hook returns no score', () => {
      setupContext();
      setupBadgesData({ anomalyScore: undefined });
      renderBadges();

      expect(screen.queryByTestId('serviceFlyoutAnomaliesBadge')).not.toBeInTheDocument();
    });
  });
});
