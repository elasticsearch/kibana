/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { useAnyOfApmParams } from './use_apm_params';
import { useTimeRange } from './use_time_range';
import { getComparisonOptions } from '../components/shared/time_comparison/get_comparison_options';

const fallbackPreviousPeriodText = i18n.translate(
  'xpack.apm.chart.comparison.defaultPreviousPeriodLabel',
  { defaultMessage: 'Previous period' }
);

export const usePreviousPeriodLabel = () => {
  const {
    query: { rangeFrom, rangeTo, offset },
  } = useAnyOfApmParams(
    '/services',
    '/dependencies/*',
    '/services/{serviceName}',
    '/mobile-services/{serviceName}/*'
  );

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const previousPeriodText = useMemo(() => {
    const timeComparisonOptions = getComparisonOptions({
      start,
      end,
      showSelectedBoundsOption: false,
    });
    const comparisonPeriodText =
      timeComparisonOptions.find((d) => d.value === offset || d.value.endsWith('ms'))?.text ??
      fallbackPreviousPeriodText;
    return comparisonPeriodText;
  }, [start, end, offset]);
  return previousPeriodText;
};
