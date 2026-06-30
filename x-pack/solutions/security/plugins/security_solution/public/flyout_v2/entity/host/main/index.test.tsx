/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../../common/mock';
import {
  mockHostRiskScoreState,
  mockObservedHostData,
} from '../../../../flyout/entity_details/mocks';
import { Host } from '.';

const mockProps = {
  hostName: 'test',
  scopeId: 'test-scope-id',
  contextID: 'test-host-panel',
};

jest.mock('../../../../common/components/visualization_actions/visualization_embeddable');

const mockedHostRiskScore = jest.fn().mockReturnValue(mockHostRiskScoreState);
jest.mock('../../../../entity_analytics/api/hooks/use_risk_score', () => ({
  useRiskScore: () => mockedHostRiskScore(),
}));

const mockedUseObservedHost = jest.fn().mockReturnValue(mockObservedHostData);
jest.mock('./hooks/use_observed_host', () => ({
  useObservedHost: () => mockedUseObservedHost(),
}));

describe('<Host />', () => {
  beforeEach(() => {
    mockedHostRiskScore.mockReturnValue(mockHostRiskScoreState);
    mockedUseObservedHost.mockReturnValue(mockObservedHostData);
  });

  it('renders header, content, and footer', () => {
    const { getByTestId } = render(
      <TestProviders>
        <Host {...mockProps} />
      </TestProviders>
    );

    expect(getByTestId('host-panel-header')).toBeInTheDocument();
    expect(getByTestId('observedEntity-accordion')).toBeInTheDocument();
  });

  it('does not render an expand-details navigation button (no v2 left panel yet)', () => {
    const { queryByTestId } = render(
      <TestProviders>
        <Host {...mockProps} />
      </TestProviders>
    );

    expect(
      queryByTestId('securitySolutionFlyoutNavigationExpandDetailButton')
    ).not.toBeInTheDocument();
  });

  it('does not render a preview footer', () => {
    const { queryByTestId } = render(
      <TestProviders>
        <Host {...mockProps} />
      </TestProviders>
    );

    expect(queryByTestId('host-preview-footer')).not.toBeInTheDocument();
  });
});
