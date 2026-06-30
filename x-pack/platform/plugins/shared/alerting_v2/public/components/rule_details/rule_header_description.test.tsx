/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { RULE_KIND_TOOLTIPS } from '@kbn/alerting-v2-constants';
import { RuleHeaderDescription, RuleTitleWithBadges } from './rule_header_description';
import { RuleProvider } from './rule_context';
import type { RuleApiResponse } from '../../services/rules_api';

const baseRule = {
  id: 'rule-1',
  kind: 'signal',
  enabled: true,
  metadata: { name: 'My Rule', tags: ['prod', 'infra'] },
} as RuleApiResponse;

const wrap = (ui: React.ReactElement, rule: RuleApiResponse = baseRule) =>
  render(
    <I18nProvider>
      <RuleProvider rule={rule}>{ui}</RuleProvider>
    </I18nProvider>
  );

describe('RuleHeaderDescription', () => {
  it('renders tags as badges', () => {
    wrap(<RuleHeaderDescription />);
    expect(screen.getByTestId('ruleTags')).toBeInTheDocument();
    expect(screen.getByText('prod')).toBeInTheDocument();
    expect(screen.getByText('infra')).toBeInTheDocument();
  });

  it('renders description text', () => {
    const rule = {
      ...baseRule,
      metadata: { name: 'My Rule', description: 'Alert when errors exceed threshold.' },
    } as RuleApiResponse;
    wrap(<RuleHeaderDescription />, rule);
    expect(screen.getByTestId('ruleDescription')).toHaveTextContent(
      'Alert when errors exceed threshold.'
    );
  });

  it('renders both description and tags when both are present', () => {
    const rule = {
      ...baseRule,
      metadata: {
        name: 'My Rule',
        description: 'Some description',
        tags: ['prod', 'infra'],
      },
    } as RuleApiResponse;
    wrap(<RuleHeaderDescription />, rule);
    expect(screen.getByTestId('ruleDescription')).toBeInTheDocument();
    expect(screen.getByTestId('ruleTags')).toBeInTheDocument();
  });

  it('returns null when tags are empty and no description', () => {
    const { container } = wrap(<RuleHeaderDescription />, {
      ...baseRule,
      metadata: { name: 'No Tags' },
    } as RuleApiResponse);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when tags are undefined and no description', () => {
    const rule = { ...baseRule, metadata: { name: 'No Tags' } } as RuleApiResponse;
    const { container } = wrap(<RuleHeaderDescription />, rule);
    expect(container.innerHTML).toBe('');
  });
});

describe('RuleTitleWithBadges', () => {
  it('renders the rule name', () => {
    wrap(<RuleTitleWithBadges />);
    expect(screen.getByTestId('ruleName')).toHaveTextContent('My Rule');
  });

  it('renders kind as Signal for signal rules', () => {
    wrap(<RuleTitleWithBadges />);
    expect(screen.getByTestId('kindBadge')).toHaveTextContent('Signal');
  });

  it('renders kind as Alert for alert rules', () => {
    wrap(<RuleTitleWithBadges />, { ...baseRule, kind: 'alert' } as RuleApiResponse);
    expect(screen.getByTestId('kindBadge')).toHaveTextContent('Alert');
  });

  it('renders kind-specific tooltip for signal rules', async () => {
    wrap(<RuleTitleWithBadges />);

    fireEvent.mouseOver(screen.getByTestId('kindBadge'));

    await waitFor(() => {
      expect(screen.getByText(RULE_KIND_TOOLTIPS.signal)).toBeInTheDocument();
    });
  });

  it('renders kind-specific tooltip for alert rules', async () => {
    wrap(<RuleTitleWithBadges />, { ...baseRule, kind: 'alert' } as RuleApiResponse);

    fireEvent.mouseOver(screen.getByTestId('kindBadge'));

    await waitFor(() => {
      expect(screen.getByText(RULE_KIND_TOOLTIPS.alert)).toBeInTheDocument();
    });
  });

  it('renders enabled badge when rule is enabled', () => {
    wrap(<RuleTitleWithBadges />);
    expect(screen.getByTestId('enabledBadge')).toBeInTheDocument();
    expect(screen.queryByTestId('disabledBadge')).not.toBeInTheDocument();
  });

  it('renders disabled badge when rule is disabled', () => {
    wrap(<RuleTitleWithBadges />, { ...baseRule, enabled: false } as RuleApiResponse);
    expect(screen.getByTestId('disabledBadge')).toBeInTheDocument();
    expect(screen.queryByTestId('enabledBadge')).not.toBeInTheDocument();
  });
});
