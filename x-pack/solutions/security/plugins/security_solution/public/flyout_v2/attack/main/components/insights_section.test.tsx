/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { InsightsSection } from './insights_section';
import { INSIGHTS_SECTION_TEST_ID } from '../constants/test_ids';
import { useExpandSection } from '../../../shared/hooks/use_expand_section';

jest.mock('@kbn/i18n-react', () => ({
  FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) => <>{defaultMessage}</>,
}));

jest.mock('../../../shared/hooks/use_expand_section', () => ({
  useExpandSection: jest.fn(),
}));

jest.mock('../../../shared/components/expandable_section', () => ({
  ExpandableSection: ({
    title,
    children,
    'data-test-subj': dataTestSubj,
  }: {
    title: React.ReactNode;
    children: React.ReactNode;
    'data-test-subj'?: string;
  }) => (
    <section data-test-subj={dataTestSubj}>
      <div>{title}</div>
      {children}
    </section>
  ),
}));

jest.mock('./entities_overview', () => ({
  EntitiesOverview: () => <div data-test-subj="entities-overview" />,
}));

jest.mock('./correlations_overview', () => ({
  CorrelationsOverview: () => <div data-test-subj="correlations-overview" />,
}));

const mockedUseExpandSection = jest.mocked(useExpandSection);

const buildAttack = (): AttackDiscoveryAlert => ({ alertIds: ['a', 'b'] } as AttackDiscoveryAlert);

describe('InsightsSection (v2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseExpandSection.mockReturnValue(true);
  });

  it('renders the insights section with the correct test id', () => {
    render(<InsightsSection attack={buildAttack()} />);

    expect(screen.getByTestId(INSIGHTS_SECTION_TEST_ID)).toBeInTheDocument();
  });

  it('renders the section title', () => {
    render(<InsightsSection attack={buildAttack()} />);

    expect(screen.getByText('Insights')).toBeInTheDocument();
  });

  it('renders EntitiesOverview', () => {
    render(<InsightsSection attack={buildAttack()} />);

    expect(screen.getByTestId('entities-overview')).toBeInTheDocument();
  });

  it('renders CorrelationsOverview', () => {
    render(<InsightsSection attack={buildAttack()} />);

    expect(screen.getByTestId('correlations-overview')).toBeInTheDocument();
  });

  it('calls useExpandSection with default collapsed', () => {
    render(<InsightsSection attack={buildAttack()} />);

    expect(mockedUseExpandSection).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'insights', defaultValue: false })
    );
  });
});
