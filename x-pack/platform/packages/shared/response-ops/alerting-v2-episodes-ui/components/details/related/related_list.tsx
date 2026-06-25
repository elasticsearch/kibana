/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup } from '@elastic/eui';
import {
  RelatedAlertEpisode,
  type RelatedAlertEpisodeProps,
} from '../../related/related_alert_episode';
import type { AlertEpisode } from '../../../queries/episodes_query';
import { isRuleLoaded, type RuleState } from '../../../types/rule_state';
import { getRelatedEpisodeMissingRuleTitle } from './translations';

export interface RelatedAlertEpisodesListProps {
  rows: AlertEpisode[];
  ruleState: RuleState;
  getEpisodeAction: (episodeId: string) => RelatedAlertEpisodeProps['episodeAction'];
  getGroupAction: (groupHash: string) => RelatedAlertEpisodeProps['groupAction'];
  getEpisodeDetailsHref: (episodeId: string) => string;
  /**
   * Render each card with smaller padding. Forwarded as `compressed` to
   * `RelatedAlertEpisode`.
   */
  compressed?: boolean;
}

const getRuleDisplayFromState = (ruleState: RuleState, episodeId: string | undefined) => {
  if (isRuleLoaded(ruleState)) {
    return {
      ruleName: ruleState.rule.metadata.name,
      groupingFields: ruleState.rule.grouping?.fields ?? [],
    };
  }

  return {
    ruleName: episodeId ? getRelatedEpisodeMissingRuleTitle(episodeId) : '',
    groupingFields: [],
  };
};

export function RelatedAlertEpisodesList({
  rows,
  ruleState,
  getEpisodeAction,
  getGroupAction,
  getEpisodeDetailsHref,
  compressed = false,
}: RelatedAlertEpisodesListProps) {
  return (
    <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="alertingV2RelatedEpisodesList">
      {rows.map((row) => {
        const relatedId = row['episode.id'];
        const relatedGroupHash = row.group_hash;
        const { ruleName, groupingFields } = getRuleDisplayFromState(ruleState, relatedId);
        return (
          <RelatedAlertEpisode
            key={relatedId}
            episode={row}
            ruleName={ruleName}
            groupingFields={groupingFields}
            episodeAction={getEpisodeAction(relatedId)}
            groupAction={relatedGroupHash ? getGroupAction(relatedGroupHash) : undefined}
            href={getEpisodeDetailsHref(relatedId)}
            compressed={compressed}
          />
        );
      })}
    </EuiFlexGroup>
  );
}
