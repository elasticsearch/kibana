/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  LineAnnotation,
  RectAnnotationStyle,
  SeriesIdentifier,
  XYBrushEvent,
  XYChartSeriesIdentifier,
  SettingsSpec,
} from '@elastic/charts';
import {
  AreaSeries,
  Axis,
  BarSeries,
  Chart,
  CurveType,
  LineSeries,
  niceTimeFormatter,
  Position,
  RectAnnotation,
  ScaleType,
  Settings,
  Tooltip,
} from '@elastic/charts';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiSpacer, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ReactElement } from 'react';
import React, { useMemo } from 'react';
import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme';
import { useHistory } from 'react-router-dom';
import { useChartThemes } from '@kbn/observability-shared-plugin/public';
import { isExpectedBoundsComparison } from '../time_comparison/get_comparison_options';

import { useChartPointerEventContext } from '../../../context/chart_pointer_event/use_chart_pointer_event_context';
import { unit } from '../../../utils/style';
import { ChartContainer } from './chart_container';
import {
  EXPECTED_BOUNDS_SERIES_ID,
  getChartAnomalyTimeseries,
} from './helper/get_chart_anomaly_timeseries';
import { isTimeseriesEmpty, onBrushEnd } from './helper/helper';
import { expandTimeseriesWithDottedGapLines } from './utils/timeseries_gap_handling';
import type { TimeseriesChartWithContextProps } from './timeseries_chart_with_context';

const END_ZONE_LABEL = i18n.translate('xpack.apm.timeseries.endzone', {
  defaultMessage:
    'The selected time range does not include this entire bucket. It might contain partial data.',
});

interface TimeseriesChartProps extends TimeseriesChartWithContextProps {
  comparisonEnabled: boolean;
  offset?: string;
  timeZone: string;
  annotations?: Array<ReactElement<typeof RectAnnotation | typeof LineAnnotation>>;
  settings?: Partial<SettingsSpec>;
}
export function TimeseriesChart({
  id,
  height = unit * 16,
  fetchStatus,
  onToggleLegend,
  timeseries,
  yLabelFormat,
  yTickFormat,
  showAnnotations = true,
  yDomain,
  anomalyTimeseries,
  anomalyThreshold,
  customTheme = {},
  comparisonEnabled,
  offset,
  timeZone,
  annotations,
  settings,
}: TimeseriesChartProps) {
  const history = useHistory();
  const { chartRef, updatePointerEvent } = useChartPointerEventContext();
  const { euiTheme } = useEuiTheme();
  const isDarkMode = useKibanaIsDarkMode();
  const chartThemes = useChartThemes();
  const anomalyChartTimeseries = getChartAnomalyTimeseries({
    anomalyTimeseries,
    euiTheme,
    anomalyTimeseriesColor: anomalyTimeseries?.color,
    anomalyThreshold,
  });
  const isEmpty = isTimeseriesEmpty(timeseries);
  const isComparingExpectedBounds = comparisonEnabled && isExpectedBoundsComparison(offset);
  const timeseriesWithEdgeDots = useMemo(
    () => expandTimeseriesWithDottedGapLines(timeseries),
    [timeseries]
  );
  const allSeries = [
    ...timeseriesWithEdgeDots,
    ...(isComparingExpectedBounds ? anomalyChartTimeseries?.boundaries ?? [] : []),
    ...(anomalyChartTimeseries?.scores ?? []),
  ]
    // Sorting series so that area type series are before line series
    // This is a workaround so that the legendSort works correctly
    // Can be removed when https://github.com/elastic/elastic-charts/issues/1685 is resolved
    .sort(
      isComparingExpectedBounds ? (prev, curr) => prev.type.localeCompare(curr.type) : undefined
    );

  const xValues = timeseries.flatMap(({ data }) => data.map(({ x }) => x));
  const xValuesExpectedBounds =
    anomalyChartTimeseries?.boundaries?.flatMap(({ data }) => data.map(({ x }) => x)) ?? [];
  const min = Math.min(...xValues);
  const max = Math.max(...xValues, ...xValuesExpectedBounds);
  const xFormatter = niceTimeFormatter([min, max]);
  const xDomain = isEmpty ? { min: 0, max: 1 } : { min, max };

  const tooltipHeaderFormatter = (value: number): ReactElement | string => {
    const formattedValue = xFormatter(value);
    if (max === value) {
      return (
        <>
          <EuiFlexGroup
            alignItems="center"
            responsive={false}
            gutterSize="xs"
            css={{ fontWeight: 'normal' }}
          >
            <EuiFlexItem grow={false}>
              <EuiIcon type="info" aria-hidden={true} />
            </EuiFlexItem>
            <EuiFlexItem>{END_ZONE_LABEL}</EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
          {formattedValue}
        </>
      );
    }
    return formattedValue;
  };

  // Using custom legendSort here when comparing expected bounds
  // because by default elastic-charts will show legends for expected bounds first
  // but for consistency, we are making `Expected bounds` last
  // See https://github.com/elastic/elastic-charts/issues/1685
  const legendSort = isComparingExpectedBounds
    ? (a: SeriesIdentifier, b: SeriesIdentifier) => {
        if ((a as XYChartSeriesIdentifier)?.specId === EXPECTED_BOUNDS_SERIES_ID) return -1;
        if ((b as XYChartSeriesIdentifier)?.specId === EXPECTED_BOUNDS_SERIES_ID) return -1;
        return 1;
      }
    : undefined;

  const endZoneColor = isDarkMode ? euiTheme.colors.lightShade : euiTheme.colors.darkShade;
  const endZoneRectAnnotationStyle: Partial<RectAnnotationStyle> = {
    stroke: endZoneColor,
    fill: endZoneColor,
    strokeWidth: 0,
    opacity: isDarkMode ? 0.6 : 0.2,
  };

  function getChartType(type: string) {
    switch (type) {
      case 'area':
        return AreaSeries;
      case 'bar':
        return BarSeries;
      default:
        return LineSeries;
    }
  }

  return (
    <ChartContainer hasData={!isEmpty} height={height} status={fetchStatus} id={id}>
      <Chart ref={chartRef} id={id}>
        <Tooltip
          stickTo="top"
          showNullValues={false}
          headerFormatter={({ value }) => tooltipHeaderFormatter(value)}
        />
        <Settings
          onBrushEnd={(event) => onBrushEnd({ x: (event as XYBrushEvent).x, history })}
          theme={[
            customTheme,
            {
              areaSeriesStyle: {
                line: { visible: false },
              },
            },
            ...chartThemes.theme,
          ]}
          baseTheme={chartThemes.baseTheme}
          onPointerUpdate={updatePointerEvent}
          externalPointerEvents={{
            tooltip: { visible: true },
          }}
          showLegend
          legendSort={legendSort}
          legendPosition={Position.Bottom}
          xDomain={xDomain}
          onLegendItemClick={(legend) => {
            if (onToggleLegend) {
              onToggleLegend(legend);
            }
          }}
          locale={i18n.getLocale()}
          {...settings}
        />
        <Axis
          id="x-axis"
          position={Position.Bottom}
          showOverlappingTicks
          tickFormat={xFormatter}
          gridLine={{ visible: false }}
        />
        <Axis
          domain={yDomain}
          id="y-axis"
          ticks={3}
          position={Position.Left}
          tickFormat={yTickFormat ? yTickFormat : yLabelFormat}
          labelFormat={yLabelFormat}
        />
        {showAnnotations && annotations}
        <RectAnnotation
          id="__endzones__"
          zIndex={2}
          dataValues={[
            {
              coordinates: { x0: xValues[xValues.length - 2] },
              details: END_ZONE_LABEL,
            },
          ]}
          style={endZoneRectAnnotationStyle}
        />
        {allSeries.map((series, index) => {
          const Series = getChartType(series.type);

          return (
            <Series
              timeZone={timeZone}
              key={series.id ?? `${series.title}-${index}`}
              id={series.id || series.title}
              name={series.title}
              groupId={series.groupId}
              // Defaults to multi layer time axis as of Elastic Charts v70
              xScaleType={ScaleType.Time}
              yScaleType={ScaleType.Linear}
              xAccessor="x"
              yAccessors={series.yAccessors ?? ['y']}
              y0Accessors={series.y0Accessors}
              stackAccessors={series.stackAccessors ?? undefined}
              markSizeAccessor={series.markSizeAccessor}
              data={isEmpty ? [] : series.data}
              color={series.color}
              curve={CurveType.CURVE_MONOTONE_X}
              hideInLegend={series.hideLegend}
              fit={series.fit ?? undefined}
              filterSeriesInTooltip={series.hideTooltipValue ? () => false : undefined}
              areaSeriesStyle={series.areaSeriesStyle}
              lineSeriesStyle={series.lineSeriesStyle}
            />
          );
        })}
      </Chart>
    </ChartContainer>
  );
}
