/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  Axis,
  BarSeries,
  Chart,
  Position,
  ScaleType,
  Settings,
  Tooltip,
  TooltipStickTo,
  niceTimeFormatter,
} from '@elastic/charts';
import type { BrushEndListener, XYBrushEvent } from '@elastic/charts';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
  useIsWithinBreakpoints,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useElasticChartsTheme } from '@kbn/charts-theme';
import type { IUiSettingsClient } from '@kbn/core/public';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import { i18n } from '@kbn/i18n';
import { isEnabledFailureStore, Streams } from '@kbn/streams-schema';
import React, { useCallback, useMemo } from 'react';
import useAsync from 'react-use/lib/useAsync';
import { isDraftGetResponse, getEsqlViewName } from '@kbn/streams-schema';
import { useKibana } from '../../hooks/use_kibana';
import { useStreamDetail } from '../../hooks/use_stream_detail';
import {
  STREAMS_HISTOGRAM_NUM_DATA_POINTS,
  useStreamDocCountsFetch,
} from '../../hooks/use_streams_doc_counts_fetch';
import { getMeaningfulBucketMs } from '../../util/stream_overview_esql';
import { useTimefilter } from '../../hooks/use_timefilter';
import { useTimeRangeUpdate } from '../../hooks/use_time_range_update';
import { esqlResultToTimeseries } from '../../util/esql_result_to_timeseries';
import { OverviewTimeFilter } from './overview_time_filter';
import { IngestChartStatistics } from './ingest_chart_statistics';

function getChartTimeZone(uiSettings: IUiSettingsClient) {
  const kibanaTimeZone = uiSettings.get<'Browser' | string>(UI_SETTINGS.DATEFORMAT_TZ);
  if (!kibanaTimeZone || kibanaTimeZone === 'Browser') {
    return 'local';
  }
  return kibanaTimeZone;
}

export function IngestRateChart() {
  const { definition } = useStreamDetail();

  if (!definition) {
    return null;
  }

  return <IngestRateChartContent definition={definition} />;
}

function IngestRateChartContent({ definition }: { definition: Streams.all.GetResponse }) {
  const {
    core: { uiSettings },
  } = useKibana();
  const { euiTheme } = useEuiTheme();

  const chartBaseTheme = useElasticChartsTheme();

  const barSeriesTimeZone = useMemo(() => getChartTimeZone(uiSettings), [uiSettings]);

  const canReadFailureStore = Streams.ingest.all.GetResponse.is(definition)
    ? definition.privileges.read_failure_store &&
      isEnabledFailureStore(definition.effective_failure_store)
    : false;
  const streamName = definition.stream.name;
  const isQueryStream = Streams.QueryStream.GetResponse.is(definition);
  const isDraft = isDraftGetResponse(definition);

  const esqlSource = isQueryStream
    ? definition.stream.query.view
    : isDraft
    ? getEsqlViewName(streamName)
    : streamName;

  const { timeState } = useTimefilter();
  const minInterval = getMeaningfulBucketMs(
    timeState.end - timeState.start,
    STREAMS_HISTOGRAM_NUM_DATA_POINTS
  );
  const xFormatter = niceTimeFormatter([timeState.start, timeState.end]);

  const { getStreamHistogram } = useStreamDocCountsFetch({
    groupTotalCountByTimestamp: true,
    getCanReadFailureStore: () => (isDraft ? false : canReadFailureStore),
    numDataPoints: STREAMS_HISTOGRAM_NUM_DATA_POINTS,
    // This chart only reads the histogram, never the Ingestion column, so skip the ingestion request.
    fetchIngestionDocCounts: false,
  });

  const histogramFetch = getStreamHistogram(esqlSource);
  const histogramResult = useAsync(() => histogramFetch, [histogramFetch]);

  const allTimeseries = useMemo(
    () =>
      esqlResultToTimeseries({
        result: histogramResult,
        metricNames: ['doc_count'],
      }),
    [histogramResult]
  );

  const { updateTimeRange } = useTimeRangeUpdate();

  const isStackedOverviewLayout = useIsWithinBreakpoints(['xs', 's', 'm', 'l']);

  const CHART_HEIGHT = isStackedOverviewLayout ? 100 : 200;

  const onBrushEnd = useCallback<BrushEndListener>(
    (brushEvent) => {
      const { x } = brushEvent as XYBrushEvent;
      if (!x) return;
      const [min, max] = x;
      updateTimeRange({
        from: new Date(min).toISOString(),
        to: new Date(max).toISOString(),
      });
    },
    [updateTimeRange]
  );

  const documentsSeriesName = i18n.translate(
    'xpack.streams.streamOverview.timeSeriesChart.legend.documents',
    { defaultMessage: 'Documents' }
  );

  const chartColumnCss = useMemo(
    () =>
      css({
        alignSelf: 'flex-start',
        minWidth: 0,
        width: '100%',
      }),
    []
  );

  return (
    <EuiPanel hasBorder paddingSize="m">
      <div data-test-subj="streamsAppStreamOverviewChartHeader">
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h3>{documentsSeriesName}</h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              <p>
                {i18n.translate(
                  'xpack.streams.streamOverview.ingestRateChartContent.forSelectedTimeRangeFlexItemLabel',
                  { defaultMessage: 'For selected time range' }
                )}
              </p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <OverviewTimeFilter />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
      </div>
      <EuiSpacer size="m" />

      <EuiFlexGroup
        alignItems="flexStart"
        gutterSize="l"
        responsive
        wrap
        data-test-subj="streamsAppStreamOverviewChartRow"
      >
        <EuiFlexItem grow css={chartColumnCss}>
          <div data-test-subj="streamsAppStreamOverviewChartPlotColumn">
            {histogramResult.loading && !histogramResult.value ? (
              <EuiFlexGroup
                justifyContent="center"
                alignItems="center"
                style={{ height: CHART_HEIGHT }}
              >
                <EuiFlexItem grow={false}>
                  <EuiLoadingChart size="l" />
                </EuiFlexItem>
              </EuiFlexGroup>
            ) : (
              <Chart
                id={`streams-ingest-rate-${streamName}`}
                size={{ width: '100%', height: CHART_HEIGHT }}
              >
                <Settings
                  showLegend={false}
                  legendPosition={Position.Bottom}
                  xDomain={{ min: timeState.start, max: timeState.end, minInterval }}
                  locale={i18n.getLocale()}
                  baseTheme={chartBaseTheme}
                  onBrushEnd={onBrushEnd}
                  allowBrushingLastHistogramBin
                />
                <Tooltip
                  stickTo={TooltipStickTo.Top}
                  headerFormatter={({ value }) => xFormatter(value)}
                />
                <Axis
                  id="x-axis"
                  position={Position.Bottom}
                  showOverlappingTicks
                  tickFormat={xFormatter}
                  gridLine={{ visible: false }}
                />
                <Axis
                  id="y-axis"
                  ticks={3}
                  position={Position.Left}
                  tickFormat={(value) => {
                    if (value === null) return '';
                    return String(value);
                  }}
                />
                {allTimeseries.map((series) => (
                  <BarSeries
                    key={series.id}
                    id={series.id}
                    timeZone={barSeriesTimeZone}
                    name={documentsSeriesName}
                    color={euiTheme.colors.vis.euiColorVis0}
                    xScaleType={ScaleType.Time}
                    yScaleType={ScaleType.Linear}
                    xAccessor="x"
                    yAccessors={['doc_count']}
                    data={series.data}
                    enableHistogramMode
                  />
                ))}
              </Chart>
            )}
            <EuiSpacer size="s" />
            <EuiFlexGroup
              gutterSize="xs"
              alignItems="center"
              responsive={false}
              wrap={false}
              data-test-subj="streamsAppStreamOverviewChartLegend"
            >
              <EuiFlexItem grow={false}>
                <span
                  aria-hidden
                  css={{
                    width: euiTheme.size.s,
                    height: euiTheme.size.s,
                    borderRadius: '50%',
                    backgroundColor: euiTheme.colors.vis.euiColorVis0,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {documentsSeriesName}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </div>
        </EuiFlexItem>
      </EuiFlexGroup>

      <IngestChartStatistics
        allTimeseries={allTimeseries}
        intervalMs={minInterval}
        timeStart={timeState.start}
        timeEnd={timeState.end}
        esqlSource={esqlSource}
        streamName={streamName}
        isQueryStream={isQueryStream}
        isDraft={isDraft}
      />
    </EuiPanel>
  );
}
