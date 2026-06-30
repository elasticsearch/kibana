/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  AnnotationDomainType,
  Axis,
  Chart,
  LineAnnotation,
  LineSeries,
  Position,
  ScaleType,
  Settings,
  Tooltip,
} from '@elastic/charts';
import { EuiIcon, useEuiTheme } from '@elastic/eui';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { TrendSeries, TrendThreshold } from './trend_types';
import { computeTrendAxisDomain } from './trend_axis_domain';

interface AlertEpisodeTrendChartServices {
  charts: ChartsPluginStart;
}

export interface AlertEpisodeTrendChartProps {
  series: TrendSeries;
  thresholds: TrendThreshold[];
}

const CHART_HEIGHT = 240;

export const AlertEpisodeTrendChart = ({ series, thresholds }: AlertEpisodeTrendChartProps) => {
  const { services } = useKibana<AlertEpisodeTrendChartServices>();
  const baseTheme = services.charts.theme.useChartsBaseTheme();
  const { euiTheme } = useEuiTheme();

  const thresholdLineStyle = {
    line: { stroke: euiTheme.colors.danger, strokeWidth: 2, opacity: 1, dash: [5, 5] },
  };

  const domain = computeTrendAxisDomain(series.points, thresholds);

  // Reserve right margin for threshold dot markers so they aren't clipped.
  const chartMargins = { right: thresholds.length > 0 ? 16 : 0 };

  return (
    <div style={{ height: CHART_HEIGHT }} data-test-subj="alertingV2EpisodeTrendChartCanvas">
      <Chart>
        <Tooltip
          headerFormatter={({ value }) =>
            new Date(value as number).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          }
        />
        <Settings baseTheme={baseTheme} theme={{ chartMargins }} showLegend={false} />
        <Axis id="time" position={Position.Bottom} />
        <Axis id="left" position={Position.Left} domain={domain} gridLine={{ visible: true }} />

        <LineSeries
          id={series.id}
          name={series.label}
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="x"
          yAccessors={['y']}
          data={series.points}
        />

        {thresholds.map((t) =>
          t.values.map((value, i) => (
            <LineAnnotation
              key={`${t.id}-${i}`}
              id={t.values.length > 1 ? `${t.id}-${i}` : t.id}
              domainType={AnnotationDomainType.YDomain}
              dataValues={[{ dataValue: value, details: t.label }]}
              markerPosition={Position.Right}
              // A small dot serves as the hover target — elastic-charts only shows the
              // annotation tooltip when a marker is present.
              marker={
                <EuiIcon type="dot" color={euiTheme.colors.danger} size="s" aria-hidden={true} />
              }
              style={thresholdLineStyle}
            />
          ))
        )}
      </Chart>
    </div>
  );
};
