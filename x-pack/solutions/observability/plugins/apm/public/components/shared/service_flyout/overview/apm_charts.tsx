/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { Router } from '@kbn/shared-ux-router';
import { createMemoryHistory } from 'history';
import React, { useEffect, useMemo } from 'react';
import type { LatencyAggregationType } from '../../../../../common/latency_aggregation_types';
import { ChartPointerEventContextProvider } from '../../../../context/chart_pointer_event/chart_pointer_event_context';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { FailedTransactionChart } from '../../../alerting/ui_components/alert_details_app_section/failed_transaction_chart';
import { LatencyChart } from '../../../alerting/ui_components/alert_details_app_section/latency_chart';
import { ThroughputChart } from '../../../alerting/ui_components/alert_details_app_section/throughput_chart';
import { getTimeZone } from '../../charts/helper/timezone';
import { toQuery } from '../../links/url_helpers';
import { getComparisonChartTheme } from '../../time_comparison/get_comparison_chart_theme';

// Keep the synced crosshair across the three charts, but don't mirror the
// tooltip onto sibling charts: the flyout columns are too narrow for three
// simultaneous tooltips, which end up overlapping each other.
const FLYOUT_CHART_SETTINGS = {
  externalPointerEvents: { tooltip: { visible: false } },
} as const;

/**
 * Renders the same latency / failed transaction rate / throughput charts as the
 * alert details page (and the alerting dashboard embeddables), so the flyout
 * numbers match those pages by construction: same components, same APM chart APIs.
 */
export function ServiceFlyoutApmCharts({
  latencyAggregationType,
  setLatencyAggregationType,
  serviceName,
  environment,
  rangeFrom,
  rangeTo,
  transactionType,
  onRangeChange,
}: {
  latencyAggregationType: LatencyAggregationType;
  setLatencyAggregationType: (value: LatencyAggregationType) => void;
  serviceName: string;
  environment: string;
  rangeFrom: string;
  rangeTo: string;
  transactionType: string;
  onRangeChange: (range: { rangeFrom: string; rangeTo: string }) => void;
}) {
  const { euiTheme } = useEuiTheme();
  const { core } = useApmPluginContext();
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  // The flyout has no URL of its own, so brushing (which pushes rangeFrom/rangeTo
  // onto the chart's router history) goes through a memory history that is
  // translated into the flyout's local time range.
  const history = useMemo(() => createMemoryHistory(), []);
  useEffect(
    () =>
      history.listen((location) => {
        const { rangeFrom: nextRangeFrom, rangeTo: nextRangeTo } = toQuery(location.search);
        if (typeof nextRangeFrom === 'string' && typeof nextRangeTo === 'string') {
          onRangeChange({ rangeFrom: nextRangeFrom, rangeTo: nextRangeTo });
        }
      }),
    [history, onRangeChange]
  );

  const comparisonChartTheme = getComparisonChartTheme();
  const timeZone = getTimeZone(core.uiSettings);

  const commonProps = {
    serviceName,
    environment,
    start,
    end,
    transactionType,
    comparisonChartTheme,
    comparisonEnabled: false,
    offset: '',
    timeZone,
    showAlertAnnotations: false,
    showChartActions: false,
    // Narrow flyout columns: the default panel padding would leave too little
    // width for the chart headers and plots.
    panelPaddingSize: 's' as const,
    chartSettings: FLYOUT_CHART_SETTINGS,
  };

  return (
    <Router history={history}>
      <ChartPointerEventContextProvider>
        <div
          data-test-subj="serviceFlyoutApmCharts"
          css={css`
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: ${euiTheme.size.m};
          `}
        >
          {/* Distinct chart ids: the flyout globally pushes the page charts' tooltip
              portals (latencyChart/throughput/errorRate) below the flyout, and the
              tooltip portal is named after the chart id — reusing those ids here
              would hide the flyout's own tooltips. */}
          <LatencyChart
            {...commonProps}
            chartId="serviceFlyoutLatencyChart"
            latencyAggregationType={latencyAggregationType}
            setLatencyAggregationType={setLatencyAggregationType}
          />
          <FailedTransactionChart {...commonProps} chartId="serviceFlyoutErrorRate" />
          <ThroughputChart {...commonProps} chartId="serviceFlyoutThroughput" />
        </div>
      </ChartPointerEventContextProvider>
    </Router>
  );
}
