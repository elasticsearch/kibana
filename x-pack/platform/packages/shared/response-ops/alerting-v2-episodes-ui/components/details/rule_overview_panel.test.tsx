/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { AlertEpisodeRuleOverviewPanel } from './rule_overview_panel';

const mockRule = {
  id: 'rule-1',
  enabled: true,
  kind: 'signal',
  metadata: { name: 'My rule' },
  query: { format: 'standalone', breach: { query: 'FROM logs-* | WHERE foo=1' } },
} as unknown as RuleResponse;

const alertRule = { ...mockRule, kind: 'alert' } as unknown as RuleResponse;

const mockRuleDetailsHref = '/rules/rule-1';

const renderPanel = (rule: RuleResponse) =>
  render(
    <I18nProvider>
      <AlertEpisodeRuleOverviewPanel rule={rule} ruleDetailsHref={mockRuleDetailsHref} />
    </I18nProvider>
  );

describe('AlertEpisodeRuleOverviewPanel', () => {
  it('renders the rule name, esql code block and view-rule-details link', () => {
    renderPanel(mockRule);

    expect(screen.getByText('My rule')).toBeInTheDocument();
    expect(screen.getByTestId('alertingV2EpisodeDetailsRuleQueryCodeBlock')).toHaveTextContent(
      'FROM logs-* | WHERE foo=1'
    );
    const viewBtn = screen.getByTestId('alertingV2EpisodeDetailsViewRuleDetailsButton');
    expect(viewBtn).toHaveAttribute('href', '/rules/rule-1');
    expect(screen.getByTestId('alertingV2EpisodeDetailsRuleOverviewPanel')).toBeInTheDocument();
  });

  it('renders "Signal" kind badge for signal rules', () => {
    renderPanel(mockRule);

    const badge = screen.getByTestId('alertingV2EpisodeDetailsRuleKindBadge');
    expect(badge).toHaveTextContent('Signal');
  });

  it('renders "Alert" kind badge for alert rules', () => {
    renderPanel(alertRule);

    const badge = screen.getByTestId('alertingV2EpisodeDetailsRuleKindBadge');
    expect(badge).toHaveTextContent('Alert');
  });

  it('renders composed query with breach segment (alert condition)', () => {
    const composedRule = {
      ...mockRule,
      query: {
        format: 'composed',
        base: 'FROM logs-*',
        breach: { segment: '| WHERE foo > 10' },
      },
    } as RuleResponse;

    renderPanel(composedRule);

    expect(screen.getByTestId('alertingV2EpisodeDetailsRuleQueryCodeBlock')).toHaveTextContent(
      'FROM logs-* | WHERE foo > 10'
    );
  });
});
