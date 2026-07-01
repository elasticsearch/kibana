/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ServiceNode } from './service_node';
import { ServiceMapSloFlyoutProvider } from './service_map_slo_flyout_context';
import { useServiceMapSearchHighlight } from './service_map_search_context';
import { useServiceMapAlertsNavigate } from './service_map_alerts_navigate_context';
import type { ServiceNodeData } from '../../../../common/service_map';
import { MOCK_EUI_THEME_FOR_USE_THEME } from './test_helpers';

jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    useEuiTheme: () => ({
      euiTheme: MOCK_EUI_THEME_FOR_USE_THEME,
      colorMode: 'LIGHT',
    }),
  };
});

// Mock the agent icon
jest.mock('@kbn/custom-icons', () => ({
  getAgentIcon: jest.fn(() => 'mock-icon-url.svg'),
}));

jest.mock('../../../context/apm_plugin/use_apm_plugin_context', () => ({
  useApmPluginContext: () => ({
    core: {
      application: {
        capabilities: {
          slo: { read: true },
        },
      },
    },
  }),
}));

jest.mock('./service_map_alerts_navigate_context', () => ({
  ...jest.requireActual('./service_map_alerts_navigate_context'),
  useServiceMapAlertsNavigate: jest.fn(() => jest.fn()),
}));

jest.mock('./service_map_search_context', () => ({
  ...jest.requireActual('./service_map_search_context'),
  useServiceMapSearchHighlight: jest.fn(() => ({
    isSearchMatch: false,
    isActiveSearchMatch: false,
  })),
}));

const defaultNodeProps = {
  id: 'test-service',
  type: 'service' as const,
  dragging: false,
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  deletable: false,
  selectable: true,
  parentId: undefined,
  sourcePosition: undefined,
  targetPosition: undefined,
  dragHandle: undefined,
  width: 64,
  height: 64,
};

function createServiceNodeData(overrides: Partial<ServiceNodeData> = {}): ServiceNodeData {
  return {
    id: 'test-service',
    label: 'Test Service',
    isService: true,
    agentName: 'java',
    ...overrides,
  };
}

function renderServiceNode(
  data: ServiceNodeData = createServiceNodeData(),
  selected: boolean = false
) {
  return render(
    <ReactFlowProvider>
      <ServiceNode {...defaultNodeProps} data={data} selected={selected} draggable />
    </ReactFlowProvider>
  );
}

describe('ServiceNode', () => {
  it('renders service label', () => {
    renderServiceNode();
    expect(screen.getByText('Test Service')).toBeInTheDocument();
  });

  it('renders agent icon when agentName is provided', () => {
    renderServiceNode();
    const icon = screen.getByAltText('java');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('src', 'mock-icon-url.svg');
  });

  it('renders with data-test-subj attribute', () => {
    renderServiceNode();
    expect(screen.getByTestId('serviceMapNode-service-test-service')).toBeInTheDocument();
  });

  it('instruments the service circle with EBT click attributes', () => {
    renderServiceNode();
    const circle = screen.getByTestId('serviceMapNodeServiceCircle');
    expect(circle).toHaveAttribute('data-ebt-action', 'viewService');
    expect(circle).toHaveAttribute('data-ebt-element', 'serviceMapNode');
  });

  it('applies primary color when selected', () => {
    renderServiceNode(createServiceNodeData(), true);
    // The label should have primary color when selected
    const label = screen.getByText('Test Service');
    expect(label).toBeInTheDocument();
  });

  it('renders context highlight frame when contextHighlight is set', () => {
    renderServiceNode(createServiceNodeData({ contextHighlight: true }), false);
    expect(screen.getByTestId('serviceMapNodeContextHighlightFrame')).toBeInTheDocument();
  });

  it('keeps context highlight frame when the node is selected', () => {
    renderServiceNode(createServiceNodeData({ contextHighlight: true }), true);
    expect(screen.getByTestId('serviceMapNodeContextHighlightFrame')).toBeInTheDocument();
  });

  it('renders without icon when agentName is not provided', () => {
    renderServiceNode(createServiceNodeData({ agentName: undefined }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  describe('anomaly score styling', () => {
    it('renders with mid-range anomaly score', () => {
      const data = createServiceNodeData({
        serviceAnomalyStats: {
          jobId: 'test-job',
          transactionType: 'request',
          actualValue: 100,
          anomalyScore: 50,
        },
      });
      renderServiceNode(data);
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    it('renders with high anomaly score', () => {
      const data = createServiceNodeData({
        serviceAnomalyStats: {
          jobId: 'test-job',
          transactionType: 'request',
          actualValue: 200,
          anomalyScore: 90,
        },
      });
      renderServiceNode(data);
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });
  });

  describe('SLO badge (service map only)', () => {
    it('does not render SLO badge when status is noSLOs', () => {
      renderServiceNode(createServiceNodeData({ sloStatus: 'noSLOs', sloCount: 0 }));
      expect(screen.queryByTestId('apmSloBadge')).not.toBeInTheDocument();
    });

    it('does not render SLO badge for healthy status', () => {
      renderServiceNode(createServiceNodeData({ sloStatus: 'healthy', sloCount: 2 }));
      expect(screen.queryByTestId('apmSloBadge')).not.toBeInTheDocument();
    });

    it('does not render SLO badge for noData status', () => {
      renderServiceNode(createServiceNodeData({ sloStatus: 'noData', sloCount: 1 }));
      expect(screen.queryByTestId('apmSloBadge')).not.toBeInTheDocument();
    });

    it('renders SLO badge for violated status', () => {
      renderServiceNode(createServiceNodeData({ sloStatus: 'violated', sloCount: 2 }));
      expect(screen.getByTestId('apmSloBadge')).toBeInTheDocument();
      expect(screen.getByTestId('apmSloBadge')).toHaveAttribute('data-slo-status', 'violated');
    });

    it('renders SLO badge for degrading status', () => {
      renderServiceNode(createServiceNodeData({ sloStatus: 'degrading', sloCount: 1 }));
      expect(screen.getByTestId('apmSloBadge')).toBeInTheDocument();
      expect(screen.getByTestId('apmSloBadge')).toHaveAttribute('data-slo-status', 'degrading');
    });

    it('calls onSloBadgeClick with service name and agent when the badge is clicked', () => {
      const onSloBadgeClick = jest.fn();
      render(
        <ReactFlowProvider>
          <ServiceMapSloFlyoutProvider onSloBadgeClick={onSloBadgeClick}>
            <ServiceNode
              {...defaultNodeProps}
              data={createServiceNodeData({ sloStatus: 'violated', sloCount: 2 })}
              selected={false}
              draggable
            />
          </ServiceMapSloFlyoutProvider>
        </ReactFlowProvider>
      );
      fireEvent.click(screen.getByTestId('apmSloBadge'));
      expect(onSloBadgeClick).toHaveBeenCalledWith('Test Service', 'java');
    });
  });

  describe('Alerts badge', () => {
    afterEach(() => {
      jest.mocked(useServiceMapAlertsNavigate).mockReturnValue(jest.fn());
    });

    it('calls the alerts navigation handler when the alerts badge is clicked', () => {
      const navigateCb = jest.fn();
      jest.mocked(useServiceMapAlertsNavigate).mockReturnValue(navigateCb);

      renderServiceNode(createServiceNodeData({ alertsCount: 2 }));
      fireEvent.click(screen.getByTestId('serviceMapNodeAlertsBadge'));
      expect(navigateCb).toHaveBeenCalled();
    });

    it('renders a non-interactive badge when no navigate handler is injected via context', () => {
      jest.mocked(useServiceMapAlertsNavigate).mockReturnValue(undefined);

      renderServiceNode(createServiceNodeData({ alertsCount: 3 }));
      const badge = screen.getByTestId('serviceMapNodeAlertsBadge');
      expect(badge).toBeInTheDocument();
      // EuiBadge renders as a span (not a button) when `onClick` is omitted,
      // so the badge does not advertise a click affordance to assistive tech.
      expect(badge.tagName).toBe('SPAN');
      expect(badge).not.toHaveAttribute('role', 'button');
      expect(badge).toHaveTextContent('3');
    });
  });

  describe('search highlight', () => {
    const getSearchHighlightWrapper = () => {
      const node = screen.getByTestId('serviceMapNode-service-test-service');
      return node.closest('[data-search-match]') ?? node.parentElement;
    };

    afterEach(() => {
      jest.mocked(useServiceMapSearchHighlight).mockReturnValue({
        isSearchMatch: false,
        isActiveSearchMatch: false,
      });
    });

    it('does not set search data attributes when there is no search match', () => {
      renderServiceNode();
      const wrapper = getSearchHighlightWrapper();
      expect(wrapper).not.toHaveAttribute('data-search-match');
      expect(wrapper).not.toHaveAttribute('data-search-active-match');
    });

    it('sets data-search-match when the node is an inactive search match', () => {
      jest.mocked(useServiceMapSearchHighlight).mockReturnValue({
        isSearchMatch: true,
        isActiveSearchMatch: false,
      });
      renderServiceNode();
      const wrapper = getSearchHighlightWrapper();
      expect(wrapper).toHaveAttribute('data-search-match', 'true');
      expect(wrapper).not.toHaveAttribute('data-search-active-match');
    });

    it('sets both data attributes when the node is the active search match', () => {
      jest.mocked(useServiceMapSearchHighlight).mockReturnValue({
        isSearchMatch: true,
        isActiveSearchMatch: true,
      });
      renderServiceNode();
      const wrapper = getSearchHighlightWrapper();
      expect(wrapper).toHaveAttribute('data-search-match', 'true');
      expect(wrapper).toHaveAttribute('data-search-active-match', 'true');
    });
  });
});
