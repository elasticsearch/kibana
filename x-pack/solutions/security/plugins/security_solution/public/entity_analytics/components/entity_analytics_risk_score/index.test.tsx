/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../common/mock';
import { EntityAnalyticsRiskScores } from '.';
import { EntityType, EntityTypeToIdentifierField } from '../../../../common/entity_analytics/types';
import type { SeverityCount } from '../severity/types';
import { useKibana as mockUseKibana } from '../../../common/lib/kibana/__mocks__';
import { createTelemetryServiceMock } from '../../../common/lib/telemetry/telemetry_service.mock';
import { useRiskScore } from '../../api/hooks/use_risk_score';
import { useRiskScoreKpi } from '../../api/hooks/use_risk_score_kpi';
import { useEntityStoreRiskScore } from '../../api/hooks/use_entity_store_risk_score';
import { useEntityStoreRiskScoreKpi } from '../../api/hooks/use_entity_store_risk_score_kpi';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { RiskSeverity } from '../../../../common/search_strategy';
import { capitalize } from 'lodash/fp';

const mockedTelemetry = createTelemetryServiceMock();
const mockedUseKibana = mockUseKibana();
jest.mock('../../../common/lib/kibana', () => {
  const original = jest.requireActual('../../../common/lib/kibana');

  return {
    ...original,
    useKibana: () => ({
      ...mockedUseKibana,
      services: {
        ...mockedUseKibana.services,
        telemetry: mockedTelemetry,
      },
    }),
  };
});

const mockSeverityCount: SeverityCount = {
  [RiskSeverity.Low]: 1,
  [RiskSeverity.High]: 1,
  [RiskSeverity.Moderate]: 1,
  [RiskSeverity.Unknown]: 1,
  [RiskSeverity.Critical]: 1,
};

const mockUseQueryToggle = jest
  .fn()
  .mockReturnValue({ toggleStatus: false, setToggleStatus: jest.fn() });
jest.mock('../../../common/containers/query_toggle', () => {
  return {
    useQueryToggle: () => mockUseQueryToggle(),
  };
});
const defaultProps: {
  data: unknown[] | undefined;
  inspect: unknown;
  refetch: () => void;
  hasEngineBeenInstalled: boolean;
  isAuthorized: boolean;
  loading: boolean;
} = {
  data: undefined,
  inspect: null,
  refetch: () => {},
  hasEngineBeenInstalled: true,
  isAuthorized: true,
  loading: false,
};
const mockUseRiskScore = useRiskScore as jest.Mock;
const mockUseRiskScoreKpi = useRiskScoreKpi as jest.Mock;
const mockUseEntityStoreRiskScore = useEntityStoreRiskScore as jest.Mock;
const mockUseEntityStoreRiskScoreKpi = useEntityStoreRiskScoreKpi as jest.Mock;
jest.mock('../../api/hooks/use_risk_score');
jest.mock('../../api/hooks/use_risk_score_kpi');
jest.mock('../../api/hooks/use_entity_store_risk_score');
jest.mock('../../api/hooks/use_entity_store_risk_score_kpi');

const mockOpenAlertsPageWithFilters = jest.fn();
jest.mock('../../../common/hooks/use_navigate_to_alerts_page_with_filters', () => {
  return {
    useNavigateToAlertsPageWithFilters: () => mockOpenAlertsPageWithFilters,
  };
});

const mockOpenRightPanel = jest.fn();
jest.mock('@kbn/expandable-flyout');

describe.each([EntityType.host, EntityType.user, EntityType.service])(
  'EntityAnalyticsRiskScores entityType: %s',
  (riskEntity) => {
    beforeEach(() => {
      (useExpandableFlyoutApi as jest.Mock).mockReturnValue({
        openRightPanel: mockOpenRightPanel,
      });
      jest.clearAllMocks();
      mockUseRiskScoreKpi.mockReturnValue({
        severityCount: mockSeverityCount,
        loading: false,
        refetch: jest.fn(),
        inspect: { dsl: [], response: [] },
      });
      mockUseRiskScore.mockReturnValue(defaultProps);
      mockUseEntityStoreRiskScoreKpi.mockReturnValue({
        severityCount: mockSeverityCount,
        loading: false,
        refetch: jest.fn(),
        inspect: { dsl: [], response: [] },
      });
      mockUseEntityStoreRiskScore.mockReturnValue(defaultProps);
    });

    // host/user use useEntityStoreRiskScore; service still uses useRiskScore.
    const setRiskScoreReturn = (value: typeof defaultProps & { data?: unknown }) => {
      mockUseRiskScore.mockReturnValue(value);
      mockUseEntityStoreRiskScore.mockReturnValue(value);
    };
    const setRiskScoreKpiReturn = (value: { severityCount: SeverityCount; loading: boolean }) => {
      mockUseRiskScoreKpi.mockReturnValue(value);
      mockUseEntityStoreRiskScoreKpi.mockReturnValue(value);
    };

    it('renders enable button when module is disable', () => {
      setRiskScoreReturn({ ...defaultProps, hasEngineBeenInstalled: false });
      const { getByTestId } = render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      expect(getByTestId(`enable_risk_score`)).toBeInTheDocument();
    });

    it("doesn't render enable button when module is enable", () => {
      const { queryByTestId } = render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      expect(queryByTestId(`enable_risk_score`)).not.toBeInTheDocument();
    });

    it('renders no data detected component when engine is installed, no severity filter, and data is empty', () => {
      mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
      setRiskScoreReturn({
        ...defaultProps,
        hasEngineBeenInstalled: true,
        data: [],
      });
      setRiskScoreKpiReturn({
        severityCount: mockSeverityCount,
        loading: false,
      });

      const { getByTestId } = render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      expect(getByTestId(`${riskEntity}-risk-score-no-data-detected`)).toBeInTheDocument();
    });

    it('does not render no data detected when data exists', () => {
      mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
      const data = [
        {
          '@timestamp': '1234567899',
          [riskEntity]: {
            name: 'testName',
            risk: {
              rule_risks: [],
              calculated_level: RiskSeverity.High,
              calculated_score_norm: 75,
              multipliers: [],
            },
          },
        },
      ];
      setRiskScoreReturn({
        ...defaultProps,
        hasEngineBeenInstalled: true,
        data,
      });
      setRiskScoreKpiReturn({
        severityCount: mockSeverityCount,
        loading: false,
      });

      const { queryByTestId } = render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      expect(queryByTestId(`${riskEntity}-risk-score-no-data-detected`)).not.toBeInTheDocument();
    });

    const isHostOrUser = riskEntity === EntityType.host || riskEntity === EntityType.user;
    const activeRiskScoreMock = isHostOrUser ? mockUseEntityStoreRiskScore : mockUseRiskScore;

    it('queries when toggleStatus is true', () => {
      mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
      render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      expect(activeRiskScoreMock.mock.calls[0][0].skip).toEqual(false);
    });

    it('skips query when toggleStatus is false', () => {
      mockUseQueryToggle.mockReturnValue({ toggleStatus: false, setToggleStatus: jest.fn() });
      render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );
      expect(activeRiskScoreMock.mock.calls[0][0].skip).toEqual(true);
    });

    it('renders components when toggleStatus is true', () => {
      mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
      const { queryByTestId } = render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      expect(queryByTestId('entity_analytics_content')).toBeInTheDocument();
    });

    it('does not render components when toggleStatus is false', () => {
      mockUseQueryToggle.mockReturnValue({ toggleStatus: false, setToggleStatus: jest.fn() });
      const { queryByTestId } = render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      expect(queryByTestId('entity_analytics_content')).not.toBeInTheDocument();
    });

    it('renders alerts count', async () => {
      mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
      setRiskScoreKpiReturn({
        severityCount: mockSeverityCount,
        loading: false,
      });
      const alertsCount = 999;
      const data = [
        {
          '@timestamp': '1234567899',
          [riskEntity]: {
            name: 'testUsername',
            risk: {
              rule_risks: [],
              calculated_level: RiskSeverity.High,
              calculated_score_norm: 75,
              multipliers: [],
            },
          },
          alertsCount,
        },
      ];
      setRiskScoreReturn({ ...defaultProps, data });

      const { queryByTestId } = render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(queryByTestId('risk-score-alerts')).toHaveTextContent(alertsCount.toString());
      });
    });

    it('navigates to alerts page with filters when alerts count is clicked', async () => {
      mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
      setRiskScoreKpiReturn({
        severityCount: mockSeverityCount,
        loading: false,
      });
      const name = 'testName';
      const data = [
        {
          '@timestamp': '1234567899',
          [riskEntity]: {
            name,
            risk: {
              rule_risks: [],
              calculated_level: RiskSeverity.High,
              calculated_score_norm: 75,
              multipliers: [],
            },
          },
          alertsCount: 999,
        },
      ];
      setRiskScoreReturn({ ...defaultProps, data });

      const { getByTestId } = render(
        <TestProviders>
          <EntityAnalyticsRiskScores riskEntity={riskEntity} />
        </TestProviders>
      );

      fireEvent.click(getByTestId('risk-score-alerts'));

      await waitFor(() => {
        expect(mockOpenAlertsPageWithFilters.mock.calls[0][0]).toEqual([
          {
            title: capitalize(riskEntity),
            field_name: EntityTypeToIdentifierField[riskEntity],
            selected_options: [name],
          },
        ]);
      });
    });

    // Skip service entity test while it doesn't has a flyout
    (riskEntity === EntityType.service ? it.skip : it)(
      'opens the expandable flyout when entity name is clicked',
      async () => {
        mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
        mockUseRiskScoreKpi.mockReturnValue({
          severityCount: mockSeverityCount,
          loading: false,
        });
        const name = 'testName';
        const data = [
          {
            '@timestamp': '1234567899',
            [riskEntity]: {
              name,
              risk: {
                rule_risks: [],
                calculated_level: RiskSeverity.High,
                calculated_score_norm: 75,
                multipliers: [],
              },
            },
            alertsCount: 0,
          },
        ];
        setRiskScoreReturn({ ...defaultProps, data });

        const { getByTestId, queryByTestId } = render(
          <TestProviders>
            <EntityAnalyticsRiskScores riskEntity={riskEntity} />
          </TestProviders>
        );

        await waitFor(() => {
          expect(queryByTestId('loadingPanelRiskScore')).not.toBeInTheDocument();
        });

        const detailsButton = getByTestId(
          riskEntity === EntityType.host ? `host-details-button` : `users-link-anchor`
        );

        fireEvent.click(detailsButton);

        await waitFor(() => {
          expect(mockOpenRightPanel).toHaveBeenCalledWith({
            id: `${riskEntity}-panel`,
            params: {
              [riskEntity === EntityType.host ? `hostName` : `userName`]: 'testName',
              contextID: 'entity-risk-score-table',
              scopeId: 'entity-risk-score-table',
            },
          });
        });
      }
    );
  }
);
