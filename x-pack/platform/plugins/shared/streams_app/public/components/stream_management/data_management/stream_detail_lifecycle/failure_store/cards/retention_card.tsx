/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { i18n } from '@kbn/i18n';
import { BaseMetricCard } from '../../common/base_metric_card';
import { getTimeSizeAndUnitLabel } from '../../../../../../util/format_size_units';
import type { useFailureStoreConfig } from '../../hooks/use_failure_store_config';
import { useLifecyclePreview } from '../../common/hooks/lifecycle_preview';

export const RetentionCard = ({
  failureStoreConfig,
  previewFailureStoreEnabled,
}: {
  failureStoreConfig: ReturnType<typeof useFailureStoreConfig>;
  previewFailureStoreEnabled?: boolean;
}) => {
  const {
    isActive: isPreviewActive,
    retentionPeriod: previewRetentionPeriod,
    dataPhasesCount: previewDataPhasesCount,
  } = useLifecyclePreview();
  const { failureStoreEnabled, customRetentionPeriod, defaultRetentionPeriod, retentionDisabled } =
    failureStoreConfig;

  const effectiveFailureStoreEnabled = previewFailureStoreEnabled ?? failureStoreEnabled;

  if (!effectiveFailureStoreEnabled) {
    return null;
  }

  const title = i18n.translate(
    'xpack.streams.streamDetailView.failureStoreEnabled.failureRetentionCard.title',
    {
      defaultMessage: 'Lifecycle summary',
    }
  );

  const savedRetentionPeriod = retentionDisabled
    ? undefined
    : customRetentionPeriod ?? defaultRetentionPeriod;

  const retentionPeriod = isPreviewActive ? previewRetentionPeriod : savedRetentionPeriod ?? null;

  const failureRetentionPeriod =
    (!isPreviewActive && retentionDisabled) || !retentionPeriod
      ? '∞'
      : getTimeSizeAndUnitLabel(retentionPeriod);

  const phasesCount = (() => {
    if (isPreviewActive && previewDataPhasesCount !== null) return previewDataPhasesCount;
    if (retentionDisabled) return 1;
    return savedRetentionPeriod ? 2 : 1;
  })();

  const subtitles = [
    i18n.translate('xpack.streams.streamDetailLifecycle.lifecycleSummary.dataPhasesCount', {
      defaultMessage: '{count, plural, one {# data phase} other {# data phases}}',
      values: { count: phasesCount },
    }),
  ];

  const metric = [
    {
      data: failureRetentionPeriod ?? '—',
      subtitle: subtitles,
      'data-test-subj': 'failureStoreRetention',
    },
  ];

  return (
    <BaseMetricCard title={title} metrics={metric} data-test-subj="failureStoreRetentionCard" />
  );
};
