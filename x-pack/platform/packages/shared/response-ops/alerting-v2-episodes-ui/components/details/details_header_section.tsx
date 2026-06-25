/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiTitleSize } from '@elastic/eui';
import { useFetchEpisodeQuery } from '../../hooks/use_fetch_episode_query';
import { useFetchEpisodeActions } from '../../hooks/use_fetch_episode_actions';
import { useFetchGroupActions } from '../../hooks/use_fetch_group_actions';
import { useFetchRule } from '../../hooks/use_fetch_rule';
import { AlertEpisodeDetailsHeader } from './details_header';
import type { AlertEpisodeDetailsServices } from './types';

export interface AlertEpisodeDetailsHeaderSectionProps {
  episodeId: string;
  services: Pick<AlertEpisodeDetailsServices, 'data' | 'http' | 'expressions' | 'spaces'>;
  titleSize?: EuiTitleSize;
}

export const AlertEpisodeDetailsHeaderSection = ({
  episodeId,
  services,
  titleSize,
}: AlertEpisodeDetailsHeaderSectionProps) => {
  const { data: episode, isLoading: isLoadingEpisode } = useFetchEpisodeQuery({
    episodeId,
    services,
  });

  const ruleId = episode?.['rule.id'];
  const groupHash = episode?.group_hash;
  const lastStatus = episode?.['episode.status'];
  const severity = episode?.severity;

  const { data: episodeActionsMap } = useFetchEpisodeActions({
    episodeIds: [episodeId],
    services,
  });
  const { data: groupActionsMap } = useFetchGroupActions({
    groupHashes: groupHash ? [groupHash] : [],
    services,
  });
  const { ruleState } = useFetchRule({ id: ruleId, http: services.http });

  const episodeAction = episodeActionsMap?.get(episodeId);
  const groupAction = groupHash ? groupActionsMap?.get(groupHash) : undefined;
  const tags = groupAction?.tags ?? [];

  return (
    <AlertEpisodeDetailsHeader
      isLoadingEpisode={isLoadingEpisode}
      ruleState={ruleState}
      tags={tags}
      status={lastStatus}
      severity={severity}
      episodeAction={episodeAction}
      groupAction={groupAction}
      titleSize={titleSize}
    />
  );
};
