/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useEffect } from 'react';
import { useHistory } from 'react-router-dom';

import { useShouldShowAnomalyUi } from '../../../../hooks/use_should_show_anomaly_ui';
import { useAnomalyThreshold } from '../../../../hooks/use_anomaly_threshold';
import { isTimeComparison } from '../../time_comparison/get_comparison_options';
import { getLatencyAggregationType } from '../../../../../common/latency_aggregation_types';
import { getDurationFormatter } from '../../../../../common/utils/formatters';
import { useTransactionLatencyChartsFetcher } from '../../../../hooks/use_transaction_latency_chart_fetcher';
import { TimeseriesChartWithContext } from '../timeseries_chart_with_context';
import { getMaxY, getResponseTimeTickFormatter } from '../transaction_charts/helper';
import { OpenAnomalies } from '../../links/machine_learning_links/open_anomalies';
import * as urlHelpers from '../../links/url_helpers';
import { getComparisonChartTheme } from '../../time_comparison/get_comparison_chart_theme';
import { useEnvironmentsContext } from '../../../../context/environments_context/use_environments_context';
import { AnomalyDetectorType } from '../../../../../common/anomaly_detection/apm_ml_detectors';
import { usePreferredServiceAnomalyTimeseries } from '../../../../hooks/use_preferred_service_anomaly_timeseries';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import { getLatencyChartScreenContext } from './get_latency_chart_screen_context';
import { LatencyAggregationTypeSelect } from './latency_aggregation_type_select';
import { OpenInDiscover } from '../../links/discover_links/open_in_discover';
import { APM_CHART_EBT_ELEMENTS } from '../ebt_constants';

interface Props {
  height?: number;
  kuery: string;
}

export type { Props };

export function filterNil<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function LatencyChart({ height, kuery }: Props) {
  const history = useHistory();

  const comparisonChartTheme = getComparisonChartTheme();

  const {
    query: { comparisonEnabled, latencyAggregationType, offset, rangeFrom, rangeTo },
    query,
  } = useAnyOfApmParams(
    '/services/{serviceName}/overview',
    '/services/{serviceName}/transactions',
    '/services/{serviceName}/transactions/view',
    '/mobile-services/{serviceName}/overview',
    '/mobile-services/{serviceName}/transactions',
    '/mobile-services/{serviceName}/transactions/view'
  );

  const { environment } = useEnvironmentsContext();

  const { transactionType, serviceName } = useApmServiceContext();

  const transactionName = 'transactionName' in query ? query.transactionName ?? null : null;

  const { latencyChartsData, latencyChartsStatus, bucketSizeInSeconds, start, end } =
    useTransactionLatencyChartsFetcher({
      kuery,
      environment,
      transactionName,
      latencyAggregationType: getLatencyAggregationType(latencyAggregationType),
    });

  const { currentPeriod, previousPeriod } = latencyChartsData;

  const shouldShowAnomalyUi = useShouldShowAnomalyUi();
  const { anomalyThreshold } = useAnomalyThreshold();
  const preferredAnomalyTimeseries = usePreferredServiceAnomalyTimeseries(
    AnomalyDetectorType.txLatency
  );
  const anomalyTimeseriesColor = previousPeriod?.color as string;

  const timeseries = [
    currentPeriod,
    comparisonEnabled && isTimeComparison(offset) ? previousPeriod : undefined,
  ].filter(filterNil);

  const latencyMaxY = getMaxY(timeseries);
  const latencyFormatter = getDurationFormatter(latencyMaxY);

  const setScreenContext = useApmPluginContext().observabilityAIAssistant?.service.setScreenContext;

  useEffect(() => {
    return setScreenContext?.(
      getLatencyChartScreenContext({
        serviceName,
        transactionName: transactionName ?? undefined,
        transactionType,
        environment,
        bucketSizeInSeconds,
      })
    );
  }, [
    serviceName,
    transactionName,
    transactionType,
    environment,
    setScreenContext,
    bucketSizeInSeconds,
    start,
    end,
  ]);

  return (
    <EuiFlexGroup direction="column" gutterSize="xs">
      <EuiFlexItem>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem>
            <EuiFlexGroup alignItems="center" wrap>
              <EuiFlexItem grow={false}>
                <EuiTitle size="xs">
                  <h2>
                    {i18n.translate('xpack.apm.serviceOverview.latencyChartTitle', {
                      defaultMessage: 'Latency',
                    })}
                  </h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <LatencyAggregationTypeSelect
                  latencyAggregationType={latencyAggregationType}
                  onChange={(type) => {
                    urlHelpers.push(history, {
                      query: {
                        latencyAggregationType: type,
                      },
                    });
                  }}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <OpenAnomalies
                  dataTestSubj="apmLatencyChartOpenAnomalies"
                  mlJobId={preferredAnomalyTimeseries?.jobId}
                  detectorType={AnomalyDetectorType.txLatency}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <OpenInDiscover
                  variant="iconButton"
                  dataTestSubj="apmLatencyChartOpenInDiscover"
                  label={i18n.translate('xpack.apm.latencyChart.openTracesInDiscover', {
                    defaultMessage: 'Open traces in Discover',
                  })}
                  indexType="traces"
                  rangeFrom={rangeFrom}
                  rangeTo={rangeTo}
                  queryParams={{
                    kuery,
                    serviceName,
                    environment,
                    transactionName: transactionName ?? undefined,
                    transactionType,
                    sortDirection: 'DESC',
                  }}
                  ebt={{
                    element: APM_CHART_EBT_ELEMENTS.LATENCY,
                  }}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem>
        <TimeseriesChartWithContext
          height={height}
          fetchStatus={latencyChartsStatus}
          id="latencyChart"
          customTheme={comparisonChartTheme}
          timeseries={timeseries}
          yLabelFormat={getResponseTimeTickFormatter(latencyFormatter)}
          anomalyTimeseries={
            shouldShowAnomalyUi && !!preferredAnomalyTimeseries
              ? {
                  ...preferredAnomalyTimeseries,
                  color: anomalyTimeseriesColor,
                }
              : undefined
          }
          anomalyThreshold={anomalyThreshold}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
