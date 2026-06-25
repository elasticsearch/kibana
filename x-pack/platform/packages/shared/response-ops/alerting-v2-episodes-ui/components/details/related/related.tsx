/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer, EuiTitle } from '@elastic/eui';
import { getRuleIdFromRuleState, type RuleState } from '../../../types/rule_state';
import { RelatedEpisodesRuleSubsection } from './rule_subsection';
import { RelatedEpisodesGroupSubsection } from './group_subsection';
import * as i18n from './translations';

export interface AlertEpisodesRelatedProps {
  currentEpisodeId: string | undefined;
  groupHash: string | undefined;
  ruleState: RuleState;
  getEpisodeDetailsHref: (episodeId: string) => string;
  /**
   * Whether to render the "Related episodes" section heading. Defaults to `true`.
   * Set to `false` in containers (e.g. the flyout) where the section already
   * provides its own heading via the surrounding chrome.
   */
  showHeading?: boolean;
  /**
   * When `true`, the subsections drop their inner horizontal padding so the
   * content sits flush with the consumer's edges. Useful inside narrow
   * containers (e.g. a flyout) that already provide outer padding.
   */
  compressed?: boolean;
}

export function AlertEpisodesRelated({
  currentEpisodeId,
  groupHash,
  ruleState,
  getEpisodeDetailsHref,
  showHeading = true,
  compressed = false,
}: AlertEpisodesRelatedProps) {
  const ruleId = getRuleIdFromRuleState(ruleState);

  if (!ruleId) {
    return null;
  }

  return (
    <>
      {showHeading ? (
        <>
          <EuiTitle size="m" data-test-subj="alertingV2RelatedAlertEpisodesSection">
            <h2>{i18n.RELATED_EPISODES_TITLE}</h2>
          </EuiTitle>
          <EuiSpacer size="m" />
        </>
      ) : null}
      {groupHash ? (
        <>
          <RelatedEpisodesGroupSubsection
            currentEpisodeId={currentEpisodeId}
            groupHash={groupHash}
            ruleState={ruleState}
            getEpisodeDetailsHref={getEpisodeDetailsHref}
            compressed={compressed}
          />
          <EuiSpacer size={compressed ? 'm' : 'l'} />
        </>
      ) : null}
      <RelatedEpisodesRuleSubsection
        currentEpisodeId={currentEpisodeId}
        currentGroupHash={groupHash}
        ruleState={ruleState}
        getEpisodeDetailsHref={getEpisodeDetailsHref}
        compressed={compressed}
      />
    </>
  );
}
