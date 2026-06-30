/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { VisualizationsSection } from './visualizations_section';
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

jest.mock(
  '../../../../attack_discovery/pages/results/attack_discovery_panel/tabs/attack_discovery_tab/attack/attack_chain',
  () => ({
    AttackChain: ({ attackTactics }: { attackTactics: string[] | undefined }) => (
      <div data-test-subj="attack-chain" data-tactics={JSON.stringify(attackTactics)} />
    ),
  })
);

jest.mock('./section_panel', () => ({
  SectionPanel: ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
    <div data-test-subj="section-panel">
      <div>{title}</div>
      {children}
    </div>
  ),
}));

const mockedUseExpandSection = jest.mocked(useExpandSection);

const buildHit = (overrides: Record<string, unknown> = {}): DataTableRecord =>
  ({
    id: 'test-id',
    raw: { _id: 'test-id', _index: '.alerts-test' },
    flattened: {
      'kibana.alert.attack_discovery.mitre_attack_tactics': ['Initial Access', 'Execution'],
      ...overrides,
    },
  } as unknown as DataTableRecord);

const KEY = 'visualizations';

describe('VisualizationsSection (v2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseExpandSection.mockReturnValue(true);
  });

  it('renders the section title', () => {
    render(<VisualizationsSection hit={buildHit()} />);
    expect(screen.getByText('Visualizations')).toBeInTheDocument();
  });

  it('renders the attack chain section panel', () => {
    render(<VisualizationsSection hit={buildHit()} />);
    expect(screen.getByText('Attack Chain')).toBeInTheDocument();
  });

  it('passes the full tactics array to AttackChain', () => {
    render(<VisualizationsSection hit={buildHit()} />);
    const chain = screen.getByTestId('attack-chain');
    expect(chain).toHaveAttribute('data-tactics', JSON.stringify(['Initial Access', 'Execution']));
  });

  it('renders AttackChain even when tactics field is missing', () => {
    render(
      <VisualizationsSection
        hit={buildHit({ 'kibana.alert.attack_discovery.mitre_attack_tactics': undefined })}
      />
    );
    expect(screen.getByTestId('attack-chain')).toBeInTheDocument();
  });

  it('uses the section id as data-test-subj', () => {
    render(<VisualizationsSection hit={buildHit()} />);
    expect(document.querySelector(`[data-test-subj="${KEY}"]`)).toBeTruthy();
  });

  it('calls useExpandSection with default collapsed', () => {
    render(<VisualizationsSection hit={buildHit()} />);
    expect(mockedUseExpandSection).toHaveBeenCalledWith(
      expect.objectContaining({ title: KEY, defaultValue: false })
    );
  });
});
