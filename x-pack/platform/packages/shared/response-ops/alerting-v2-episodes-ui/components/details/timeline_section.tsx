/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiEmptyPrompt, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner } from '@elastic/eui';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { useFetchEpisodeEventsQuery } from '../../hooks/use_fetch_episode_events_query';
import { useFetchEpisodeActionsHistoryQuery } from '../../hooks/use_fetch_episode_actions_history_query';
import { useBulkGetProfiles } from '../../hooks/use_bulk_get_profiles';
import type { AlertEpisodeDetailsServices } from './types';
import { deriveStateChangeEntries, mergeTimelineEntries } from './timeline/entries';
import { AlertEpisodeTimeline } from './timeline/timeline';
import * as i18n from './timeline/translations';

export interface AlertEpisodeTimelineSectionProps {
  episodeId: string;
  groupHash: string | undefined;
  services: Pick<AlertEpisodeDetailsServices, 'data' | 'spaces' | 'userProfile'>;
}

export const AlertEpisodeTimelineSection = ({
  episodeId,
  groupHash,
  services,
}: AlertEpisodeTimelineSectionProps) => {
  const { data: eventRows = [] } = useFetchEpisodeEventsQuery({ episodeId, services });

  const { data: actionEntries = [], isLoading } = useFetchEpisodeActionsHistoryQuery({
    episodeId,
    groupHash,
    services,
  });

  const actorUids = useMemo(
    () => [
      ...new Set(
        actionEntries.flatMap((e) => {
          const uids: string[] = [];
          if (e.actor) uids.push(e.actor);
          if (e.assignee_uid) uids.push(e.assignee_uid);
          return uids;
        })
      ),
    ],
    [actionEntries]
  );

  const { data: profiles = [] } = useBulkGetProfiles({
    userProfile: services.userProfile,
    uids: actorUids,
    toasts: { addError: () => {} },
    errorTitle: i18n.BULK_GET_PROFILES_ERROR,
  });

  const profilesMap = useMemo(() => {
    const map = new Map<string, UserProfileWithAvatar>();
    for (const p of profiles as UserProfileWithAvatar[]) {
      map.set(p.uid, p);
    }
    return map;
  }, [profiles]);

  const stateChangeEntries = useMemo(() => deriveStateChangeEntries(eventRows), [eventRows]);

  const mergedEntries = useMemo(
    () => mergeTimelineEntries(stateChangeEntries, actionEntries),
    [stateChangeEntries, actionEntries]
  );

  if (isLoading) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="l" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (mergedEntries.length === 0) {
    return (
      <EuiEmptyPrompt
        data-test-subj="alertingV2TimelineSectionEmpty"
        iconType="clock"
        title={<h3>{i18n.EMPTY_TITLE}</h3>}
        body={<p>{i18n.EMPTY_BODY}</p>}
      />
    );
  }

  return <AlertEpisodeTimeline entries={mergedEntries} profilesMap={profilesMap} />;
};
