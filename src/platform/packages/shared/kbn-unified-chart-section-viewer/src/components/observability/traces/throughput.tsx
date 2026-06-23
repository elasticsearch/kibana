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
import { getThroughputChart } from './trace_charts_definition';
import { BREAKDOWN_LEGEND_CONFIG } from './constants';

type ThroughputChartContentProps = NonNullable<ReturnType<typeof getThroughputChart>>;

const ThroughputChartContent = ({
  esqlQuery,
  seriesType,
  unit,
  color,
  title,
}: ThroughputChartContentProps) => {
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
      metricName: 'id',
      metricTypes: ['counter'],
      units: ['count'],
      fieldTypes: [ES_FIELD_TYPES.DOUBLE],
    },
    color,
    seriesType,
    customFunction: 'COUNT',
    dimensions: breakdownField ? [{ name: breakdownField }] : [],
  });

  return (
    <Chart
      id="throughput"
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
      syncTooltips
      syncCursor
      extraDisabledActions={[ACTION_OPEN_IN_DISCOVER]}
      profileId={profileId}
    />
  );
};

export const ThroughputChart = () => {
  const { filters, indexes, metadataFields, breakdownField } = useTraceMetricsContext();
  const throughputChart = getThroughputChart({
    indexes,
    filters,
    metadataFields,
    breakdownField,
  });

  if (!throughputChart) {
    return null;
  }

  return <ThroughputChartContent {...throughputChart} />;
};
