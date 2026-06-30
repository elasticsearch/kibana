/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../../../common/mock';
import { times } from 'lodash/fp';
import { EXPAND_ALERT_TEST_ID, RiskInputsTab } from './risk_inputs_tab';
import { alertInputDataMock } from '../../mocks';
import { RiskSeverity } from '../../../../../../common/search_strategy';
import { EntityType } from '../../../../../../common/entity_analytics/types';
import {
  EntityDetailsLeftPanelTab,
  RiskScoreLeftPanelSubTab,
} from '../../../../../flyout/entity_details/shared/components/left_panel/left_panel_header';

const mockUseRiskContributingAlerts = jest.fn().mockReturnValue({ loading: false, data: [] });
const mockGetEuidFromObject = jest.fn().mockReturnValue('user:entity-1');

jest.mock('../../../../hooks/use_risk_contributing_alerts', () => ({
  useRiskContributingAlerts: () => mockUseRiskContributingAlerts(),
}));

jest.mock('@kbn/entity-store/public', () => ({
  useEntityStoreEuidApi: () => ({
    euid: {
      getEuidFromObject: (...args: unknown[]) => mockGetEuidFromObject(...args),
    },
  }),
}));

const mockUseUiSetting = jest.fn().mockReturnValue([false]);

jest.mock('@kbn/kibana-react-plugin/public', () => {
  const original = jest.requireActual('@kbn/kibana-react-plugin/public');
  return {
    ...original,
    useUiSetting$: () => mockUseUiSetting(),
  };
});

const mockUseRiskScore = jest.fn().mockReturnValue({ loading: false, data: [] });

jest.mock('../../../../api/hooks/use_risk_score', () => ({
  useRiskScore: (params: unknown) => mockUseRiskScore(params),
}));

const mockUseGetWatchlists = jest.fn().mockReturnValue({ data: [] });

jest.mock('../../../../api/hooks/use_get_watchlists', () => ({
  useGetWatchlists: () => mockUseGetWatchlists(),
}));

const mockUseResolutionGroup = jest.fn().mockReturnValue({ data: undefined });

jest.mock('../../../entity_resolution/hooks/use_resolution_group', () => ({
  useResolutionGroup: (entityId: string) => mockUseResolutionGroup(entityId),
}));

const mockUseStableExpandableFlyoutState = jest.fn().mockReturnValue({});

jest.mock('../../../../../flyout/shared/hooks/use_stable_expandable_flyout_state', () => ({
  useStableExpandableFlyoutState: () => mockUseStableExpandableFlyoutState(),
}));

const mockOpenPreviewPanel = jest.fn();
const mockOnShowAlert = jest.fn();

jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: () => ({ openPreviewPanel: mockOpenPreviewPanel }),
  useExpandableFlyoutState: () => ({}),
  useExpandableFlyoutHistory: () => [],
  ExpandableFlyout: () => null,
}));

const riskScore = {
  '@timestamp': '2021-08-19T16:00:00.000Z',
  user: {
    name: 'elastic',
    risk: {
      rule_risks: [],
      calculated_score_norm: 100,
      multipliers: [],
      calculated_level: RiskSeverity.Critical,
    },
  },
};

const riskScoreWithAssetCriticalityContribution = (contribution: number) => {
  const score = JSON.parse(JSON.stringify(riskScore));
  score.user.risk.modifiers = [
    {
      type: 'asset_criticality',
      contribution,
      metadata: {
        criticality_level: 'high_impact',
      },
    },
  ];
  score.user.risk.category_2_score = contribution; // Keep for backwards compatibility
  return score;
};

describe('RiskInputsTab', () => {
  const isResolutionFilter = (params?: { filterQuery?: unknown }): boolean => {
    const filters = (
      params?.filterQuery as
        | {
            bool?: { filter?: Array<{ term?: Record<string, string> }> };
          }
        | undefined
    )?.bool?.filter;

    if (!Array.isArray(filters)) {
      return false;
    }

    return filters.some((clause) => Object.values(clause.term ?? {}).includes('resolution'));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEuidFromObject.mockReturnValue('user:entity-1');
    mockUseResolutionGroup.mockReturnValue({ data: undefined });
    mockUseGetWatchlists.mockReturnValue({ data: [] });
    mockUseStableExpandableFlyoutState.mockReturnValue({});
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown; skip?: boolean }) =>
      params?.skip
        ? {
            loading: false,
            error: false,
            data: [],
          }
        : isResolutionFilter(params)
        ? {
            loading: false,
            error: false,
            data: [],
          }
        : {
            loading: false,
            error: false,
            data: [riskScore],
          }
    );
  });

  it('renders', () => {
    mockUseRiskContributingAlerts.mockReturnValue({
      loading: false,
      error: false,
      data: [alertInputDataMock],
    });
    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScore],
    });

    const { getByTestId, queryByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );

    expect(queryByTestId('risk-input-asset-criticality-title')).not.toBeInTheDocument();
    expect(getByTestId('risk-input-table-description-cell')).toHaveTextContent('Rule Name');
  });

  it('Does not render the context section if enabled but no asset criticality', () => {
    mockUseUiSetting.mockReturnValue([true]);

    const { queryByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );

    expect(queryByTestId('risk-input-asset-criticality-title')).not.toBeInTheDocument();
  });

  it('Renders the context section if enabled and risks contains asset criticality', () => {
    mockUseUiSetting.mockReturnValue([true]);

    const riskScoreWithAssetCriticality = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
          criticality_level: 'extreme_impact',
          modifiers: [
            {
              type: 'asset_criticality',
              contribution: 5,
              metadata: {
                criticality_level: 'extreme_impact',
              },
            },
          ],
        },
      },
    };

    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScoreWithAssetCriticality],
    });

    const { queryByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );

    expect(queryByTestId('risk-input-contexts-title')).toBeInTheDocument();
  });

  it('it renders alert preview button', () => {
    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScore],
    });
    mockUseRiskContributingAlerts.mockReturnValue({
      loading: false,
      error: false,
      data: [alertInputDataMock],
    });

    const { getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );

    expect(getByTestId(EXPAND_ALERT_TEST_ID)).toBeInTheDocument();
  });

  it('Displays 0.00 for the asset criticality contribution if the contribution value is less than -0.01', () => {
    mockUseUiSetting.mockReturnValue([true]);

    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScoreWithAssetCriticalityContribution(-0.0000001)],
    });

    const { getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );
    const contextsTable = getByTestId('risk-input-contexts-table');
    expect(contextsTable).not.toHaveTextContent('-0.00');
    expect(contextsTable).toHaveTextContent('0.00');
  });

  it('Displays 0.00 for the asset criticality contribution if the contribution value is less than 0.01', () => {
    mockUseUiSetting.mockReturnValue([true]);

    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScoreWithAssetCriticalityContribution(0.0000001)],
    });

    const { getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );
    const contextsTable = getByTestId('risk-input-contexts-table');
    expect(contextsTable).not.toHaveTextContent('+0.00');
    expect(contextsTable).toHaveTextContent('0.00');
  });

  it('Adds a plus to positive asset criticality contribution scores', () => {
    mockUseUiSetting.mockReturnValue([true]);

    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScoreWithAssetCriticalityContribution(2.22)],
    });

    const { getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );

    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('+2.22');
  });

  it('shows extra alerts contribution message', () => {
    const alerts = times(
      (number) => ({
        ...alertInputDataMock,
        _id: number.toString(),
      }),
      11
    );

    mockUseRiskContributingAlerts.mockReturnValue({
      loading: false,
      error: false,
      data: alerts,
    });
    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScore],
    });

    const { queryByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );

    expect(queryByTestId('risk-input-extra-alerts-message')).toBeInTheDocument();
  });

  it('does not show score view toggle without resolution score', () => {
    const { queryByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    expect(queryByTestId('risk-input-score-view-toggle')).not.toBeInTheDocument();
  });

  it('does not show score view toggle when resolution group has a single member', () => {
    const resolutionRiskScore = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
        },
      },
    };

    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: { id: 'user:elastic', name: 'elastic', attributes: { watchlists: [] } },
        },
        aliases: [],
        group_size: 1,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown }) =>
      isResolutionFilter(params)
        ? {
            loading: false,
            error: false,
            data: [resolutionRiskScore],
          }
        : {
            loading: false,
            error: false,
            data: [riskScore],
          }
    );

    const { queryByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    expect(queryByTestId('risk-input-score-view-toggle')).not.toBeInTheDocument();
  });

  it('shows score view toggle and switches to resolution contributions', () => {
    const resolutionRiskScore = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
          category_1_count: 2,
          category_1_score: 11,
          modifiers: [
            {
              type: 'watchlist',
              contribution: 1.25,
              metadata: { watchlist_id: 'wl-123' },
            },
          ],
          inputs: [
            {
              ...alertInputDataMock.input,
              id: 'resolution-alert-id',
            },
          ],
        },
      },
    };

    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: { id: 'user:elastic', name: 'elastic', attributes: { watchlists: [] } },
          asset: { criticality: 'high_impact' },
        },
        aliases: [
          {
            entity: {
              id: 'user:entity-1',
              name: 'entity-1',
              attributes: { watchlists: ['wl-123'] },
            },
            asset: { criticality: 'extreme_impact' },
          },
        ],
        group_size: 2,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown }) =>
      isResolutionFilter(params)
        ? {
            loading: false,
            error: false,
            data: [resolutionRiskScore],
          }
        : {
            loading: false,
            error: false,
            data: [riskScore],
          }
    );

    mockUseRiskContributingAlerts.mockReturnValue({
      loading: false,
      error: false,
      data: [alertInputDataMock],
    });

    const { getByTestId, getByText } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    expect(getByTestId('risk-input-score-view-toggle')).toBeInTheDocument();

    fireEvent.click(getByText('Resolution group risk score'));

    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('Entity');
    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('entity-1');
    expect(getByTestId('risk-input-alert-title').parentElement).toHaveTextContent('Entity');
    expect(getByTestId('risk-input-table-description-cell')).toHaveTextContent('Rule Name');
  });

  it('shows entity attribution for alerts in resolution view', () => {
    const resolutionRiskScore = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
          category_1_count: 1,
          category_1_score: 10,
          inputs: [{ ...alertInputDataMock.input, id: 'resolution-alert-id' }],
        },
      },
    };

    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: { id: 'user:elastic', name: 'elastic', attributes: { watchlists: [] } },
        },
        aliases: [
          {
            entity: { id: 'user:entity-1', name: 'entity-1', attributes: { watchlists: [] } },
          },
        ],
        group_size: 2,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown }) =>
      isResolutionFilter(params)
        ? {
            loading: false,
            error: false,
            data: [resolutionRiskScore],
          }
        : {
            loading: false,
            error: false,
            data: [riskScore],
          }
    );
    mockUseRiskContributingAlerts.mockReturnValue({
      loading: false,
      error: false,
      data: [{ ...alertInputDataMock, _id: 'resolution-alert-id' }],
    });

    const { getByText, getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    fireEvent.click(getByText('Resolution group risk score'));

    expect(getByTestId('risk-input-alert-title').parentElement).toHaveTextContent('entity-1');
  });

  it('shows entity attribution for context rows in resolution view', () => {
    const resolutionRiskScore = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
          modifiers: [
            {
              type: 'asset_criticality',
              contribution: 4.5,
              metadata: { criticality_level: 'high_impact' },
            },
            {
              type: 'watchlist',
              contribution: 2.5,
              metadata: { watchlist_id: 'wl-123' },
            },
          ],
          category_1_count: 1,
          category_1_score: 10,
          inputs: [{ ...alertInputDataMock.input, id: 'resolution-alert-id' }],
        },
      },
    };

    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: {
            id: 'user:elastic',
            name: 'elastic',
            attributes: { watchlists: ['wl-123'] },
          },
          asset: { criticality: 'high_impact' },
        },
        aliases: [
          {
            entity: {
              id: 'user:entity-1',
              name: 'entity-1',
              attributes: { watchlists: ['wl-123'] },
            },
            asset: { criticality: 'medium_impact' },
          },
        ],
        group_size: 2,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown }) =>
      isResolutionFilter(params)
        ? {
            loading: false,
            error: false,
            data: [resolutionRiskScore],
          }
        : {
            loading: false,
            error: false,
            data: [riskScore],
          }
    );

    const { getByText, getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    fireEvent.click(getByText('Resolution group risk score'));

    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('Entity');
    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('elastic');
    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('entity-1');
  });

  it('initializes to resolution view when flyout state subTab is "resolution"', () => {
    mockUseStableExpandableFlyoutState.mockReturnValue({
      left: {
        params: {
          path: {
            tab: EntityDetailsLeftPanelTab.RISK_INPUTS,
            subTab: RiskScoreLeftPanelSubTab.RESOLUTION,
          },
        },
      },
    });
    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: { id: 'user:elastic', name: 'elastic', attributes: { watchlists: [] } },
        },
        aliases: [
          {
            entity: { id: 'user:entity-1', name: 'entity-1', attributes: { watchlists: [] } },
          },
        ],
        group_size: 2,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown; skip?: boolean }) =>
      params?.skip
        ? { loading: false, error: false, data: [] }
        : { loading: false, error: false, data: [riskScore] }
    );

    const { getByRole } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    expect(getByRole('button', { name: 'Resolution group risk score' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('auto-switches to resolution view when there is no entity risk score but a resolution score exists', () => {
    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: { id: 'user:elastic', name: 'elastic', attributes: { watchlists: [] } },
        },
        aliases: [
          {
            entity: { id: 'user:entity-1', name: 'entity-1', attributes: { watchlists: [] } },
          },
        ],
        group_size: 2,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown; skip?: boolean }) =>
      params?.skip
        ? { loading: false, error: false, data: [] }
        : isResolutionFilter(params)
        ? { loading: false, error: false, data: [riskScore] }
        : { loading: false, error: false, data: [] }
    );

    const { getByRole } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    expect(getByRole('button', { name: 'Resolution group risk score' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches from entity view to resolution view and back', () => {
    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: { id: 'user:elastic', name: 'elastic', attributes: { watchlists: [] } },
        },
        aliases: [
          {
            entity: { id: 'user:entity-1', name: 'entity-1', attributes: { watchlists: [] } },
          },
        ],
        group_size: 2,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown; skip?: boolean }) =>
      params?.skip
        ? { loading: false, error: false, data: [] }
        : isResolutionFilter(params)
        ? { loading: false, error: false, data: [riskScore] }
        : { loading: false, error: false, data: [riskScore] }
    );

    const { getByText, getByRole, getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    expect(getByTestId('risk-input-score-view-toggle')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Entity risk score' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(getByRole('button', { name: 'Resolution group risk score' }));
    expect(getByRole('button', { name: 'Resolution group risk score' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(getByText('Entity risk score'));
    expect(getByRole('button', { name: 'Entity risk score' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('content changes when switching between entity and resolution views', () => {
    const entityScore = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
          modifiers: [
            { type: 'watchlist', contribution: 5, metadata: { watchlist_id: 'wl-entity' } },
          ],
        },
      },
    };
    const resolutionScore = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
          modifiers: [
            { type: 'watchlist', contribution: 3, metadata: { watchlist_id: 'wl-resolution' } },
          ],
        },
      },
    };

    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: { id: 'user:elastic', name: 'elastic', attributes: { watchlists: [] } },
        },
        aliases: [
          {
            entity: { id: 'user:entity-1', name: 'entity-1', attributes: { watchlists: [] } },
          },
        ],
        group_size: 2,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown; skip?: boolean }) =>
      params?.skip
        ? { loading: false, error: false, data: [] }
        : isResolutionFilter(params)
        ? { loading: false, error: false, data: [resolutionScore] }
        : { loading: false, error: false, data: [entityScore] }
    );

    const { getByText, getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('wl-entity');
    expect(getByTestId('risk-input-contexts-table')).not.toHaveTextContent('wl-resolution');

    fireEvent.click(getByText('Resolution group risk score'));

    expect(getByTestId('risk-input-contexts-table')).not.toHaveTextContent('wl-entity');
    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('wl-resolution');
  });

  it('user tab selection overrides initial subTab from URL', () => {
    mockUseStableExpandableFlyoutState.mockReturnValue({
      left: {
        params: {
          path: {
            tab: EntityDetailsLeftPanelTab.RISK_INPUTS,
            subTab: RiskScoreLeftPanelSubTab.RESOLUTION,
          },
        },
      },
    });
    mockUseResolutionGroup.mockReturnValue({
      data: {
        target: {
          entity: { id: 'user:elastic', name: 'elastic', attributes: { watchlists: [] } },
        },
        aliases: [
          {
            entity: { id: 'user:entity-1', name: 'entity-1', attributes: { watchlists: [] } },
          },
        ],
        group_size: 2,
      },
    });
    mockUseRiskScore.mockImplementation((params?: { filterQuery?: unknown; skip?: boolean }) =>
      params?.skip
        ? { loading: false, error: false, data: [] }
        : { loading: false, error: false, data: [riskScore] }
    );

    const { getByRole } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
          entityId="user:elastic"
        />
      </TestProviders>
    );

    expect(getByRole('button', { name: 'Resolution group risk score' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(getByRole('button', { name: 'Entity risk score' }));

    expect(getByRole('button', { name: 'Entity risk score' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('renders watchlist modifiers in context section', () => {
    const riskScoreWithWatchlistModifier = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
          modifiers: [
            {
              type: 'watchlist',
              contribution: 8.75,
              metadata: {
                watchlist_id: 'wl-123',
              },
            },
          ],
        },
      },
    };

    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScoreWithWatchlistModifier],
    });

    const { getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );

    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('Watchlist');
    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('wl-123');
    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('+8.75');
  });

  it('renders custom watchlist name from watchlists API data', () => {
    mockUseGetWatchlists.mockReturnValue({
      data: [{ id: 'wl-123', name: 'High Risk Vendors', managed: false, riskModifier: 1.5 }],
    });

    const riskScoreWithWatchlistModifier = {
      '@timestamp': '2021-08-19T16:00:00.000Z',
      user: {
        name: 'elastic',
        risk: {
          ...riskScore.user.risk,
          modifiers: [
            {
              type: 'watchlist',
              contribution: 2.5,
              metadata: {
                watchlist_id: 'wl-123',
              },
            },
          ],
        },
      },
    };

    mockUseRiskScore.mockReturnValue({
      loading: false,
      error: false,
      data: [riskScoreWithWatchlistModifier],
    });

    const { getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={mockOnShowAlert}
        />
      </TestProviders>
    );

    expect(getByTestId('risk-input-contexts-table')).toHaveTextContent('High Risk Vendors');
  });
});

describe('RiskInputsTab - alert preview navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStableExpandableFlyoutState.mockReturnValue({});
    mockUseGetWatchlists.mockReturnValue({ data: [] });
    mockUseResolutionGroup.mockReturnValue({ data: undefined });
    mockUseRiskScore.mockReturnValue({ loading: false, error: false, data: [riskScore] });
    mockUseRiskContributingAlerts.mockReturnValue({
      loading: false,
      error: false,
      data: [alertInputDataMock],
    });
  });

  it('invokes the provided onShowAlert callback with the row identifiers', () => {
    const onShowAlert = jest.fn();
    const { getByTestId } = render(
      <TestProviders>
        <RiskInputsTab
          entityType={EntityType.user}
          entityName="elastic"
          onShowAlert={onShowAlert}
        />
      </TestProviders>
    );

    fireEvent.click(getByTestId(EXPAND_ALERT_TEST_ID));

    expect(onShowAlert).toHaveBeenCalledWith('test-id', 'test-index');
  });
});
