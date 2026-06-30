/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import type { RectAnnotationStyle } from '@elastic/charts';
import {
  Axis,
  Chart,
  CurveType,
  LineSeries,
  LineAnnotation,
  Position,
  RectAnnotation,
  ScaleType,
  Settings,
  niceTimeFormatter,
  AnnotationDomainType,
} from '@elastic/charts';
import { EuiPanel, EuiText, EuiTitle, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ApmTimeseriesAttachmentData } from '../../../common/agent_builder/attachments';

// ─── Pure helpers (exported for unit tests) ──────────────────────────────────

/** Strips leading and trailing null-only points to avoid misleading flat lines. */
export function trimNullEdges(
  points: Array<{ timestamp: number; value: number | null }>
): Array<{ timestamp: number; value: number | null }> {
  let start = 0;
  let end = points.length - 1;
  while (start <= end && points[start].value === null) start++;
  while (end >= start && points[end].value === null) end--;
  return points.slice(start, end + 1);
}

/** Returns the Y-axis label for the given unit. */
export function unitLabel(unit: ApmTimeseriesAttachmentData['unit']): string {
  switch (unit) {
    case 'ms':
      return i18n.translate('xpack.apm.agentBuilder.attachments.apmTimeseries.unitMs', {
        defaultMessage: 'ms',
      });
    case '%':
      return i18n.translate('xpack.apm.agentBuilder.attachments.apmTimeseries.unitPct', {
        defaultMessage: '%',
      });
    case 'rpm':
      return i18n.translate('xpack.apm.agentBuilder.attachments.apmTimeseries.unitRpm', {
        defaultMessage: 'rpm',
      });
  }
}

/** Returns the default chart title for the given metric type. */
export function defaultMetricTitle(metric: ApmTimeseriesAttachmentData['metric']): string {
  switch (metric) {
    case 'latency':
      return i18n.translate('xpack.apm.agentBuilder.attachments.apmTimeseries.titleLatency', {
        defaultMessage: 'Latency',
      });
    case 'failedTransactionRate':
      return i18n.translate(
        'xpack.apm.agentBuilder.attachments.apmTimeseries.titleFailedTransactionRate',
        { defaultMessage: 'Failed Transaction Rate' }
      );
    case 'throughput':
      return i18n.translate('xpack.apm.agentBuilder.attachments.apmTimeseries.titleThroughput', {
        defaultMessage: 'Throughput',
      });
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

export interface AgentApmTimeseriesProps {
  data: ApmTimeseriesAttachmentData;
}

export function AgentApmTimeseries({ data }: AgentApmTimeseriesProps) {
  const { dataPoints, metric, unit, threshold, alertStart, title, serviceName } = data;
  const { euiTheme } = useEuiTheme();

  // Filter nulls for display — @elastic/charts LineSeries handles null as a
  // gap (no line drawn), which is the correct behaviour for sparse buckets.
  const chartData = useMemo(
    () =>
      trimNullEdges(dataPoints).map((p) => ({
        x: p.timestamp,
        y: p.value,
      })),
    [dataPoints]
  );

  const allTimestamps = chartData.map((p) => p.x);
  const minX = allTimestamps.length > 0 ? Math.min(...allTimestamps) : 0;
  const maxX = allTimestamps.length > 0 ? Math.max(...allTimestamps) : 0;

  const chartTitle = title ?? defaultMetricTitle(metric);
  const yLabel = unitLabel(unit);

  const isAllNull = dataPoints.every((p) => p.value === null);

  return (
    <EuiPanel hasBorder paddingSize="m">
      <EuiTitle size="xs">
        <h4>
          {chartTitle}
          {' — '}
          {serviceName}
        </h4>
      </EuiTitle>

      {isAllNull ? (
        <EuiText size="s" color="subdued" style={{ marginTop: euiTheme.size.m }}>
          <p>
            {i18n.translate('xpack.apm.agentBuilder.attachments.apmTimeseries.noData', {
              defaultMessage: 'No data available for this time range.',
            })}
          </p>
        </EuiText>
      ) : (
        <div style={{ height: 220, marginTop: euiTheme.size.s }}>
          <Chart>
            <Settings showLegend={false} />

            {/* X axis — time */}
            <Axis
              id="x-axis"
              position={Position.Bottom}
              tickFormat={niceTimeFormatter([minX, maxX])}
              gridLine={{ visible: false }}
            />

            {/* Y axis — metric value */}
            <Axis
              id="y-axis"
              position={Position.Left}
              tickFormat={(v: number) => `${v.toFixed(1)} ${yLabel}`}
              gridLine={{ visible: true }}
            />

            {/* Main series */}
            <LineSeries
              id="metric"
              name={chartTitle}
              xScaleType={ScaleType.Time}
              yScaleType={ScaleType.Linear}
              xAccessor="x"
              yAccessors={['y']}
              data={chartData}
              curve={CurveType.LINEAR}
              lineSeriesStyle={{
                line: { stroke: euiTheme.colors.primary, strokeWidth: 2 },
                point: { visible: 'never' },
              }}
            />

            {/* Optional threshold annotation */}
            {threshold != null && (
              <LineAnnotation
                id="threshold"
                domainType={AnnotationDomainType.YDomain}
                dataValues={[{ dataValue: threshold }]}
                style={{
                  line: {
                    stroke: euiTheme.colors.danger,
                    strokeWidth: 1.5,
                    opacity: 0.8,
                    dash: [4, 4],
                  },
                }}
                marker={
                  <EuiText size="xs" color="danger">
                    {i18n.translate(
                      'xpack.apm.agentBuilder.attachments.apmTimeseries.thresholdLabel',
                      { defaultMessage: 'Threshold' }
                    )}
                  </EuiText>
                }
                markerPosition={Position.Right}
              />
            )}

            {/* Optional alert window shading */}
            {alertStart != null && maxX > 0 && (
              <RectAnnotation
                id="alert-window"
                dataValues={[{ coordinates: { x0: alertStart, x1: maxX } }]}
                style={
                  {
                    fill: euiTheme.colors.danger,
                    opacity: 0.08,
                  } as RectAnnotationStyle
                }
              />
            )}
          </Chart>
        </div>
      )}
    </EuiPanel>
  );
}
