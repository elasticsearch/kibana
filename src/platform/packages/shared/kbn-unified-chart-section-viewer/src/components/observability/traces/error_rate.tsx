/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import type { LensYBoundsConfig, LensSeriesLayer } from '@kbn/lens-embeddable-utils';
import { useTraceMetricsContext } from './context/trace_metrics_context';
import { Chart } from '../../chart';
import { ACTION_OPEN_IN_DISCOVER } from '../../../common/constants';
import { getErrorRateChart } from './trace_charts_definition';
import { BREAKDOWN_LEGEND_CONFIG } from './constants';
import { getLensMetricFormat } from '../../../common/utils';
import type { MetricUnit } from '../../../types';

const ERROR_RATE_Y_BOUNDS: LensYBoundsConfig = { mode: 'custom', lowerBound: 0, upperBound: 1 };

interface ErrorRateChartContentProps {
  query: string;
  seriesType: LensSeriesLayer['seriesType'];
  unit: MetricUnit;
  color: string;
  title: string;
}

const ErrorRateChartContent = ({
  query,
  seriesType,
  unit,
  color,
  title,
}: ErrorRateChartContentProps) => {
  const {
    services,
    fetchParams,
    discoverFetch$,
    onBrushEnd,
    onFilter,
    actions,
    profileId,
    breakdownField,
  } = useTraceMetricsContext();

  const chartLayers = useMemo<LensSeriesLayer[]>(
    () => [
      {
        type: 'series',
        seriesType,
        xAxis: {
          field: 'timestamp',
          type: 'dateHistogram',
        },
        yAxis: [
          {
            value: 'error_rate',
            label: 'error_rate',
            compactValues: true,
            seriesColor: color,
            ...getLensMetricFormat(unit),
          },
        ],
        breakdown: breakdownField ? [breakdownField] : undefined,
      },
    ],
    [seriesType, color, unit, breakdownField]
  );

  return (
    <Chart
      id="errorRate"
      esqlQuery={query}
      size="s"
      discoverFetch$={discoverFetch$}
      fetchParams={fetchParams}
      services={services}
      onBrushEnd={onBrushEnd}
      onFilter={onFilter}
      onExploreInDiscoverTab={actions.openInNewTab}
      title={title}
      chartLayers={chartLayers}
      legend={breakdownField ? BREAKDOWN_LEGEND_CONFIG : undefined}
      syncCursor
      syncTooltips
      yBounds={ERROR_RATE_Y_BOUNDS}
      extraDisabledActions={[ACTION_OPEN_IN_DISCOVER]}
      profileId={profileId}
    />
  );
};

export const ErrorRateChart = () => {
  const { filters, indexes, metadataFields, breakdownField } = useTraceMetricsContext();

  const errorRateChart = getErrorRateChart({
    indexes,
    filters,
    metadataFields,
    breakdownField,
  });

  if (!errorRateChart) {
    return null;
  }

  const { esqlQuery, seriesType, unit, color, title } = errorRateChart;

  return (
    <ErrorRateChartContent
      query={esqlQuery}
      seriesType={seriesType}
      unit={unit}
      color={color}
      title={title}
    />
  );
};
