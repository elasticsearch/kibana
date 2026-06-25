/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { RuleStateStatus, type LoadedRuleState } from '../../types/rule_state';
import { AlertEpisodeDetailsHeader } from './details_header';

const mockRule = {
  id: 'rule-1',
  metadata: { name: 'Rule 1', description: 'Some description' },
} as RuleResponse;

const loadedRuleState: LoadedRuleState = {
  status: RuleStateStatus.loaded,
  ruleId: 'rule-1',
  rule: mockRule,
};

const defaultProps = {
  isLoadingEpisode: false,
  ruleState: loadedRuleState,
  tags: [] as string[],
  status: undefined,
  severity: undefined,
  episodeAction: undefined,
  groupAction: undefined,
};

describe('AlertEpisodeDetailsHeader', () => {
  it('renders title, description, status badges, and tags', () => {
    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeader
          {...defaultProps}
          tags={['t1']}
          status={ALERT_EPISODE_STATUS.ACTIVE}
          severity={undefined}
          episodeAction={undefined}
          groupAction={undefined}
        />
      </I18nProvider>
    );
    expect(screen.getByRole('heading', { name: 'Rule 1' })).toBeInTheDocument();
    expect(screen.getByText('Some description')).toBeInTheDocument();
    expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTags')).toBeInTheDocument();
    expect(screen.getByText('t1')).toBeInTheDocument();
  });

  it('renders the loading title while episode or rule data is loading', () => {
    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeader
          {...defaultProps}
          isLoadingEpisode={true}
          ruleState={{ status: RuleStateStatus.idle }}
          tags={[]}
          status={undefined}
          severity={undefined}
          episodeAction={undefined}
          groupAction={undefined}
        />
      </I18nProvider>
    );
    expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTitle')).toHaveTextContent('Loading…');
  });

  it('renders the episode fallback title when the rule was not found', () => {
    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeader
          {...defaultProps}
          ruleState={{ status: RuleStateStatus.not_found, ruleId: 'deleted-rule-id' }}
          status={ALERT_EPISODE_STATUS.ACTIVE}
        />
      </I18nProvider>
    );
    expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTitle')).toHaveTextContent(
      'Alert episode'
    );
    expect(
      screen.queryByTestId('alertingV2EpisodeDetailsHeaderDeletedRuleId')
    ).not.toBeInTheDocument();
  });

  it('renders the episode fallback title when the rule is idle', () => {
    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeader {...defaultProps} ruleState={{ status: RuleStateStatus.idle }} />
      </I18nProvider>
    );
    expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTitle')).toHaveTextContent(
      'Alert episode'
    );
  });

  it('renders the severity badge after the status badge', () => {
    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeader
          {...defaultProps}
          tags={[]}
          status={ALERT_EPISODE_STATUS.ACTIVE}
          severity="high"
          episodeAction={undefined}
          groupAction={undefined}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('alertingV2EpisodeSeverityBadge-high')).toHaveTextContent('High');
  });
});
