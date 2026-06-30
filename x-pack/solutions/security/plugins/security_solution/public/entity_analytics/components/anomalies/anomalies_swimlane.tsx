/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  Chart,
  Heatmap,
  type HeatmapStyle,
  type Predicate,
  type RecursivePartial,
  ScaleType,
  Settings,
} from '@elastic/charts';
import { EuiFlexItem } from '@elastic/eui';
import { useElasticChartsTheme } from '@kbn/charts-theme';
import { i18n } from '@kbn/i18n';
import React, { useMemo } from 'react';
import { deriveBucketInterval } from '../../../../common/entity_analytics/anomalies/derive_bucket_interval';
import { getAnomalyChartStyling } from '../recent_anomalies/anomaly_chart_styling';
import type { AnomalyBand } from '../recent_anomalies/anomaly_bands';
import {
  ENTITY_ANOMALIES_SWIMLANE_MAX_SCORE,
  ENTITY_ANOMALIES_SWIMLANE_X_AXIS_LABEL,
} from './translations';

const SWIMLANE_X_ACCESSOR_KEY = '@timestamp';
const SWIMLANE_Y_ACCESSOR_KEY = 'record_score';

const heatmapComponentStyle: RecursivePartial<HeatmapStyle> = {
  brushTool: {
    visible: false,
  },
  cell: {
    maxWidth: 'fill',
    label: {
      visible: false,
    },
    border: {
      stroke: 'transparent',
      strokeWidth: 0,
    },
  },
  xAxisLabel: {
    fontSize: 12,
    padding: { top: 10, bottom: 10 },
  },
  yAxisLabel: {
    visible: false,
    fontSize: 14,
    width: 'auto',
    padding: { left: 10, right: 10 },
  },
};

const dateLabelFormatter = new Intl.DateTimeFormat(i18n.getLocale(), {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Formats x-axis ticks as "May 25, 2026". */
const formatDateTick = (value: string | number): string => {
  const ms = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(ms)) {
    return '';
  }
  return dateLabelFormatter.format(new Date(ms));
};

interface AnomaliesSwimlaneProps {
  anomalyBands: AnomalyBand[];
  from: number;
  heatmapId: string;
  records: Array<Record<string, unknown>>;
  to: number;
  yAxisAccessor: string;
  yAxisNames: string[];
  ySortPredicate?: Predicate;
}

export const AnomaliesSwimlane: React.FC<AnomaliesSwimlaneProps> = ({
  anomalyBands,
  from,
  heatmapId,
  records,
  to,
  yAxisNames,
  yAxisAccessor,
  ySortPredicate = 'numDesc',
}) => {
  const xDomain = useMemo(() => ({ min: from, max: to }), [from, to]);
  const bucketInterval = useMemo(() => deriveBucketInterval(from, to), [from, to]);

  const chartBands = useMemo(
    () => anomalyBands.map(({ start, end, color }) => ({ start, end, color })),
    [anomalyBands]
  );

  const styling = getAnomalyChartStyling(true);
  const baseTheme = useElasticChartsTheme();

  return (
    <EuiFlexItem
      css={{
        height: `${styling.heightOfHeatmap(yAxisNames.length)}px`,
      }}
    >
      <Chart>
        <Settings
          baseTheme={baseTheme}
          locale={i18n.getLocale()}
          theme={{ heatmap: heatmapComponentStyle }}
          xDomain={xDomain}
        />
        <Heatmap
          id={heatmapId}
          xScale={{
            type: ScaleType.Time,
            interval: { type: 'fixed', value: bucketInterval.value, unit: bucketInterval.unit },
          }}
          colorScale={{
            type: 'bands',
            bands: chartBands,
          }}
          data={records}
          name={ENTITY_ANOMALIES_SWIMLANE_MAX_SCORE}
          xAccessor={SWIMLANE_X_ACCESSOR_KEY}
          xAxisLabelName={ENTITY_ANOMALIES_SWIMLANE_X_AXIS_LABEL}
          xAxisLabelFormatter={formatDateTick}
          yAccessor={yAxisAccessor}
          yAxisLabelName={yAxisAccessor}
          ySortPredicate={ySortPredicate}
          valueAccessor={SWIMLANE_Y_ACCESSOR_KEY}
        />
      </Chart>
    </EuiFlexItem>
  );
};
