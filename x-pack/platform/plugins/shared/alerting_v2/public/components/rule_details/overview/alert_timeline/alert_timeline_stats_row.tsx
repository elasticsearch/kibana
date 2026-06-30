/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type { AlertTimelineSummary } from '@kbn/alerting-v2-episodes-ui/alert_timeline';
import { formatDuration } from '@kbn/alerting-v2-episodes-ui/alert_timeline';
import { StatsRow, type StatItem } from '../stats_row';

export interface AlertTimelineStatsRowProps {
  summary: AlertTimelineSummary;
}

export const AlertTimelineStatsRow: React.FC<AlertTimelineStatsRowProps> = ({ summary }) => {
  const stats: StatItem[] = [
    {
      title: String(summary.stillOpen),
      description: i18n.translate('xpack.alertingV2.alertTimeline.statEpisodesOpen', {
        defaultMessage: 'Episodes open',
      }),
      dataTestSubj: 'alertTimelineStatEpisodesOpen',
    },
    {
      title: String(summary.episodesStarted),
      description: i18n.translate('xpack.alertingV2.alertTimeline.statEpisodesStarted', {
        defaultMessage: 'Episodes started',
      }),
      dataTestSubj: 'alertTimelineStatEpisodesStarted',
    },
    {
      title: String(summary.recovered),
      description: i18n.translate('xpack.alertingV2.alertTimeline.statRecovered', {
        defaultMessage: 'Recovered',
      }),
      dataTestSubj: 'alertTimelineStatRecovered',
    },
    {
      title: formatDuration(summary.medianDurationMs, '—'),
      description: i18n.translate('xpack.alertingV2.alertTimeline.statMedianDuration', {
        defaultMessage: 'Median duration',
      }),
      dataTestSubj: 'alertTimelineStatMedianDuration',
    },
  ];

  return <StatsRow stats={stats} data-test-subj="alertTimelineStatsRow" />;
};
