/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiLoadingSpinner, EuiText } from '@elastic/eui';
import { useFetchEpisodeQuery } from '../../hooks/use_fetch_episode_query';
import { useFetchRule } from '../../hooks/use_fetch_rule';
import { isRuleLoading } from '../../types/rule_state';
import { getAlertEpisodeDetailsPath } from '../../constants';
import { AlertEpisodesRelated } from './related/related';
import type { AlertEpisodeDetailsServices } from './types';
import * as i18n from './translations';

export interface AlertEpisodesRelatedSectionProps {
  episodeId: string;
  services: Pick<AlertEpisodeDetailsServices, 'data' | 'http' | 'spaces'>;
  showHeading?: boolean;
  compressed?: boolean;
}

export const AlertEpisodesRelatedSection = ({
  episodeId,
  services,
  showHeading,
  compressed,
}: AlertEpisodesRelatedSectionProps) => {
  const getEpisodeDetailsHref = useCallback(
    (id: string) => services.http.basePath.prepend(getAlertEpisodeDetailsPath(id)),
    [services.http.basePath]
  );
  const {
    data: episode,
    isLoading: isLoadingEpisode,
    isError: isEpisodeError,
  } = useFetchEpisodeQuery({ episodeId, services });

  const ruleId = episode?.['rule.id'];
  const groupHash = episode?.group_hash;

  const { ruleState } = useFetchRule({ id: ruleId, http: services.http });

  if (isLoadingEpisode || (ruleId && isRuleLoading(ruleState))) {
    return <EuiLoadingSpinner size="m" data-test-subj="alertingV2EpisodesRelatedSectionLoading" />;
  }

  if (isEpisodeError || !ruleId) {
    return (
      <EuiText size="s" color="danger" data-test-subj="alertingV2EpisodesRelatedSectionError">
        {i18n.RELATED_SECTION_LOAD_ERROR}
      </EuiText>
    );
  }

  return (
    <AlertEpisodesRelated
      currentEpisodeId={episodeId}
      groupHash={groupHash}
      ruleState={ruleState}
      getEpisodeDetailsHref={getEpisodeDetailsHref}
      showHeading={showHeading}
      compressed={compressed}
    />
  );
};
