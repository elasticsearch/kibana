/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCard, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import type { AlertEpisode } from '../../queries/episodes_query';
import type { EpisodeActionState, AlertEpisodeGroupAction } from '../../types/action';
import { AlertingEpisodeGroupingTags } from '../grouping/alerting_episode_grouping_tags';
import { AlertEpisodeStatusBadges } from '../status/status_badges';
import { AlertEpisodeSeverityBadge } from '../severity/episode_severity_badge';
import { isSupportedEpisodeSeverity } from '../severity/severity_utils';
import { getNonEmptyGroupingFields, parseEpisodeDataJson } from '../../utils/episode_grouping_data';

export interface RelatedAlertEpisodeProps {
  episode: AlertEpisode;
  rule: RuleResponse;
  episodeAction?: EpisodeActionState;
  groupAction?: AlertEpisodeGroupAction;
  href: string;
  /**
   * Render the card with smaller padding. Useful inside narrow containers
   * (e.g. a flyout) where the default `paddingSize="m"` feels excessive.
   */
  compressed?: boolean;
}

export function RelatedAlertEpisode({
  episode,
  rule,
  episodeAction,
  groupAction,
  href,
  compressed = false,
}: RelatedAlertEpisodeProps) {
  const status = episode['episode.status'];
  const episodeId = episode['episode.id'];
  const groupingFields = rule.grouping?.fields ?? [];
  const episodeData = parseEpisodeDataJson(episode.episode_data);
  const showGroupingBadges =
    groupingFields.length > 0 && getNonEmptyGroupingFields(groupingFields, episodeData).length > 0;

  return (
    <EuiCard
      display="subdued"
      paddingSize={compressed ? 's' : 'm'}
      href={href}
      textAlign="left"
      titleSize="xs"
      titleElement="h3"
      title={
        <EuiFlexGroup
          alignItems="center"
          gutterSize={compressed ? 'xs' : 's'}
          responsive={true}
          wrap
        >
          <EuiFlexItem grow={false}>{rule.metadata.name}</EuiFlexItem>
          {status ? (
            <EuiFlexItem grow={false}>
              <AlertEpisodeStatusBadges
                status={status}
                episodeAction={episodeAction}
                groupAction={groupAction}
              />
            </EuiFlexItem>
          ) : null}
          {isSupportedEpisodeSeverity(episode.severity) ? (
            <EuiFlexItem grow={false}>
              <AlertEpisodeSeverityBadge severity={episode.severity} />
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      }
      data-test-subj={
        episodeId != null ? `relatedAlertEpisode-${episodeId}` : 'relatedAlertEpisode'
      }
    >
      {showGroupingBadges ? (
        <EuiFlexGroup
          alignItems="center"
          gutterSize={compressed ? 'xs' : 's'}
          wrap
          data-test-subj="relatedAlertEpisodeGrouping"
        >
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {i18n.translate('xpack.alertingV2EpisodesUi.relatedAlertEpisode.groupingLabel', {
                defaultMessage: 'Grouping',
              })}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <AlertingEpisodeGroupingTags
              fields={groupingFields}
              data={episodeData}
              data-test-subj="relatedAlertEpisodeGroupingTags"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}
    </EuiCard>
  );
}
