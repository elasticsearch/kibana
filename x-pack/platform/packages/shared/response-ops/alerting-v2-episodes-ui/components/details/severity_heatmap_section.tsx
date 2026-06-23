/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiLoadingSpinner, EuiText } from '@elastic/eui';
import { useFetchEpisodeEventsQuery } from '../../hooks/use_fetch_episode_events_query';
import { isSupportedEpisodeSeverity } from '../severity/severity_utils';
import type { AlertEpisodeDetailsServices } from './types';
import * as i18n from './translations';

const AlertEpisodeSeverityHeatmap = React.lazy(() =>
  import('./severity_heatmap').then((m) => ({ default: m.AlertEpisodeSeverityHeatmap }))
);

export interface AlertEpisodeSeverityHeatmapSectionProps {
  episodeId: string;
  services: Pick<AlertEpisodeDetailsServices, 'data' | 'spaces'>;
}

export const AlertEpisodeSeverityHeatmapSection = ({
  episodeId,
  services,
}: AlertEpisodeSeverityHeatmapSectionProps) => {
  const {
    data: eventRows,
    isLoading,
    isError,
  } = useFetchEpisodeEventsQuery({ episodeId, services });

  const severityEventRows = useMemo(
    () => (eventRows ?? []).filter((row) => isSupportedEpisodeSeverity(row.severity)),
    [eventRows]
  );

  if (isLoading) {
    return (
      <EuiLoadingSpinner size="m" data-test-subj="alertingV2EpisodeSeverityHeatmapSectionLoading" />
    );
  }

  if (isError) {
    return (
      <EuiText
        size="s"
        color="danger"
        data-test-subj="alertingV2EpisodeSeverityHeatmapSectionError"
      >
        {i18n.SEVERITY_HEATMAP_SECTION_LOAD_ERROR}
      </EuiText>
    );
  }

  if (severityEventRows.length === 0) {
    return null;
  }

  return (
    <React.Suspense fallback={<EuiLoadingSpinner size="m" />}>
      <AlertEpisodeSeverityHeatmap eventRows={severityEventRows} />
    </React.Suspense>
  );
};
