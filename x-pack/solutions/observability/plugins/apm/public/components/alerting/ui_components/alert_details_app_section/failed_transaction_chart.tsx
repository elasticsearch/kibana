/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
/* Error Rate */

import type { ReactElement } from 'react';
import React from 'react';
import type { EuiPanelProps, RecursivePartial } from '@elastic/eui';
import { EuiFlexItem, EuiFlexGroup, EuiTitle, EuiIconTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { BoolQuery } from '@kbn/es-query';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import type { SettingsSpec, Theme } from '@elastic/charts';
import type { TopAlert } from '@kbn/observability-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ApmRuleType } from '@kbn/rule-data-utils';
import type { APIReturnType } from '@kbn/apm-api-shared';
import { ApmDocumentType } from '@kbn/apm-types';
import { CHART_SETTINGS, DEFAULT_DATE_FORMAT, THRESHOLD_SIDEBAR_MIN_WIDTH } from './constants';
import { useFetcher } from '../../../../hooks/use_fetcher';
import { ChartType, getTimeSeriesColor } from '../../../shared/charts/helper/get_timeseries_color';
import { errorRateI18n } from '../../../shared/charts/failed_transaction_rate_chart';
import { TimeseriesChart } from '../../../shared/charts/timeseries_chart';
import { yLabelFormat } from './helpers';
import { useGetChartAlertAnnotations } from './use_get_chart_alert_annotations';
import { usePreferredDataSourceAndBucketSize } from '../../../../hooks/use_preferred_data_source_and_bucket_size';
import { TransactionTypeSelect } from './transaction_type_select';
import { APM_CHART_EBT_ELEMENTS } from '../../../shared/charts/ebt_constants';
import { RedMetricsChartActions } from './red_metrics_chart_actions';
import { AnomalyChartPanel } from './anomaly_chart_panel';
import { AnomalySeverityBadge, type AnomalyChartInfo } from './anomaly_severity_badge';

type ErrorRate =
  APIReturnType<'GET /internal/apm/services/{serviceName}/transactions/charts/error_rate'>;

const INITIAL_STATE_ERROR_RATE: ErrorRate = {
  currentPeriod: {
    timeseries: [],
    average: null,
  },
  previousPeriod: {
    timeseries: [],
    average: null,
  },
};

export function FailedTransactionChart({
  alert,
  transactionType,
  transactionTypes,
  setTransactionType,
  transactionName,
  serviceName,
  environment,
  start,
  end,
  comparisonChartTheme,
  timeZone,
  comparisonEnabled,
  offset,
  kuery = '',
  filters,
  customAlertEvaluationThreshold,
  threshold,
  anomaly,
  ruleTypeId,
  compact,
  showAlertAnnotations,
  showChartActions = true,
  chartId = 'errorRate',
  panelPaddingSize,
  chartSettings,
}: {
  // Optional so the chart can render outside an alert context (e.g. the service flyout);
  // without it the alert annotations are simply omitted.
  alert?: TopAlert;
  transactionType?: string;
  transactionTypes?: string[];
  setTransactionType?: (transactionType: string) => void;
  transactionName?: string;
  serviceName: string;
  environment: string;
  start: string;
  end: string;
  comparisonChartTheme: RecursivePartial<Theme>;
  timeZone: string;
  comparisonEnabled: boolean;
  offset: string;
  kuery?: string;
  filters?: BoolQuery;
  customAlertEvaluationThreshold?: number;
  threshold?: ReactElement;
  anomaly?: AnomalyChartInfo;
  ruleTypeId?: ApmRuleType;
  /** When true, hide the threshold side panel even if `threshold` is provided. */
  compact?: boolean;
  /** When set, overrides the default annotation behavior (which is keyed off `threshold`). */
  showAlertAnnotations?: boolean;
  /** When false, hide the "Open" chart actions popover. */
  showChartActions?: boolean;
  /**
   * Elastic Charts id, which also names the tooltip portal. Hosts that restyle
   * tooltip portals by id (e.g. the service flyout) need a distinct value.
   */
  chartId?: string;
  /** Panel padding, for hosts with narrow chart columns (e.g. the service flyout). */
  panelPaddingSize?: EuiPanelProps['paddingSize'];
  /** Elastic Charts settings overrides, e.g. to hide synced-cursor tooltips in narrow hosts. */
  chartSettings?: Partial<SettingsSpec>;
}) {
  const {
    services: { uiSettings },
  } = useKibana();

  const { currentPeriodColor: currentPeriodColorErrorRate } = getTimeSeriesColor(
    ChartType.FAILED_TRANSACTION_RATE
  );

  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery,
    numBuckets: 100,
    type: transactionName
      ? ApmDocumentType.TransactionMetric
      : ApmDocumentType.ServiceTransactionMetric,
  });

  const { data: dataErrorRate = INITIAL_STATE_ERROR_RATE, status } = useFetcher(
    (callApmApi) => {
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
                filters: filters ? JSON.stringify(filters) : undefined,
                start,
                end,
                transactionType,
                transactionName,
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
      serviceName,
      start,
      end,
      transactionType,
      transactionName,
      preferred,
      kuery,
      filters,
    ]
  );

  const dateFormat = (uiSettings && uiSettings.get(UI_SETTINGS.DATE_FORMAT)) || DEFAULT_DATE_FORMAT;

  const alertAnnotations = useGetChartAlertAnnotations({
    alert,
    dateFormat,
    showAnnotations: showAlertAnnotations ?? !!threshold,
    showThresholdAnnotation: !!threshold,
    customAlertEvaluationThreshold,
    normalizeThreshold: (value) => value / 100,
  });

  const timeseriesErrorRate = [
    {
      data: dataErrorRate.currentPeriod.timeseries,
      type: 'linemark',
      color: currentPeriodColorErrorRate,
      title: i18n.translate('xpack.apm.errorRate.chart.errorRate', {
        defaultMessage: 'Failed transaction rate (avg.)',
      }),
    },
  ];

  const showTransactionTypeSelect = transactionType && transactionTypes && setTransactionType;

  return (
    <EuiFlexItem>
      <AnomalyChartPanel anomalyScore={anomaly?.score} paddingSize={panelPaddingSize}>
        {/* wrap moves the controls onto their own line in narrow hosts (e.g. the
            service flyout) instead of shrinking the title below its own width */}
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h2>
                {i18n.translate('xpack.apm.errorRate', {
                  defaultMessage: 'Failed transaction rate',
                })}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
          {anomaly && (
            <EuiFlexItem grow={false}>
              <AnomalySeverityBadge severity={anomaly.severity} score={anomaly.score} />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiIconTip content={errorRateI18n} position="right" />
          </EuiFlexItem>
          {showTransactionTypeSelect && (
            <EuiFlexItem grow={false}>
              <TransactionTypeSelect
                transactionType={transactionType}
                transactionTypes={transactionTypes}
                onChange={setTransactionType}
              />
            </EuiFlexItem>
          )}
          {showChartActions && (
            <EuiFlexItem>
              <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <RedMetricsChartActions
                    queryParams={{
                      serviceName,
                      environment,
                      transactionName,
                      transactionType,
                      kuery,
                    }}
                    timeRange={{ from: start, to: end }}
                    ruleTypeId={ruleTypeId}
                    element={APM_CHART_EBT_ELEMENTS.FAILED_TRANSACTION_RATE}
                    anomaly={anomaly}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiFlexGroup direction="row" gutterSize="m">
          {!!threshold && !compact && (
            <EuiFlexItem style={{ minWidth: THRESHOLD_SIDEBAR_MIN_WIDTH }} grow={1}>
              {threshold}
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={!!threshold && !compact ? 5 : undefined}>
            <TimeseriesChart
              id={chartId}
              height={200}
              showAnnotations={true}
              annotations={alertAnnotations}
              fetchStatus={status}
              timeseries={timeseriesErrorRate}
              yLabelFormat={yLabelFormat}
              yDomain={{ min: 0, max: 1 }}
              comparisonEnabled={comparisonEnabled}
              offset={offset}
              customTheme={comparisonChartTheme}
              timeZone={timeZone}
              settings={{ ...CHART_SETTINGS, ...chartSettings }}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </AnomalyChartPanel>
    </EuiFlexItem>
  );
}
