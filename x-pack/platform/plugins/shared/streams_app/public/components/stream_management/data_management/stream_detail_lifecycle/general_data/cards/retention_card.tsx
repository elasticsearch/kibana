/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { Streams } from '@kbn/streams-schema';
import { isIlmLifecycle } from '@kbn/streams-schema';
import React, { useEffect } from 'react';
import { useKibana } from '../../../../../../hooks/use_kibana';
import { useStreamsAppFetch } from '../../../../../../hooks/use_streams_app_fetch';
import { BaseMetricCard } from '../../common/base_metric_card';
import { useLifecyclePreview } from '../../common/hooks/lifecycle_preview';
import { useLifecycleAfterSave } from '../../common/hooks/lifecycle_after_save';
import { getRetentionSubtitles, getRetentionValue } from './retention_card_helpers';

export const RetentionCard = ({ definition }: { definition: Streams.ingest.all.GetResponse }) => {
  const { refreshToken } = useLifecycleAfterSave();
  const {
    isActive: isPreviewActive,
    dataPhasesCount: previewDataPhasesCount,
    downsampleStepsCount: previewDownsampleStepsCount,
    retentionPeriod: previewRetentionPeriod,
  } = useLifecyclePreview();

  const {
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();

  const lifecycle = definition.effective_lifecycle;

  const isIlm = isIlmLifecycle(lifecycle);

  const {
    value: ilmStatsValue,
    loading: ilmStatsLoading,
    refresh: refreshIlmStats,
  } = useStreamsAppFetch(
    ({ signal }) => {
      if (!isIlm) return undefined;
      return streamsRepositoryClient.fetch('GET /internal/streams/{name}/lifecycle/_stats', {
        params: { path: { name: definition.stream.name } },
        signal,
      });
    },
    [streamsRepositoryClient, definition.stream.name, isIlm],
    {
      withTimeRange: false,
      withRefresh: true,
      clearValueOnNext: true,
      unsetValueOnError: true,
      disableToastOnError: true,
    }
  );

  useEffect(() => {
    if (!isIlm) return;
    if (refreshToken === 0) return;
    refreshIlmStats();
  }, [isIlm, refreshIlmStats, refreshToken]);

  const getMetrics = () => {
    const subtitle = getRetentionSubtitles({
      definition,
      lifecycle,
      isIlm,
      ilmStatsValue,
      isPreviewActive,
      previewDataPhasesCount,
      previewDownsampleStepsCount,
    });

    const data = getRetentionValue({
      isPreviewActive,
      previewRetentionPeriod,
      isIlm,
      ilmStatsLoading,
      ilmStatsValue,
      lifecycle,
    });

    return [
      {
        data,
        subtitle,
        'data-test-subj': 'retention',
      },
    ];
  };

  const title = i18n.translate('xpack.streams.streamDetailLifecycle.lifecycleSummary.title', {
    defaultMessage: 'Lifecycle summary',
  });

  const metrics = getMetrics();

  return <BaseMetricCard title={title} metrics={metrics} data-test-subj="retentionCard" />;
};
