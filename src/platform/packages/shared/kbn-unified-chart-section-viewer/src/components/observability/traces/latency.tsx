/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import { useTraceMetricsContext } from './context/trace_metrics_context';
import { Chart } from '../../chart';
import { useChartLayers } from '../../chart/hooks/use_chart_layers';
import { ACTION_OPEN_IN_DISCOVER } from '../../../common/constants';
import { getLatencyChart } from './trace_charts_definition';
import { BREAKDOWN_LEGEND_CONFIG } from './constants';

type LatencyChartContentProps = NonNullable<ReturnType<typeof getLatencyChart>>;

const LatencyChartContent = ({ esqlQuery, seriesType, color, title }: LatencyChartContentProps) => {
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

  const chartLayers = useChartLayers({
    metricItem: {
      metricName: 'duration_ms',
      metricTypes: ['histogram'],
      units: ['ms'],
      fieldTypes: [ES_FIELD_TYPES.DOUBLE],
    },
    color,
    seriesType,
    dimensions: breakdownField ? [{ name: breakdownField }] : [],
  });

  return (
    <Chart
      id="latency"
      esqlQuery={esqlQuery}
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
      extraDisabledActions={[ACTION_OPEN_IN_DISCOVER]}
      profileId={profileId}
    />
  );
};

export const LatencyChart = () => {
  const { filters, indexes, metadataFields, breakdownField } = useTraceMetricsContext();

  const latencyChart = getLatencyChart({
    indexes,
    filters,
    metadataFields,
    breakdownField,
  });

  if (!latencyChart) {
    return null;
  }

  return <LatencyChartContent {...latencyChart} />;
};
