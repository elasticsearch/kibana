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
import { RuleStateStatus } from '../../../types/rule_state';
import { AlertEpisodesRelated } from './related';

const mockRule = {
  id: 'rule-1',
  metadata: { name: 'Test Rule' },
} as RuleResponse;

const loadedRuleState = {
  status: RuleStateStatus.loaded,
  ruleId: 'rule-1',
  rule: mockRule,
} as const;

jest.mock('./group_subsection', () => ({
  RelatedEpisodesGroupSubsection: () => <div data-test-subj="mockGroupSubsection" />,
}));

jest.mock('./rule_subsection', () => ({
  RelatedEpisodesRuleSubsection: () => <div data-test-subj="mockRuleSubsection" />,
}));

describe('AlertEpisodesRelated', () => {
  it('renders the section heading', () => {
    render(
      <I18nProvider>
        <AlertEpisodesRelated
          currentEpisodeId="ep-1"
          groupHash={undefined}
          ruleState={loadedRuleState}
          getEpisodeDetailsHref={(id) => `/base/${id}`}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('mockRuleSubsection')).toBeInTheDocument();
    expect(screen.getByText('Related alert episodes')).toBeInTheDocument();
    // should not render since the groupHash is undefined
    expect(screen.queryByTestId('mockGroupSubsection')).not.toBeInTheDocument();
  });

  it('renders the group subsection only when groupHash is provided', () => {
    render(
      <I18nProvider>
        <AlertEpisodesRelated
          currentEpisodeId="ep-1"
          groupHash="gh-1"
          ruleState={loadedRuleState}
          getEpisodeDetailsHref={(id) => `/base/${id}`}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('mockGroupSubsection')).toBeInTheDocument();
  });
});
