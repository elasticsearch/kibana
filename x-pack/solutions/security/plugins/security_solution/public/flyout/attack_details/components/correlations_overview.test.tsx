/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { CorrelationsOverview } from './correlations_overview';
import { useAttackDetailsContext } from '../context';

jest.mock('../context', () => ({
  useAttackDetailsContext: jest.fn(),
}));

jest.mock('../../../flyout_v2/attack/main/components/correlations_overview', () => ({
  CorrelationsOverview: ({ attack }: { attack: AttackDiscoveryAlert }) => (
    <div data-test-subj="v2-correlations-overview" data-count={attack.alertIds.length} />
  ),
}));

const buildAttack = (alertIds: string[]): AttackDiscoveryAlert =>
  ({ alertIds } as unknown as AttackDiscoveryAlert);

describe('CorrelationsOverview (legacy wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the v2 component when attack is available', () => {
    jest.mocked(useAttackDetailsContext).mockReturnValue({
      attack: buildAttack(['alert-1', 'alert-2']),
    } as ReturnType<typeof useAttackDetailsContext>);

    render(<CorrelationsOverview />);

    expect(screen.getByTestId('v2-correlations-overview')).toBeInTheDocument();
    expect(screen.getByTestId('v2-correlations-overview')).toHaveAttribute('data-count', '2');
  });

  it('renders nothing when attack is null', () => {
    jest.mocked(useAttackDetailsContext).mockReturnValue({
      attack: null,
    } as ReturnType<typeof useAttackDetailsContext>);

    const { container } = render(<CorrelationsOverview />);

    expect(container).toBeEmptyDOMElement();
  });
});
