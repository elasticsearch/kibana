/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { AnomaliesSection } from './anomalies_section';
import type { GetAnomalyOverviewResponse } from '../../../../common/api/entity_analytics';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: () => ({
      euiTheme: {
        colors: { primary: '#0070f3', textSubdued: '#6a6a6a' },
        font: { weight: { semiBold: 600 } },
      },
    }),
    useEuiFontSize: () => ({ fontSize: '12px' }),
  };
});

jest.mock('./anomalies_overview', () => ({
  AnomaliesOverview: (props: Record<string, unknown>) => (
    <div data-test-subj="mock-anomalies-overview" data-props={JSON.stringify(props)} />
  ),
}));

const makeData = (
  overrides: Partial<GetAnomalyOverviewResponse> = {}
): GetAnomalyOverviewResponse => ({
  entityId: 'test-entity',
  anomalyByTimeBucket: [],
  recentAnomalies: [],
  tacticCounts: {},
  totalAnomaliesCount: 0,
  from: 1_000_000,
  to: 2_000_000,
  ...overrides,
});

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <IntlProvider locale="en">{children}</IntlProvider>
);

const openDetailsPanel = jest.fn();

const defaultProps = {
  data: makeData({ totalAnomaliesCount: 3 }),
  entityId: 'test-entity',
  openDetailsPanel,
};

describe('AnomaliesSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the accordion container', () => {
    render(<AnomaliesSection {...defaultProps} />, { wrapper: Wrapper });
    expect(
      screen.getByTestId('entity-anomalies-flyout-section-data-test-subj')
    ).toBeInTheDocument();
  });

  it('renders the section title', () => {
    render(<AnomaliesSection {...defaultProps} />, { wrapper: Wrapper });
    expect(screen.getByText('Behavioral anomalies')).toBeInTheDocument();
  });

  it('renders the timeframe label', () => {
    render(<AnomaliesSection {...defaultProps} />, { wrapper: Wrapper });
    expect(
      screen.getByTestId('entity-anomalies-flyout-section-accordion-timeframe')
    ).toHaveTextContent('Last 30 days');
  });

  it('renders the accordion open by default', () => {
    render(<AnomaliesSection {...defaultProps} />, { wrapper: Wrapper });
    expect(screen.getByTestId('mock-anomalies-overview')).toBeInTheDocument();
  });

  it('passes data and openDetailsPanel to AnomaliesOverview', () => {
    const data = makeData({ totalAnomaliesCount: 5 });
    render(<AnomaliesSection {...defaultProps} data={data} openDetailsPanel={openDetailsPanel} />, {
      wrapper: Wrapper,
    });
    const overview = screen.getByTestId('mock-anomalies-overview');
    const props = JSON.parse(overview.getAttribute('data-props') ?? '{}');
    expect(props.data.totalAnomaliesCount).toBe(5);
    expect(props.entityId).toBe('test-entity');
  });

  it('passes isPreviewMode to AnomaliesOverview', () => {
    render(<AnomaliesSection {...defaultProps} isPreviewMode={true} />, { wrapper: Wrapper });
    const overview = screen.getByTestId('mock-anomalies-overview');
    const props = JSON.parse(overview.getAttribute('data-props') ?? '{}');
    expect(props.isPreviewMode).toBe(true);
  });

  it('does not pass isPreviewMode when not provided', () => {
    render(<AnomaliesSection {...defaultProps} />, { wrapper: Wrapper });
    const overview = screen.getByTestId('mock-anomalies-overview');
    const props = JSON.parse(overview.getAttribute('data-props') ?? '{}');
    expect(props.isPreviewMode).toBeUndefined();
  });

  it('renders nothing when totalAnomaliesCount is 0', () => {
    const { container } = render(
      <AnomaliesSection {...defaultProps} data={makeData({ totalAnomaliesCount: 0 })} />,
      { wrapper: Wrapper }
    );
    expect(container.firstChild).toBeNull();
  });
});
