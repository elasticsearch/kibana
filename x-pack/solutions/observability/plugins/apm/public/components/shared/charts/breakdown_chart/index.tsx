/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TickFormatter, XYBrushEvent } from '@elastic/charts';
import {
  AnnotationDomainType,
  AreaSeries,
  Axis,
  Chart,
  CurveType,
  LineAnnotation,
  niceTimeFormatter,
  Position,
  ScaleType,
  Settings,
  Tooltip,
  LegendValue,
} from '@elastic/charts';
import { EuiIcon, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import moment from 'moment';
import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useChartThemes } from '@kbn/observability-shared-plugin/public';
import { getVizColorForIndex } from '../../../../../common/viz_colors';
import type { Annotation } from '../../../../../common/annotations';
import {
  asAbsoluteDateTime,
  asPercent,
  getDurationFormatter,
} from '../../../../../common/utils/formatters';
import type { Coordinate, TimeSeries } from '../../../../../typings/timeseries';
import { useChartPointerEventContext } from '../../../../context/chart_pointer_event/use_chart_pointer_event_context';
import type { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { unit } from '../../../../utils/style';
import { ChartContainer } from '../chart_container';
import { isTimeseriesEmpty, onBrushEnd } from '../helper/helper';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { sliceTimeseriesToValidYRange } from '../utils/timeseries_gap_handling';
import { getMaxY, getResponseTimeTickFormatter } from '../transaction_charts/helper';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { getTimeZone } from '../helper/timezone';

interface Props {
  fetchStatus: FETCH_STATUS;
  height?: number;
  showAnnotations: boolean;
  annotations: Annotation[];
  timeseries?: Array<TimeSeries<Coordinate>>;
  yAxisType: 'duration' | 'percentage';
  id?: string;
}

const asPercentBound = (y: number | null) => asPercent(y, 1);

export function BreakdownChart({
  fetchStatus,
  height = unit * 16,
  showAnnotations,
  annotations,
  timeseries,
  yAxisType,
  id,
}: Props) {
  const history = useHistory();
  const chartThemes = useChartThemes();
  const { core } = useApmPluginContext();
  const { chartRef, updatePointerEvent } = useChartPointerEventContext();
  const {
    query: { rangeFrom, rangeTo },
  } = useAnyOfApmParams('/services/{serviceName}', '/mobile-services/{serviceName}');
  const { euiTheme } = useEuiTheme();
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const min = moment.utc(start).valueOf();
  const max = moment.utc(end).valueOf();

  const xFormatter = niceTimeFormatter([min, max]);

  const annotationColor = euiTheme.colors.accentSecondary;

  const isEmpty = isTimeseriesEmpty(timeseries);

  const trimmedTimeseries = useMemo(
    () => (timeseries?.length ? sliceTimeseriesToValidYRange(timeseries) : timeseries),
    [timeseries]
  );

  const maxY = getMaxY(timeseries);
  const yTickFormat: TickFormatter =
    yAxisType === 'duration'
      ? getResponseTimeTickFormatter(getDurationFormatter(maxY))
      : asPercentBound;

  const timeZone = getTimeZone(core?.uiSettings);

  return (
    <ChartContainer height={height} hasData={!isEmpty} status={fetchStatus} id={id}>
      <Chart ref={chartRef}>
        <Tooltip stickTo="top" showNullValues />
        <Settings
          onBrushEnd={(event) => onBrushEnd({ x: (event as XYBrushEvent).x, history })}
          showLegend
          legendValues={[LegendValue.CurrentAndLastValue]}
          legendPosition={Position.Bottom}
          theme={chartThemes.theme}
          baseTheme={chartThemes.baseTheme}
          xDomain={{ min, max }}
          flatLegend
          onPointerUpdate={updatePointerEvent}
          externalPointerEvents={{
            tooltip: {
              visible: true,
            },
          }}
          locale={i18n.getLocale()}
        />
        <Axis
          id="x-axis"
          position={Position.Bottom}
          showOverlappingTicks
          tickFormat={xFormatter}
          gridLine={{ visible: false }}
        />
        <Axis id="y-axis" ticks={3} position={Position.Left} tickFormat={yTickFormat} />

        {showAnnotations && (
          <LineAnnotation
            id="annotations"
            domainType={AnnotationDomainType.XDomain}
            dataValues={annotations.map((annotation) => ({
              dataValue: annotation['@timestamp'],
              header: asAbsoluteDateTime(annotation['@timestamp']),
              details: annotation.text,
            }))}
            style={{
              line: { strokeWidth: 1, stroke: annotationColor, opacity: 1 },
            }}
            marker={<EuiIcon type="dot" color={annotationColor} aria-hidden={true} />}
            markerPosition={Position.Top}
          />
        )}

        {trimmedTimeseries?.length ? (
          trimmedTimeseries.map((serie, index) => {
            return (
              <AreaSeries
                timeZone={timeZone}
                key={serie.title}
                id={serie.title}
                name={serie.title}
                xScaleType={ScaleType.Linear}
                yScaleType={ScaleType.Linear}
                xAccessor="x"
                yAccessors={['y']}
                data={serie.data}
                stackAccessors={['x']}
                stackMode={yAxisType === 'percentage' ? 'percentage' : undefined}
                color={getVizColorForIndex(index, euiTheme)}
                curve={CurveType.CURVE_MONOTONE_X}
              />
            );
          })
        ) : (
          // When timeseries is empty, loads an AreaSeries chart to show the default empty message.
          <AreaSeries id="empty_chart" xAccessor="x" yAccessors={['y']} data={[]} />
        )}
      </Chart>
    </ChartContainer>
  );
}
