/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiLoadingSpinner, EuiSpacer } from '@elastic/eui';
import { useFetchEpisodeQuery } from '../../hooks/use_fetch_episode_query';
import { useFetchRule } from '../../hooks/use_fetch_rule';
import {
  getRuleIdFromRuleState,
  isRuleError,
  isRuleLoaded,
  isRuleLoading,
} from '../../types/rule_state';
import { getRuleDetailsPath } from '../../constants';
import { AlertEpisodeRuleOverviewPanel } from './rule_overview_panel';
import type { AlertEpisodeDetailsServices } from './types';
import * as i18n from './translations';

export interface AlertEpisodeRuleOverviewPanelSectionProps {
  episodeId: string;
  services: Pick<AlertEpisodeDetailsServices, 'data' | 'http' | 'spaces'>;
}

export const AlertEpisodeRuleOverviewPanelSection = ({
  episodeId,
  services,
}: AlertEpisodeRuleOverviewPanelSectionProps) => {
  const {
    data: episode,
    isLoading: isLoadingEpisode,
    isError: isEpisodeError,
  } = useFetchEpisodeQuery({ episodeId, services });

  const ruleId = episode?.['rule.id'];

  const { ruleState } = useFetchRule({
    id: ruleId,
    http: services.http,
  });

  if (isLoadingEpisode || (ruleId && isRuleLoading(ruleState))) {
    return (
      <>
        <EuiSpacer size="l" />
        <EuiLoadingSpinner
          size="m"
          data-test-subj="alertingV2EpisodeRuleOverviewPanelSectionLoading"
        />
      </>
    );
  }

  if (isEpisodeError || isRuleError(ruleState)) {
    return (
      <>
        <EuiSpacer size="l" />
        <EuiEmptyPrompt
          data-test-subj="alertingV2EpisodeRuleOverviewPanelSectionError"
          iconType="alert"
          color="danger"
          titleSize="xs"
          title={<h3>{i18n.RULE_OVERVIEW_PANEL_SECTION_ERROR_TITLE}</h3>}
        />
      </>
    );
  }

  if (!isRuleLoaded(ruleState)) {
    return null;
  }

  const resolvedRuleId = getRuleIdFromRuleState(ruleState);

  if (!resolvedRuleId) {
    return null;
  }

  return (
    <>
      <EuiSpacer size="l" />
      <AlertEpisodeRuleOverviewPanel
        rule={ruleState.rule}
        ruleDetailsHref={services.http.basePath.prepend(getRuleDetailsPath(resolvedRuleId))}
      />
    </>
  );
};
