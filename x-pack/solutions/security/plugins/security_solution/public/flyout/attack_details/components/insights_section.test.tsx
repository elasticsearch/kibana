/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { AttackDetailsContext } from '../context';
import { InsightsSection } from './insights_section';

jest.mock('../../../flyout_v2/attack/main/components/insights_section', () => ({
  InsightsSection: ({ attack }: { attack: AttackDiscoveryAlert }) => (
    <div
      data-test-subj="v2-insights-section"
      data-attack-id={(attack as unknown as { id: string }).id}
    />
  ),
}));

const buildAttack = (id = 'attack-1'): AttackDiscoveryAlert =>
  ({ id, alertIds: ['a', 'b'] } as unknown as AttackDiscoveryAlert);

const mockContextValue = {
  attackId: 'attack-1',
  indexName: '.alerts-default',
  attack: buildAttack(),
  getFieldsData: () => null,
  browserFields: {},
  dataFormattedForFieldBrowser: [],
  searchHit: {},
  refetch: jest.fn().mockResolvedValue(undefined),
};

const renderWithContext = (attack: AttackDiscoveryAlert | null = buildAttack()) =>
  render(
    <EuiProvider>
      <AttackDetailsContext.Provider
        value={
          { ...mockContextValue, attack } as unknown as React.ComponentProps<
            typeof AttackDetailsContext.Provider
          >['value']
        }
      >
        <InsightsSection />
      </AttackDetailsContext.Provider>
    </EuiProvider>
  );

describe('InsightsSection (legacy wrapper)', () => {
  it('renders v2 InsightsSection when attack is available', () => {
    renderWithContext();

    expect(screen.getByTestId('v2-insights-section')).toBeInTheDocument();
  });

  it('renders nothing when attack is null', () => {
    renderWithContext(null);

    expect(screen.queryByTestId('v2-insights-section')).not.toBeInTheDocument();
  });

  it('passes the attack from context to the v2 component', () => {
    renderWithContext(buildAttack('my-attack'));

    expect(screen.getByTestId('v2-insights-section')).toHaveAttribute(
      'data-attack-id',
      'my-attack'
    );
  });
});
