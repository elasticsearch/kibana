/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiAvatar, EuiComment } from '@elastic/eui';
import type { IconType } from '@elastic/eui';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { UserAvatar } from '@kbn/user-profile-components';
import type { EpisodeActionHistoryEntry } from '../../../queries/episode_actions_history_query';
import { ACTION_ICON, formatTimestamp } from './entries';
import { AlertEpisodeTimelineActionBody } from './timeline_action_body';
import * as i18n from './translations';

export interface AlertEpisodeTimelineActionCommentProps {
  entry: EpisodeActionHistoryEntry;
  profilesMap: Map<string, UserProfileWithAvatar>;
}

export const AlertEpisodeTimelineActionComment = ({
  entry,
  profilesMap,
}: AlertEpisodeTimelineActionCommentProps) => {
  const profile = entry.actor ? profilesMap.get(entry.actor) : undefined;
  const assigneeProfile = entry.assignee_uid ? profilesMap.get(entry.assignee_uid) : undefined;
  const displayName =
    profile?.user.full_name ?? profile?.user.username ?? entry.actor ?? i18n.SYSTEM_LABEL;
  const timelineAvatar: React.ReactElement = profile ? (
    <UserAvatar user={profile.user} avatar={profile.data?.avatar} size="s" />
  ) : (
    <EuiAvatar
      size="s"
      name={entry.action_type}
      iconType={(ACTION_ICON[entry.action_type] as IconType | undefined) ?? 'bell'}
      color="subdued"
    />
  );

  return (
    <EuiComment
      data-test-subj="alertingV2TimelineEntry"
      data-timestamp={entry['@timestamp']}
      username={displayName}
      timestamp={formatTimestamp(entry['@timestamp'])}
      event={`${i18n.ACTION_LABELS[entry.action_type] ?? entry.action_type} ${
        i18n.ACTION_ON_LABEL
      }`}
      timelineAvatar={timelineAvatar}
    >
      <AlertEpisodeTimelineActionBody entry={entry} assigneeProfile={assigneeProfile} />
    </EuiComment>
  );
};
