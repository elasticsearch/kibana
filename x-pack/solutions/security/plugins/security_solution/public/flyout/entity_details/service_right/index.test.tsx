/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../common/mock';
import type { ServicePanelProps } from '.';
import { ServicePanel } from '.';
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
import { mockObservedService } from './mocks';
import { mockServiceRiskScoreState, mockServiceEntityRiskScores } from '../mocks';

const mockProps: ServicePanelProps = {
  serviceName: 'test',
  entityId: 'test-entity-id',
  contextID: 'test-service-panel',
  scopeId: 'test-scope-id',
};

jest.mock('../../../common/components/visualization_actions/visualization_embeddable');

const mockedUseRiskScore = jest.fn().mockReturnValue(mockServiceRiskScoreState);
jest.mock('../../../entity_analytics/api/hooks/use_risk_score', () => ({
  useRiskScore: () => mockedUseRiskScore(),
}));

const mockedUseEntityRiskScores = jest.fn();
jest.mock('../../../entity_analytics/api/hooks/use_entity_risk_scores', () => ({
  useEntityRiskScores: () => mockedUseEntityRiskScores(),
}));

const mockedUseObservedService = jest.fn().mockReturnValue(mockObservedService);

jest.mock('./hooks/use_observed_service', () => ({
  useObservedService: () => mockedUseObservedService(),
}));

const mockedUseIsExperimentalFeatureEnabled = jest.fn().mockReturnValue(true);
jest.mock('../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: () => mockedUseIsExperimentalFeatureEnabled(),
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

describe('ServicePanel', () => {
  beforeEach(() => {
    mockedUseRiskScore.mockReturnValue(mockServiceRiskScoreState);
    mockedUseObservedService.mockReturnValue(mockObservedService);
    mockedUseEntityRiskScores.mockReturnValue(mockServiceEntityRiskScores);
    jest.mocked(useExpandableFlyoutHistory).mockReturnValue(flyoutHistory);
    jest.mocked(useExpandableFlyoutState).mockReturnValue({} as unknown as ExpandableFlyoutState);
    jest.mocked(useExpandableFlyoutApi).mockReturnValue(flyoutContextValue);
  });

  it('renders', () => {
    const { getByTestId, queryByTestId } = render(
      <TestProviders>
        <ServicePanel {...mockProps} />
      </TestProviders>
    );

    expect(getByTestId('service-panel-header')).toBeInTheDocument();
    expect(queryByTestId('securitySolutionFlyoutLoading')).not.toBeInTheDocument();
    expect(getByTestId('securitySolutionFlyoutNavigationExpandDetailButton')).toBeInTheDocument();
  });

  it('renders loading state when observed service is loading', () => {
    mockedUseObservedService.mockReturnValue({
      ...mockObservedService,
      isLoading: true,
    });

    const { getByTestId } = render(
      <TestProviders>
        <ServicePanel {...mockProps} />
      </TestProviders>
    );

    expect(getByTestId('securitySolutionFlyoutLoading')).toBeInTheDocument();
  });
});
