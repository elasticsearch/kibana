/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { EuiAvatar, EuiComment, EuiCommentList, EuiSpacer, EuiText } from '@elastic/eui';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { AlertEpisodeStatusBadge } from '../../status/status_badge';
import type { TimelineEntry } from './entries';
import { formatTimestamp } from './entries';
import { AlertEpisodeTimelineActionComment } from './timeline_action_comment';
import * as i18n from './translations';

export interface AlertEpisodeTimelineProps {
  entries: TimelineEntry[];
  profilesMap: Map<string, UserProfileWithAvatar>;
}

export const AlertEpisodeTimeline = ({ entries, profilesMap }: AlertEpisodeTimelineProps) => (
  <EuiCommentList
    css={css`
      /* EuiTimelineItemEvent renders as a bare div with flex:1 and no min-width:0,
         causing wide content (e.g. code blocks) to expand the card past its container.
         EuiComment passes className="euiComment" to EuiTimelineItem (<li>), so we
         target the second div child (the event column) from there. */
      .euiComment > div:last-child {
        min-width: 0;
      }
    `}
  >
    {entries.map((item, idx) => {
      if (item.kind === 'action') {
        return (
          <AlertEpisodeTimelineActionComment
            key={`action-${idx}`}
            entry={item.entry}
            profilesMap={profilesMap}
          />
        );
      }

      const isInitial = item.prevStatus === undefined;
      return (
        <EuiComment
          key={`state-${idx}`}
          data-test-subj="alertingV2TimelineEntry"
          data-timestamp={item.timestamp}
          username={i18n.SYSTEM_LABEL}
          timestamp={formatTimestamp(item.timestamp)}
          timelineAvatar={
            <EuiAvatar
              size="s"
              name={isInitial ? i18n.EPISODE_STARTED : i18n.STATUS_CHANGED}
              iconType={isInitial ? 'flag' : 'arrowRight'}
              color="subdued"
            />
          }
          event={isInitial ? i18n.EPISODE_STARTED : i18n.STATUS_CHANGED}
        >
          <>
            <AlertEpisodeStatusBadge status={item.newStatus} />
            {item.prevStatus !== undefined && (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="s" color="subdued">
                  {i18n.getAfterNEventsLabel(
                    item.prevEventCount,
                    i18n.STATUS_LABELS[item.prevStatus] ?? item.prevStatus
                  )}
                </EuiText>
              </>
            )}
          </>
        </EuiComment>
      );
    })}
  </EuiCommentList>
);
