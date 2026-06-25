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
import type { AlertEpisode } from '../../../queries/episodes_query';
import { RuleStateStatus } from '../../../types/rule_state';
import { RelatedAlertEpisodesList } from './related_list';

jest.mock('../../related/related_alert_episode', () => ({
  RelatedAlertEpisode: ({ episode, ruleName }: { episode: AlertEpisode; ruleName: string }) => (
    <div data-test-subj="mockRelatedAlertEpisode">{ruleName || episode['episode.id']}</div>
  ),
}));

const mockRule = {
  id: 'rule-1',
  metadata: { name: 'Test Rule' },
} as RuleResponse;

const loadedRuleState = {
  status: RuleStateStatus.loaded,
  ruleId: 'rule-1',
  rule: mockRule,
} as const;

const makeRow = (id: string): AlertEpisode =>
  ({
    'episode.id': id,
    'episode.status': 'active',
    'rule.id': 'rule-1',
    group_hash: 'gh-1',
    '@timestamp': '2024-01-01T00:00:00Z',
    first_timestamp: '2024-01-01T00:00:00Z',
    last_timestamp: '2024-01-01T00:01:00Z',
    duration: 60000,
  } as AlertEpisode);

describe('RelatedAlertEpisodesList', () => {
  it('renders one row per episode', () => {
    render(
      <I18nProvider>
        <RelatedAlertEpisodesList
          rows={[makeRow('ep-1'), makeRow('ep-2')]}
          ruleState={loadedRuleState}
          getEpisodeAction={() => undefined}
          getGroupAction={() => undefined}
          getEpisodeDetailsHref={(id) => `/base/${id}`}
        />
      </I18nProvider>
    );

    expect(screen.getAllByTestId('mockRelatedAlertEpisode')).toHaveLength(2);
    expect(screen.getByTestId('alertingV2RelatedEpisodesList')).toBeInTheDocument();
    expect(screen.getAllByText('Test Rule')).toHaveLength(2);
  });

  it('uses the episode id label when the rule is missing', () => {
    render(
      <I18nProvider>
        <RelatedAlertEpisodesList
          rows={[makeRow('ep-missing-rule')]}
          ruleState={{ status: RuleStateStatus.not_found, ruleId: 'rule-1' }}
          getEpisodeAction={() => undefined}
          getGroupAction={() => undefined}
          getEpisodeDetailsHref={(id) => `/base/${id}`}
        />
      </I18nProvider>
    );

    expect(screen.getByText('Episode ID: ep-missing-rule')).toBeInTheDocument();
  });

  it('renders nothing inside the list when rows is empty', () => {
    render(
      <I18nProvider>
        <RelatedAlertEpisodesList
          rows={[]}
          ruleState={loadedRuleState}
          getEpisodeAction={() => undefined}
          getGroupAction={() => undefined}
          getEpisodeDetailsHref={(id) => `/base/${id}`}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('alertingV2RelatedEpisodesList')).toBeEmptyDOMElement();
  });
});
