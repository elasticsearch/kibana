/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { OverviewTab } from './overview_tab';

jest.mock('../components/ai_summary_section', () => ({
  AISummarySection: ({ hit }: { hit: DataTableRecord }) => (
    <div data-test-subj="mock-ai-summary-section" data-hit-id={(hit as { id: string }).id} />
  ),
}));

const buildHit = (extra: Record<string, unknown> = {}): DataTableRecord =>
  ({
    id: 'attack-1',
    raw: { _id: 'attack-1', _index: '.alerts-security.attack-discovery.alerts-default' },
    flattened: {
      _id: 'attack-1',
      _index: '.alerts-security.attack-discovery.alerts-default',
      'kibana.alert.attack_discovery.summary_markdown_with_replacements': 'Summary text',
      ...extra,
    },
    isAnchor: false,
  } as unknown as DataTableRecord);

describe('<OverviewTab />', () => {
  it('renders without errors', () => {
    const { container } = render(<OverviewTab hit={buildHit()} />);
    expect(container).toBeTruthy();
  });

  it('renders AISummarySection', () => {
    render(<OverviewTab hit={buildHit()} />);
    expect(screen.getByTestId('mock-ai-summary-section')).toBeInTheDocument();
  });

  it('renders the overview tab container', () => {
    render(<OverviewTab hit={buildHit()} />);
    expect(screen.getByTestId('attack-flyout-overview-tab')).toBeInTheDocument();
  });

  it('passes hit to AISummarySection', () => {
    const hit = buildHit();
    render(<OverviewTab hit={hit} />);
    expect(screen.getByTestId('mock-ai-summary-section')).toHaveAttribute(
      'data-hit-id',
      'attack-1'
    );
  });
});
