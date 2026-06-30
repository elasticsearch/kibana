/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../common/mock';
import { mockHostRiskScoreState, mockObservedHostData, mockHostEntityRiskScores } from '../mocks';
import type {
  ExpandableFlyoutApi,
  ExpandableFlyoutState,
  FlyoutPanelHistory,
} from '@kbn/expandable-flyout';
import {
  useExpandableFlyoutApi,
  useExpandableFlyoutHistory,
  useExpandableFlyoutState,
} from '@kbn/expandable-flyout';
import type { HostPanelProps } from '.';
import { HostPanel } from '.';

const mockProps: HostPanelProps = {
  hostName: 'test',
  contextID: 'test-host -panel',
  scopeId: 'test-scope-id',
  isPreviewMode: false,
};

jest.mock('../../../common/components/visualization_actions/visualization_embeddable');

const mockedHostRiskScore = jest.fn().mockReturnValue(mockHostRiskScoreState);
jest.mock('../../../entity_analytics/api/hooks/use_risk_score', () => ({
  useRiskScore: () => mockedHostRiskScore(),
}));

const mockedUseEntityRiskScores = jest.fn();
jest.mock('../../../entity_analytics/api/hooks/use_entity_risk_scores', () => ({
  useEntityRiskScores: () => mockedUseEntityRiskScores(),
}));

const mockedUseObservedHost = jest.fn().mockReturnValue(mockObservedHostData);

jest.mock('../../../flyout_v2/entity/host/main/hooks/use_observed_host', () => ({
  useObservedHost: () => mockedUseObservedHost(),
}));

const flyoutContextValue = {
  closeLeftPanel: jest.fn(),
} as unknown as ExpandableFlyoutApi;

const flyoutHistory: FlyoutPanelHistory[] = [
  { lastOpen: Date.now(), panel: { id: 'id1', params: {} } },
];
jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: jest.fn(),
  useExpandableFlyoutHistory: jest.fn(),
  useExpandableFlyoutState: jest.fn(),
}));

describe('HostPanel', () => {
  beforeEach(() => {
    mockedHostRiskScore.mockReturnValue(mockHostRiskScoreState);
    mockedUseObservedHost.mockReturnValue(mockObservedHostData);
    mockedUseEntityRiskScores.mockReturnValue(mockHostEntityRiskScores);
    jest.mocked(useExpandableFlyoutHistory).mockReturnValue(flyoutHistory);
    jest.mocked(useExpandableFlyoutState).mockReturnValue({} as unknown as ExpandableFlyoutState);
    jest.mocked(useExpandableFlyoutApi).mockReturnValue(flyoutContextValue);
  });

  it('renders', () => {
    const { getByTestId, queryByTestId } = render(
      <TestProviders>
        <HostPanel {...mockProps} />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header')).toBeInTheDocument();
    expect(queryByTestId('securitySolutionFlyoutLoading')).not.toBeInTheDocument();
    expect(getByTestId('securitySolutionFlyoutNavigationExpandDetailButton')).toBeInTheDocument();
    expect(queryByTestId('host-preview-footer')).not.toBeInTheDocument();
  });

  it('renders loading state when observed host is loading', () => {
    mockedUseObservedHost.mockReturnValue({
      ...mockObservedHostData,
      isLoading: true,
    });

    const { getByTestId, queryByTestId } = render(
      <TestProviders>
        <HostPanel {...mockProps} />
      </TestProviders>
    );

    expect(queryByTestId('securitySolutionFlyoutLoading')).not.toBeInTheDocument();
    expect(getByTestId('observedDataSectionLoadingSpinner')).toBeInTheDocument();
  });

  it('renders preview panel', () => {
    const { getByTestId, queryByTestId } = render(
      <TestProviders>
        <HostPanel {...mockProps} isPreviewMode />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header')).toBeInTheDocument();
    expect(getByTestId('host-preview-footer')).toBeInTheDocument();
    expect(queryByTestId('securitySolutionFlyoutLoading')).not.toBeInTheDocument();
    expect(
      queryByTestId('securitySolutionFlyoutNavigationExpandDetailButton')
    ).not.toBeInTheDocument();
  });
});
