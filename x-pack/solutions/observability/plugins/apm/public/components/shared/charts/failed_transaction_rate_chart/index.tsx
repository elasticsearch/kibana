/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiPanel, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIconTip } from '@elastic/eui';
import { useShouldShowAnomalyUi } from '../../../../hooks/use_should_show_anomaly_ui';
import { usePreviousPeriodLabel } from '../../../../hooks/use_previous_period_text';
import { isTimeComparison } from '../../time_comparison/get_comparison_options';
import type { APIReturnType } from '../../../../services/rest/create_call_apm_api';
import { asPercent } from '../../../../../common/utils/formatters';
import { FETCH_STATUS, useFetcher } from '../../../../hooks/use_fetcher';
import { useLegacyUrlParams } from '../../../../context/url_params_context/use_url_params';
import { TimeseriesChartWithContext } from '../timeseries_chart_with_context';
import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import { getComparisonChartTheme } from '../../time_comparison/get_comparison_chart_theme';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { useEnvironmentsContext } from '../../../../context/environments_context/use_environments_context';
import { AnomalyDetectorType } from '../../../../../common/anomaly_detection/apm_ml_detectors';
import { usePreferredServiceAnomalyTimeseries } from '../../../../hooks/use_preferred_service_anomaly_timeseries';
import { ChartType, getTimeSeriesColor } from '../helper/get_timeseries_color';
import { usePreferredDataSourceAndBucketSize } from '../../../../hooks/use_preferred_data_source_and_bucket_size';
import { ApmDocumentType } from '../../../../../common/document_type';
import { OpenInDiscover } from '../../links/discover_links/open_in_discover';
import { APM_CHART_EBT_ELEMENTS } from '../ebt_constants';
import { OpenAnomalies } from '../../links/machine_learning_links/open_anomalies';
import { useAnomalyThreshold } from '../../../../hooks/use_anomaly_threshold';

function yLabelFormat(y?: number | null) {
  return asPercent(y || 0, 1);
}

interface Props {
  height?: number;
  showAnnotations?: boolean;
  kuery: string;
}

type ErrorRate =
  APIReturnType<'GET /internal/apm/services/{serviceName}/transactions/charts/error_rate'>;

const INITIAL_STATE: ErrorRate = {
  currentPeriod: {
    timeseries: [],
    average: null,
  },
  previousPeriod: {
    timeseries: [],
    average: null,
  },
};

export const errorRateI18n = i18n.translate('xpack.apm.errorRate.tip', {
  defaultMessage:
    "The percentage of failed transactions for the selected service. HTTP server transactions with a 4xx status code (client error) aren't considered failures because the caller, not the server, caused the failure.",
});
export function FailedTransactionRateChart({ height, showAnnotations = true, kuery }: Props) {
  const {
    urlParams: { transactionName },
  } = useLegacyUrlParams();

  const {
    query: { rangeFrom, rangeTo, comparisonEnabled, offset },
  } = useAnyOfApmParams('/services/{serviceName}', '/mobile-services/{serviceName}');

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    numBuckets: 100,
    kuery,
    type: transactionName
      ? ApmDocumentType.TransactionMetric
      : ApmDocumentType.ServiceTransactionMetric,
  });

  const { environment } = useEnvironmentsContext();

  const shouldShowAnomalyUi = useShouldShowAnomalyUi();
  const { anomalyThreshold } = useAnomalyThreshold();
  const preferredAnomalyTimeseries = usePreferredServiceAnomalyTimeseries(
    AnomalyDetectorType.txFailureRate
  );

  const { serviceName, transactionType, transactionTypeStatus } = useApmServiceContext();

  const comparisonChartTheme = getComparisonChartTheme();

  const { data = INITIAL_STATE, status } = useFetcher(
    (callApmApi) => {
      if (!transactionType && transactionTypeStatus === FETCH_STATUS.SUCCESS) {
        return Promise.resolve(INITIAL_STATE);
      }

      if (transactionType && serviceName && start && end && preferred) {
        return callApmApi(
          'GET /internal/apm/services/{serviceName}/transactions/charts/error_rate',
          {
            params: {
              path: {
                serviceName,
              },
              query: {
                environment,
                kuery,
                start,
                end,
                transactionType,
                transactionName,
                offset: comparisonEnabled && isTimeComparison(offset) ? offset : undefined,
                documentType: preferred.source.documentType,
                rollupInterval: preferred.source.rollupInterval,
                bucketSizeInSeconds: preferred.bucketSizeInSeconds,
              },
            },
          }
        );
      }
    },
    [
      environment,
      kuery,
      serviceName,
      start,
      end,
      transactionType,
      transactionTypeStatus,
      transactionName,
      offset,
      comparisonEnabled,
      preferred,
    ]
  );

  const { currentPeriodColor, previousPeriodColor } = getTimeSeriesColor(
    ChartType.FAILED_TRANSACTION_RATE
  );

  const previousPeriodLabel = usePreviousPeriodLabel();
  const timeseries = [
    {
      data: data?.currentPeriod?.timeseries ?? [],
      type: 'linemark',
      color: currentPeriodColor,
      title: i18n.translate('xpack.apm.errorRate.chart.errorRate', {
        defaultMessage: 'Failed transaction rate (avg.)',
      }),
    },
    ...(comparisonEnabled
      ? [
          {
            data: data?.previousPeriod?.timeseries ?? [],
            type: 'area',
            color: previousPeriodColor,
            title: previousPeriodLabel,
          },
        ]
      : []),
  ];

  return (
    <EuiPanel hasBorder={true}>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h2>
                  {i18n.translate('xpack.apm.errorRate', {
                    defaultMessage: 'Failed transaction rate',
                  })}
                </h2>
              </EuiTitle>
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiIconTip content={errorRateI18n} position="right" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <OpenAnomalies
                dataTestSubj="apmFailedTransactionRateChartOpenAnomalies"
                mlJobId={preferredAnomalyTimeseries?.jobId}
                detectorType={AnomalyDetectorType.txFailureRate}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <OpenInDiscover
                dataTestSubj="apmFailedTransactionRateChartOpenInDiscover"
                variant="iconButton"
                label={i18n.translate('xpack.apm.failedTransactionRateChart.openTracesInDiscover', {
                  defaultMessage: 'Open traces in Discover',
                })}
                indexType="traces"
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                queryParams={{
                  kuery,
                  serviceName,
                  environment,
                  transactionName,
                  transactionType,
                  sortDirection: 'DESC',
                }}
                ebt={{
                  element: APM_CHART_EBT_ELEMENTS.FAILED_TRANSACTION_RATE,
                }}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <TimeseriesChartWithContext
        id="errorRate"
        height={height}
        showAnnotations={showAnnotations}
        fetchStatus={status}
        timeseries={timeseries}
        yLabelFormat={yLabelFormat}
        yDomain={{ min: 0, max: 1 }}
        customTheme={comparisonChartTheme}
        anomalyTimeseries={
          shouldShowAnomalyUi && !!preferredAnomalyTimeseries
            ? {
                ...preferredAnomalyTimeseries,
                color: previousPeriodColor,
              }
            : undefined
        }
        anomalyThreshold={anomalyThreshold}
      />
    </EuiPanel>
  );
}
