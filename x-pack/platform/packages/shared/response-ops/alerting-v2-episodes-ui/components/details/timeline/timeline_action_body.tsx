/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiAccordion,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { UserAvatar } from '@kbn/user-profile-components';
import { AlertEpisodeTags } from '../../actions/tags';
import type { EpisodeActionHistoryEntry } from '../../../queries/episode_actions_history_query';
import * as i18n from './translations';

export interface AlertEpisodeTimelineActionBodyProps {
  entry: EpisodeActionHistoryEntry;
  assigneeProfile: UserProfileWithAvatar | undefined;
}

export const AlertEpisodeTimelineActionBody = ({
  entry,
  assigneeProfile,
}: AlertEpisodeTimelineActionBodyProps) => {
  const details: React.ReactNode[] = [];

  if (entry.reason) {
    details.push(
      <EuiText key="reason" size="s" color="subdued">
        {entry.reason}
      </EuiText>
    );
  }

  if (entry.action_type === 'snooze' && !entry.expiry) {
    details.push(
      <EuiText key="expiry" size="s" color="subdued">
        {i18n.SNOOZED_INDEFINITELY}
      </EuiText>
    );
  }

  if (entry.expiry) {
    const untilText = i18n.getSnoozedUntilLabel(
      new Date(entry.expiry).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    );
    const duration =
      entry.action_type === 'snooze'
        ? i18n.formatSnoozeDuration(entry['@timestamp'], entry.expiry)
        : null;
    details.push(
      <EuiText key="expiry" size="s" color="subdued">
        {duration != null ? `${untilText} · ${duration}` : untilText}
      </EuiText>
    );
  }

  if (Array.isArray(entry.tags) && entry.tags.length > 0) {
    details.push(<AlertEpisodeTags key="tags" tags={entry.tags} />);
  }

  if (entry.assignee_uid !== undefined) {
    const assigneeName =
      assigneeProfile?.user.full_name ?? assigneeProfile?.user.username ?? entry.assignee_uid;
    details.push(
      <EuiFlexGroup key="assignee" gutterSize="s" alignItems="center" responsive={false}>
        {assigneeProfile && (
          <EuiFlexItem grow={false}>
            <UserAvatar
              user={assigneeProfile.user}
              avatar={assigneeProfile.data?.avatar}
              size="s"
            />
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            {assigneeName}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  const rawJson = JSON.stringify(
    Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined && v !== null)),
    null,
    2
  );

  return (
    <>
      {details.map((node, i) => (
        <React.Fragment key={i}>
          {i > 0 && <EuiSpacer size="xs" />}
          {node}
        </React.Fragment>
      ))}
      <EuiSpacer size="s" />
      <EuiAccordion
        id={`timeline-full-event-${entry['@timestamp']}-${entry.action_type}`}
        buttonContent={i18n.SHOW_FULL_EVENT}
        paddingSize="none"
      >
        <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable overflowHeight={240}>
          {rawJson}
        </EuiCodeBlock>
      </EuiAccordion>
    </>
  );
};
