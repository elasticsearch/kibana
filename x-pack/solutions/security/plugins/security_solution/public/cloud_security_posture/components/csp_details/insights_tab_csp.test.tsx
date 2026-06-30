/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestProviders } from '../../../common/mock/test_providers';
import { useExpandableFlyoutState } from '@kbn/expandable-flyout';
import { InsightsTabCsp } from './insights_tab_csp';
import { CspInsightLeftPanelSubTab } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import type { CloudPostureEntityIdentifier } from '../entity_insight';
import type { ExpandableFlyoutState } from '@kbn/expandable-flyout';

const mockOpenPreviewPanel = jest.fn();

// Mock the child components. Each exposes a clickable element that invokes the navigation
// callback owned by `InsightsTabCsp`, so the lifted `openPreviewPanel` logic can be asserted.
jest.mock('./misconfiguration_findings_details_table', () => ({
  MisconfigurationFindingsDetailsTable: ({
    onShowFinding,
  }: {
    onShowFinding: (resourceId: string, ruleId: string) => void;
  }) => (
    <button
      type="button"
      data-test-subj="misconfiguration-table"
      onClick={() => onShowFinding('resource-1', 'rule-1')}
    >
      {'Misconfiguration Table'}
    </button>
  ),
}));

jest.mock('./vulnerabilities_findings_details_table', () => ({
  VulnerabilitiesFindingsDetailsTable: ({
    onShowVulnerability,
  }: {
    onShowVulnerability: (params: {
      vulnerabilityId: string;
      resourceId: string;
      packageName: string;
      packageVersion: string;
      eventId: string;
    }) => void;
  }) => (
    <button
      type="button"
      data-test-subj="vulnerabilities-table"
      onClick={() =>
        onShowVulnerability({
          vulnerabilityId: 'CVE-1',
          resourceId: 'resource-1',
          packageName: 'pkg',
          packageVersion: '1.0.0',
          eventId: 'event-1',
        })
      }
    >
      {'Vulnerabilities Table'}
    </button>
  ),
}));

jest.mock('./alerts_findings_details_table', () => ({
  AlertsDetailsTable: ({
    onShowAlert,
  }: {
    onShowAlert: (eventId: string, indexName: string) => void;
  }) => (
    <button
      type="button"
      data-test-subj="alerts-table"
      onClick={() => onShowAlert('alert-1', 'index-1')}
    >
      {'Alerts Table'}
    </button>
  ),
}));

// Mock the expandable flyout hooks
jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutState: jest.fn(),
  useExpandableFlyoutApi: jest.fn(() => ({ openPreviewPanel: mockOpenPreviewPanel })),
}));

const mockUseExpandableFlyoutState = useExpandableFlyoutState as jest.MockedFunction<
  typeof useExpandableFlyoutState
>;

describe('InsightsTabCsp', () => {
  const defaultProps = {
    value: 'test-value',
    field: 'hostName' as CloudPostureEntityIdentifier,
    scopeId: 'test-scope',
  };

  const mockPanels = {
    left: {
      params: {
        hasMisconfigurationFindings: false,
        hasVulnerabilitiesFindings: false,
        hasNonClosedAlerts: false,
        path: { subTab: undefined },
      },
    },
  } as const;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseExpandableFlyoutState.mockReturnValue(mockPanels as unknown as ExpandableFlyoutState);
  });

  describe('when no tabs are available', () => {
    it('should return null', () => {
      const { container } = render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('when only one tab is available', () => {
    it('should render button group as disabled for misconfigurations only', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: false,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      const buttonGroup = screen.getByTestId('insightButtonGroupsTestId');
      expect(buttonGroup).toBeInTheDocument();
      expect(buttonGroup).toHaveAttribute('disabled');

      // Should show misconfiguration table
      expect(screen.getByTestId('misconfiguration-table')).toBeInTheDocument();
    });

    it('should render button group as disabled for vulnerabilities only', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: false,
            hasVulnerabilitiesFindings: true,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      const buttonGroup = screen.getByTestId('insightButtonGroupsTestId');
      expect(buttonGroup).toBeInTheDocument();
      expect(buttonGroup).toHaveAttribute('disabled');

      // Should show vulnerabilities table
      expect(screen.getByTestId('vulnerabilities-table')).toBeInTheDocument();
    });

    it('should render button group as disabled for alerts only', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: false,
            hasVulnerabilitiesFindings: false,
            hasNonClosedAlerts: true,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      const buttonGroup = screen.getByTestId('insightButtonGroupsTestId');
      expect(buttonGroup).toBeInTheDocument();
      expect(buttonGroup).toHaveAttribute('disabled');

      // Should show alerts table
      expect(screen.getByTestId('alerts-table')).toBeInTheDocument();
    });

    it('should not allow tab changes when disabled', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: false,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      const buttonGroup = screen.getByTestId('insightButtonGroupsTestId');
      expect(buttonGroup).toHaveAttribute('disabled');

      // Clicking should not change the active tab (no state change)
      const misconfigurationButton = screen.getByTestId('misconfigurationTabDataTestId');
      fireEvent.click(misconfigurationButton);

      // Should still show misconfiguration table (no change)
      expect(screen.getByTestId('misconfiguration-table')).toBeInTheDocument();
    });
  });

  describe('when multiple tabs are available', () => {
    it('should render button group as enabled for misconfigurations and vulnerabilities', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: true,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      const buttonGroup = screen.getByTestId('insightButtonGroupsTestId');
      expect(buttonGroup).toBeInTheDocument();
      expect(buttonGroup).not.toHaveAttribute('disabled');

      // Should show misconfiguration table by default (first available)
      expect(screen.getByTestId('misconfiguration-table')).toBeInTheDocument();
    });

    it('should allow tab switching between multiple tabs', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: true,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      // Initially should show misconfiguration table
      expect(screen.getByTestId('misconfiguration-table')).toBeInTheDocument();
      expect(screen.queryByTestId('vulnerabilities-table')).not.toBeInTheDocument();

      // Click vulnerabilities tab
      const vulnerabilitiesButton = screen.getByTestId('vulnerabilitiesTabDataTestId');
      fireEvent.click(vulnerabilitiesButton);

      // Should now show vulnerabilities table
      expect(screen.getByTestId('vulnerabilities-table')).toBeInTheDocument();
      expect(screen.queryByTestId('misconfiguration-table')).not.toBeInTheDocument();
    });

    it('should render all three tabs when all are available', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: true,
            hasNonClosedAlerts: true,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      const buttonGroup = screen.getByTestId('insightButtonGroupsTestId');
      expect(buttonGroup).toBeInTheDocument();
      expect(buttonGroup).not.toHaveAttribute('disabled');

      // Should show all three buttons
      expect(screen.getByTestId('misconfigurationTabDataTestId')).toBeInTheDocument();
      expect(screen.getByTestId('vulnerabilitiesTabDataTestId')).toBeInTheDocument();
      expect(screen.getByTestId('alertsTabDataTestId')).toBeInTheDocument();
    });

    it('should switch to alerts tab when clicked', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: true,
            hasNonClosedAlerts: true,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      // Click alerts tab
      const alertsButton = screen.getByTestId('alertsTabDataTestId');
      fireEvent.click(alertsButton);

      // Should show alerts table
      expect(screen.getByTestId('alerts-table')).toBeInTheDocument();
      expect(screen.queryByTestId('misconfiguration-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('vulnerabilities-table')).not.toBeInTheDocument();
    });
  });

  describe('when subTab is provided in path', () => {
    it('should use the provided subTab as default', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: true,
            hasNonClosedAlerts: false,
            path: { subTab: CspInsightLeftPanelSubTab.VULNERABILITIES },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      // Should show vulnerabilities table based on provided subTab
      expect(screen.getByTestId('vulnerabilities-table')).toBeInTheDocument();
      expect(screen.queryByTestId('misconfiguration-table')).not.toBeInTheDocument();
    });
  });

  describe('navigation callbacks', () => {
    it('opens the alert preview panel when the alerts table requests navigation', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: false,
            hasVulnerabilitiesFindings: false,
            hasNonClosedAlerts: true,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      fireEvent.click(screen.getByTestId('alerts-table'));

      expect(mockOpenPreviewPanel).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            id: 'alert-1',
            indexName: 'index-1',
            isPreviewMode: true,
          }),
        })
      );
    });

    it('opens the misconfiguration preview panel with the scopeId when requested', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: false,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      fireEvent.click(screen.getByTestId('misconfiguration-table'));

      expect(mockOpenPreviewPanel).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            resourceId: 'resource-1',
            ruleId: 'rule-1',
            scopeId: 'test-scope',
            isPreviewMode: true,
          }),
        })
      );
    });

    it('opens the vulnerability preview panel with the scopeId when requested', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: false,
            hasVulnerabilitiesFindings: true,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      fireEvent.click(screen.getByTestId('vulnerabilities-table'));

      expect(mockOpenPreviewPanel).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            vulnerabilityId: 'CVE-1',
            resourceId: 'resource-1',
            eventId: 'event-1',
            scopeId: 'test-scope',
            isPreviewMode: true,
          }),
        })
      );
    });
  });

  describe('accessibility', () => {
    it('should have proper legend for screen readers', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: false,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      const buttonGroup = screen.getByTestId('insightButtonGroupsTestId');
      // EuiButtonGroup uses legend prop which creates a fieldset with legend element
      expect(buttonGroup).toBeInTheDocument();
    });

    it('should maintain disabled state accessibility when single tab', () => {
      mockUseExpandableFlyoutState.mockReturnValue({
        left: {
          params: {
            hasMisconfigurationFindings: true,
            hasVulnerabilitiesFindings: false,
            hasNonClosedAlerts: false,
            path: { subTab: undefined },
          },
        },
      } as unknown as ExpandableFlyoutState);

      render(
        <TestProviders>
          <InsightsTabCsp {...defaultProps} />
        </TestProviders>
      );

      const buttonGroup = screen.getByTestId('insightButtonGroupsTestId');
      expect(buttonGroup).toHaveAttribute('disabled');
    });
  });
});
