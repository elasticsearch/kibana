/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnomalyDetectorType } from '@kbn/apm-types';
import type { ServiceNodeData } from '../../../../common/service_map';
import { ServiceMapPopoverTitleBadges } from './service_map_popover_title_badges';

const mockNavigateToUrl = jest.fn();

jest.mock('../../../context/apm_plugin/use_apm_plugin_context', () => ({
  useApmPluginContext: () => ({
    core: {
      application: { capabilities: { slo: { read: true } }, navigateToUrl: mockNavigateToUrl },
    },
  }),
}));

jest.mock('../../shared/service_map/service_map_slo_flyout_context', () => ({
  useServiceMapSloFlyout: () => ({ onSloBadgeClick: undefined }),
}));

jest.mock('./use_service_map_alerts_tab_href', () => ({
  useServiceMapAlertsTabNavigate: () => jest.fn(),
}));

jest.mock('../../../hooks/use_apm_router', () => ({
  useApmRouter: () => ({
    link: (path: string, { query }: { query?: Record<string, string> } = {}) => {
      const search = new URLSearchParams(query).toString();
      return search ? `/app/apm${path}?${search}` : `/app/apm${path}`;
    },
  }),
}));

const mockUseApmRoutePath = jest.fn(() => '/services/{serviceName}/service-map');
jest.mock('../../../hooks/use_apm_route_path', () => ({
  useApmRoutePath: () => mockUseApmRoutePath(),
}));

jest.mock('../../../hooks/use_apm_params', () => ({
  useAnyOfApmParams: () => ({
    query: {
      rangeFrom: 'now-15m',
      rangeTo: 'now',
      environment: 'ENVIRONMENT_ALL',
      kuery: 'service.name : "test-service"',
      comparisonEnabled: false,
      serviceGroup: '',
    },
  }),
}));

jest.mock('../../shared/slo_status_badge', () => ({
  SloStatusBadge: () => <div data-test-subj="apmSloBadge" />,
}));

function serviceNodeData(overrides?: Partial<ServiceNodeData>): ServiceNodeData {
  return {
    id: 'test-service',
    label: 'test-service',
    isService: true,
    ...overrides,
  };
}

describe('ServiceMapPopoverTitleBadges', () => {
  beforeEach(() => {
    mockNavigateToUrl.mockClear();
    mockUseApmRoutePath.mockReturnValue('/services/{serviceName}/service-map');
  });

  it('renders nothing when there are no alerts, SLO issues, or anomalies', () => {
    const { container } = render(<ServiceMapPopoverTitleBadges nodeData={serviceNodeData()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('navigates to the service overview tab via SPA navigation when the anomalies badge is clicked', () => {
    render(
      <ServiceMapPopoverTitleBadges
        nodeData={serviceNodeData({
          serviceAnomalyStats: {
            anomalyScore: 90,
            detectorType: AnomalyDetectorType.txFailureRate,
          },
        })}
      />
    );

    const badge = screen.getByTestId('apmAnomaliesBadge');
    expect(badge).toBeInTheDocument();

    fireEvent.click(badge);
    expect(mockNavigateToUrl).toHaveBeenCalledWith(
      expect.stringContaining('/app/apm/services/{serviceName}/overview')
    );
  });

  it('redirects to the mobile-services overview tab when on a mobile service map route', () => {
    mockUseApmRoutePath.mockReturnValue('/mobile-services/{serviceName}/service-map');

    render(
      <ServiceMapPopoverTitleBadges
        nodeData={serviceNodeData({
          serviceAnomalyStats: {
            anomalyScore: 90,
            detectorType: AnomalyDetectorType.txFailureRate,
          },
        })}
      />
    );

    fireEvent.click(screen.getByTestId('apmAnomaliesBadge'));
    expect(mockNavigateToUrl).toHaveBeenCalledWith(
      expect.stringContaining('/app/apm/mobile-services/{serviceName}/overview')
    );
  });

  it('strips the map kuery filter from the anomalies redirect URL', () => {
    render(
      <ServiceMapPopoverTitleBadges
        nodeData={serviceNodeData({
          serviceAnomalyStats: {
            anomalyScore: 90,
            detectorType: AnomalyDetectorType.txFailureRate,
          },
        })}
      />
    );

    fireEvent.click(screen.getByTestId('apmAnomaliesBadge'));

    const navigatedUrl = mockNavigateToUrl.mock.calls[0][0] as string;
    const kuery = new URLSearchParams(navigatedUrl.split('?')[1]).get('kuery');
    expect(kuery).toBe('');
  });

  it('renders the anomalies badge alongside the alerts badge in the same row', () => {
    render(
      <ServiceMapPopoverTitleBadges
        nodeData={serviceNodeData({
          alertsCount: 2,
          serviceAnomalyStats: { anomalyScore: 90 },
        })}
      />
    );

    expect(screen.getByTestId('serviceMapPopoverAlertsBadge')).toBeInTheDocument();
    expect(screen.getByTestId('apmAnomaliesBadge')).toBeInTheDocument();
  });
});
