/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DataTableRecord } from '@kbn/discover-utils';
import { AISummarySection } from './ai_summary_section';
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
    extraAction,
    'data-test-subj': dataTestSubj,
  }: {
    title: React.ReactNode;
    children: React.ReactNode;
    extraAction?: React.ReactNode;
    'data-test-subj'?: string;
  }) => (
    <section data-test-subj={dataTestSubj}>
      <div>{title}</div>
      {extraAction}
      {children}
    </section>
  ),
}));

jest.mock('../../../../attack_discovery/pages/results/attack_discovery_markdown_formatter', () => ({
  AttackDiscoveryMarkdownFormatter: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));

const mockedUseExpandSection = jest.mocked(useExpandSection);

const KEY = 'aisummary';

const buildHit = (overrides: Record<string, unknown> = {}): DataTableRecord =>
  ({
    id: 'test-id',
    raw: { _id: 'test-id', _index: '.alerts-test' },
    flattened: {
      'kibana.alert.attack_discovery.summary_markdown': 'SUMMARY (ANONYMIZED)',
      'kibana.alert.attack_discovery.summary_markdown_with_replacements':
        'SUMMARY (WITH REPLACEMENTS)',
      'kibana.alert.attack_discovery.details_markdown': 'DETAILS (ANONYMIZED)',
      'kibana.alert.attack_discovery.details_markdown_with_replacements':
        'DETAILS (WITH REPLACEMENTS)',
      ...overrides,
    },
  } as unknown as DataTableRecord);

describe('AISummarySection (v2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseExpandSection.mockReturnValue(true);
  });

  it('renders the section title, settings menu, and background title', async () => {
    const user = userEvent.setup();
    render(<AISummarySection hit={buildHit()} />);

    expect(screen.getByText('Attack Summary')).toBeInTheDocument();
    expect(screen.getByText('Background')).toBeInTheDocument();
    expect(screen.getByTestId('overview-tab-ai-summary-settings-menu')).toBeInTheDocument();
    expect(document.querySelector(`[data-test-subj="${KEY}"]`)).toBeTruthy();

    await user.click(screen.getByTestId('overview-tab-ai-summary-settings-menu'));
    expect(screen.getByText('Show anonymized values')).toBeInTheDocument();
  });

  it('renders the panel wrapper', () => {
    render(<AISummarySection hit={buildHit()} />);
    expect(document.querySelector('[data-test-subj="overview-tab-ai-summary-panel"]')).toBeTruthy();
  });

  it('shows non-anonymized (with replacements) markdown by default', () => {
    render(<AISummarySection hit={buildHit()} />);

    const summary = document.querySelector('[data-test-subj="overview-tab-ai-summary-content"]');
    const background = document.querySelector(
      '[data-test-subj="overview-tab-ai-background-content"]'
    );

    expect(summary).toHaveTextContent('SUMMARY (WITH REPLACEMENTS)');
    expect(background).toHaveTextContent('DETAILS (WITH REPLACEMENTS)');
  });

  it('toggles to anonymized markdown when the switch is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<AISummarySection hit={buildHit()} />);

    await user.click(screen.getByTestId('overview-tab-ai-summary-settings-menu'));
    const toggleSwitch = await screen.findByTestId('overview-tab-toggle-anonymized');

    // Toggle ON → anonymized
    await user.click(toggleSwitch);

    expect(
      document.querySelector('[data-test-subj="overview-tab-ai-summary-content"]')
    ).toHaveTextContent('SUMMARY (ANONYMIZED)');
    expect(
      document.querySelector('[data-test-subj="overview-tab-ai-background-content"]')
    ).toHaveTextContent('DETAILS (ANONYMIZED)');

    // Toggle OFF → with replacements
    await user.click(screen.getByTestId('overview-tab-ai-summary-settings-menu'));
    await user.click(await screen.findByTestId('overview-tab-toggle-anonymized'));

    expect(
      document.querySelector('[data-test-subj="overview-tab-ai-summary-content"]')
    ).toHaveTextContent('SUMMARY (WITH REPLACEMENTS)');
    expect(
      document.querySelector('[data-test-subj="overview-tab-ai-background-content"]')
    ).toHaveTextContent('DETAILS (WITH REPLACEMENTS)');
  });

  it('renders the anonymized switch with the expected data-test-subj when the menu is open', async () => {
    const user = userEvent.setup();
    render(<AISummarySection hit={buildHit()} />);

    await user.click(screen.getByTestId('overview-tab-ai-summary-settings-menu'));

    expect(
      document.querySelector('[data-test-subj="overview-tab-toggle-anonymized"]')
    ).toBeTruthy();
  });

  it('disables the anonymized switch when there is no anonymized markdown', async () => {
    const user = userEvent.setup();
    render(
      <AISummarySection
        hit={buildHit({
          'kibana.alert.attack_discovery.summary_markdown': '',
          'kibana.alert.attack_discovery.details_markdown': '',
        })}
      />
    );
    await user.click(screen.getByTestId('overview-tab-ai-summary-settings-menu'));

    const toggle = document.querySelector(
      '[data-test-subj="overview-tab-toggle-anonymized"]'
    ) as HTMLInputElement;

    expect(toggle).toBeTruthy();
    expect(toggle.disabled).toBe(true);
  });
});
