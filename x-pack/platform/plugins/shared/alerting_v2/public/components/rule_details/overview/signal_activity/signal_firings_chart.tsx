/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import {
  Axis,
  Chart,
  HistogramBarSeries,
  Position,
  ScaleType,
  Settings,
  type BrushEndListener,
  type XYBrushEvent,
} from '@elastic/charts';
import { i18n } from '@kbn/i18n';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import { PluginStart } from '@kbn/core-di';
import { useService } from '@kbn/core-di-browser';
import type { SignalFiringBucket } from '../../../../hooks/use_fetch_signal_firings';

const CHART_HEIGHT_PX = 200;

export interface SignalFiringsChartProps {
  buckets: SignalFiringBucket[];
  gteMs: number;
  lteMs: number;
  /** Histogram bucket width in epoch ms; required so sparse buckets render at full width. */
  minIntervalMs: number;
  timeZone?: string;
  /** Called when the user drag-selects a range on the chart (epoch ms). */
  onBrushRange: (fromMs: number, toMs: number) => void;
}

export const SignalFiringsChart: React.FC<SignalFiringsChartProps> = ({
  buckets,
  gteMs,
  lteMs,
  minIntervalMs,
  timeZone,
  onBrushRange,
}) => {
  const charts = useService(PluginStart('charts')) as ChartsPluginStart;
  const baseTheme = charts.theme.useChartsBaseTheme();

  const handleBrushEnd = useCallback(
    ({ x }: XYBrushEvent) => {
      if (x) onBrushRange(x[0], x[1]);
    },
    [onBrushRange]
  );

  const seriesName = i18n.translate('xpack.alertingV2.signalOverview.firingsSeriesName', {
    defaultMessage: 'Signals',
  });

  return (
    <Chart size={{ width: '100%', height: CHART_HEIGHT_PX }} data-test-subj="signalFiringsChart">
      <Settings
        baseTheme={baseTheme}
        locale={i18n.getLocale()}
        showLegend={false}
        xDomain={{ min: gteMs, max: lteMs, minInterval: minIntervalMs }}
        onBrushEnd={handleBrushEnd as BrushEndListener}
      />
      <Axis id="signalFiringsLeft" position={Position.Left} ticks={3} integersOnly />
      <Axis id="signalFiringsBottom" position={Position.Bottom} showOverlappingTicks />
      <HistogramBarSeries
        id="signalFirings"
        name={seriesName}
        xScaleType={ScaleType.Time}
        yScaleType={ScaleType.Linear}
        xAccessor="timeMs"
        yAccessors={['count']}
        data={buckets}
        timeZone={timeZone}
      />
    </Chart>
  );
};
