/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { useMisconfigurationPreview } from '@kbn/cloud-security-posture/src/hooks/use_misconfiguration_preview';
import { UserEntityOverview, USER_PREVIEW_BANNER } from './user_entity_overview';
import { UserPreviewPanelKey } from '../../../../flyout/entity_details/user_right';
import type { UserEntity } from '../../../../../common/api/entity_analytics';
import {
  ENTITIES_USER_OVERVIEW_ALERT_COUNT_TEST_ID,
  ENTITIES_USER_OVERVIEW_DOMAIN_TEST_ID,
  ENTITIES_USER_OVERVIEW_LINK_TEST_ID,
  ENTITIES_USER_OVERVIEW_LOADING_TEST_ID,
  ENTITIES_USER_OVERVIEW_MISCONFIGURATIONS_TEST_ID,
  ENTITIES_USER_OVERVIEW_RISK_LEVEL_TEST_ID,
  INSIGHTS_ALERTS_COUNT_NAVIGATION_BUTTON_TEST_ID,
} from './test_ids';
import { mockContextValue } from '../../../../flyout/document_details/shared/mocks/mock_context';
import { mockDataFormattedForFieldBrowser } from '../../../../flyout/document_details/shared/mocks/mock_data_formatted_for_field_browser';
import { useRiskScore } from '../../../../entity_analytics/api/hooks/use_risk_score';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { mockFlyoutApi } from '../../../../flyout/document_details/shared/mocks/mock_flyout_context';
import { useAlertsByStatus } from '../../../../overview/components/detection_response/alerts_by_status/use_alerts_by_status';
import { createTelemetryServiceMock } from '../../../../common/lib/telemetry/telemetry_service.mock';

const userName = 'user';
const identityFields = { 'user.name': userName };
const domain = 'n54bg2lfc7';
const from = '2022-04-05T12:00:00.000Z';
const to = '2022-04-08T12:00:00.000Z';
const userEntityRecord = { user: { domain: [domain] } } as unknown as UserEntity;
const riskLevel = [{ user: { risk: { calculated_level: 'Moderate' } } }];

const panelContextValue = {
  ...mockContextValue,
  dataFormattedForFieldBrowser: mockDataFormattedForFieldBrowser,
};

jest.mock('@kbn/expandable-flyout');
jest.mock('@kbn/cloud-security-posture/src/hooks/use_misconfiguration_preview');

jest.mock('../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn().mockReturnValue(false),
}));

const mockedTelemetry = createTelemetryServiceMock();
jest.mock('../../../../common/lib/kibana', () => {
  const originalModule = jest.requireActual('../../../../common/lib/kibana');
  return {
    ...originalModule,
    useKibana: () => ({ services: { telemetry: mockedTelemetry } }),
  };
});

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useLocation: jest.fn().mockReturnValue({ pathname: '' }) };
});

jest.mock(
  '../../../../overview/components/detection_response/alerts_by_status/use_alerts_by_status'
);
const mockAlertData = {
  open: {
    total: 2,
    severities: [
      { key: 'high', value: 1, label: 'High' },
      { key: 'low', value: 1, label: 'Low' },
    ],
  },
};

const mockUseGlobalTime = jest.fn().mockReturnValue({ from, to });
jest.mock('../../../../common/containers/use_global_time', () => {
  return {
    useGlobalTime: (...props: unknown[]) => mockUseGlobalTime(...props),
  };
});

const mockUseRiskScore = useRiskScore as jest.Mock;
jest.mock('../../../../entity_analytics/api/hooks/use_risk_score');

const renderUserEntityOverview = (
  extraProps: Partial<React.ComponentProps<typeof UserEntityOverview>> = {}
) =>
  render(
    <TestProviders>
      <UserEntityOverview
        userName={userName}
        identityFields={identityFields}
        scopeId={panelContextValue.scopeId}
        {...extraProps}
      />
    </TestProviders>
  );

describe('<UserEntityOverview />', () => {
  beforeAll(() => {
    jest.mocked(useExpandableFlyoutApi).mockReturnValue(mockFlyoutApi);
    (useMisconfigurationPreview as jest.Mock).mockReturnValue({});
    (useAlertsByStatus as jest.Mock).mockReturnValue({ isLoading: false, items: {} });
  });

  describe('entity data', () => {
    it('should render user domain and user risk level', () => {
      mockUseRiskScore.mockReturnValue({ data: riskLevel });

      const { getByTestId } = renderUserEntityOverview({ entityRecord: userEntityRecord });

      expect(getByTestId(ENTITIES_USER_OVERVIEW_DOMAIN_TEST_ID)).toHaveTextContent(domain);
      expect(getByTestId(ENTITIES_USER_OVERVIEW_RISK_LEVEL_TEST_ID)).toHaveTextContent('Moderate');
    });

    it('should render correctly if returned data is null', () => {
      mockUseRiskScore.mockReturnValue({ data: null });

      const { getByTestId } = renderUserEntityOverview();

      expect(getByTestId(ENTITIES_USER_OVERVIEW_DOMAIN_TEST_ID)).toHaveTextContent('—');
      expect(getByTestId(ENTITIES_USER_OVERVIEW_RISK_LEVEL_TEST_ID)).toHaveTextContent('—');
    });

    it('should render loading if risk score returns loading as true', () => {
      mockUseRiskScore.mockReturnValue({ data: null, loading: true });

      const { getByTestId, queryByTestId } = render(
        <TestProviders>
          <UserEntityOverview
            userName={userName}
            identityFields={identityFields}
            scopeId={panelContextValue.scopeId}
          />
        </TestProviders>
      );
      expect(getByTestId(ENTITIES_USER_OVERVIEW_LOADING_TEST_ID)).toBeInTheDocument();
      expect(queryByTestId(ENTITIES_USER_OVERVIEW_DOMAIN_TEST_ID)).not.toBeInTheDocument();
    });

    it('renders the user name as plain text by default (Flyout v2 / Discover)', () => {
      mockUseRiskScore.mockReturnValue({ data: riskLevel });

      const { getByTestId } = renderUserEntityOverview();

      const container = getByTestId(ENTITIES_USER_OVERVIEW_LINK_TEST_ID);
      expect(container).toHaveTextContent(userName);
      expect(container.querySelector('a, button')).toBeNull();
      container.click();
      expect(mockFlyoutApi.openPreviewPanel).not.toHaveBeenCalled();
    });

    it('opens user preview when clicking on title with enableEntityLinks', () => {
      mockUseRiskScore.mockReturnValue({ data: riskLevel });

      const { getByTestId } = render(
        <TestProviders>
          <UserEntityOverview
            userName={userName}
            identityFields={identityFields}
            scopeId={panelContextValue.scopeId}
            enableEntityLinks
          />
        </TestProviders>
      );

      getByTestId(ENTITIES_USER_OVERVIEW_LINK_TEST_ID).click();
      expect(mockFlyoutApi.openPreviewPanel).toHaveBeenCalledWith({
        id: UserPreviewPanelKey,
        params: {
          contextID: panelContextValue.scopeId,
          userName,
          scopeId: panelContextValue.scopeId,
          banner: USER_PREVIEW_BANNER,
          entityId: undefined,
        },
      });
    });
  });

  describe('distribution bar insights', () => {
    beforeEach(() => {
      mockUseRiskScore.mockReturnValue({ data: riskLevel });
    });

    it('should not render if no data is available', () => {
      const { queryByTestId } = renderUserEntityOverview();
      expect(
        queryByTestId(ENTITIES_USER_OVERVIEW_MISCONFIGURATIONS_TEST_ID)
      ).not.toBeInTheDocument();
      expect(queryByTestId(ENTITIES_USER_OVERVIEW_ALERT_COUNT_TEST_ID)).not.toBeInTheDocument();
    });

    it('should render alert count when data is available', () => {
      (useAlertsByStatus as jest.Mock).mockReturnValue({
        isLoading: false,
        items: mockAlertData,
      });

      const { getByTestId } = renderUserEntityOverview();
      expect(getByTestId(ENTITIES_USER_OVERVIEW_ALERT_COUNT_TEST_ID)).toBeInTheDocument();
    });

    it('opens user alert details when clicking alert count with enableEntityLinks', () => {
      (useAlertsByStatus as jest.Mock).mockReturnValue({
        isLoading: false,
        items: mockAlertData,
      });
      mockFlyoutApi.openFlyout.mockClear();

      const { getByTestId } = render(
        <TestProviders>
          <UserEntityOverview
            userName={userName}
            identityFields={identityFields}
            scopeId={panelContextValue.scopeId}
            enableEntityLinks
          />
        </TestProviders>
      );

      getByTestId(INSIGHTS_ALERTS_COUNT_NAVIGATION_BUTTON_TEST_ID).click();
      expect(mockFlyoutApi.openFlyout).toHaveBeenCalledWith(
        expect.objectContaining({
          left: expect.objectContaining({
            params: expect.objectContaining({
              path: {
                tab: 'csp_insights',
                subTab: 'alertsTabId',
              },
            }),
          }),
        })
      );
    });

    it('should render misconfiguration when data is available', () => {
      (useMisconfigurationPreview as jest.Mock).mockReturnValue({
        data: { count: { passed: 1, failed: 2 } },
      });

      const { getByTestId } = renderUserEntityOverview();
      expect(getByTestId(ENTITIES_USER_OVERVIEW_MISCONFIGURATIONS_TEST_ID)).toBeInTheDocument();
    });
  });
});
