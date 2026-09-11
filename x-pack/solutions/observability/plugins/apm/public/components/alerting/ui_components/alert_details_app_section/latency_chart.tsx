/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SettingsSpec, Theme } from '@elastic/charts';
import type { EuiPanelProps, RecursivePartial } from '@elastic/eui';
import type { ReactElement } from 'react';
import React, { useMemo } from 'react';
import { EuiFlexItem, EuiFlexGroup, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { BoolQuery } from '@kbn/es-query';
import { getDurationFormatter } from '@kbn/observability-plugin/common';
import type { TopAlert } from '@kbn/observability-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import type { ApmRuleType } from '@kbn/rule-data-utils';
import { filterNil } from '../../../shared/charts/latency_chart';
import { LatencyAggregationTypeSelect } from '../../../shared/charts/latency_chart/latency_aggregation_type_select';
import { TimeseriesChart } from '../../../shared/charts/timeseries_chart';
import {
  getMaxY,
  getResponseTimeTickFormatter,
} from '../../../shared/charts/transaction_charts/helper';
import { isTimeComparison } from '../../../shared/time_comparison/get_comparison_options';
import { useFetcher } from '../../../../hooks/use_fetcher';
import { getLatencyChartSelector } from '../../../../selectors/latency_chart_selectors';
import { LatencyAggregationType } from '../../../../../common/latency_aggregation_types';
import { getAggsTypeFromRule } from './helpers';
import { useGetChartAlertAnnotations } from './use_get_chart_alert_annotations';
import { ApmDocumentType } from '../../../../../common/document_type';
import { usePreferredDataSourceAndBucketSize } from '../../../../hooks/use_preferred_data_source_and_bucket_size';
import { CHART_SETTINGS, DEFAULT_DATE_FORMAT, THRESHOLD_SIDEBAR_MIN_WIDTH } from './constants';
import { TransactionTypeSelect } from './transaction_type_select';
import { APM_CHART_EBT_ELEMENTS } from '../../../shared/charts/ebt_constants';
import { RedMetricsChartActions } from './red_metrics_chart_actions';
import { AnomalyChartPanel } from './anomaly_chart_panel';
import { AnomalySeverityBadge, type AnomalyChartInfo } from './anomaly_severity_badge';

export function LatencyChart({
  alert,
  transactionType,
  transactionTypes,
  transactionName,
  serviceName,
  environment,
  start,
  end,
  ruleAggregationType,
  latencyAggregationType: latencyAggregationTypeProp,
  setLatencyAggregationType,
  setTransactionType,
  comparisonChartTheme,
  comparisonEnabled,
  offset,
  timeZone,
  customAlertEvaluationThreshold,
  kuery = '',
  filters,
  threshold,
  anomaly,
  ruleTypeId,
  compact,
  showAlertAnnotations,
  showChartActions = true,
  chartId = 'latencyChart',
  panelPaddingSize,
  chartSettings,
}: {
  // Optional so the chart can render outside an alert context (e.g. the service flyout);
  // without it the alert annotations are simply omitted.
  alert?: TopAlert;
  transactionType?: string;
  transactionTypes?: string[];
  transactionName?: string;
  serviceName: string;
  environment: string;
  start: string;
  end: string;
  comparisonChartTheme: RecursivePartial<Theme>;
  ruleAggregationType?: string;
  latencyAggregationType?: LatencyAggregationType;
  setLatencyAggregationType?: (value: LatencyAggregationType) => void;
  setTransactionType?: (value: string) => void;
  comparisonEnabled: boolean;
  offset: string;
  timeZone: string;
  customAlertEvaluationThreshold?: number;
  threshold?: ReactElement;
  anomaly?: AnomalyChartInfo;
  kuery?: string;
  filters?: BoolQuery;
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

  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery: '',
    numBuckets: 100,
    type: transactionName
      ? ApmDocumentType.TransactionMetric
      : ApmDocumentType.ServiceTransactionMetric,
  });

  const latencyAggregationType =
    latencyAggregationTypeProp ?? getAggsTypeFromRule(ruleAggregationType ?? 'avg');

  const { data, status } = useFetcher(
    (callApmApi) => {
      if (serviceName && start && end && latencyAggregationType && preferred) {
        return callApmApi(`GET /internal/apm/services/{serviceName}/transactions/charts/latency`, {
          params: {
            path: { serviceName },
            query: {
              environment,
              kuery,
              filters: filters ? JSON.stringify(filters) : undefined,
              start,
              end,
              transactionType,
              transactionName,
              latencyAggregationType,
              documentType: preferred.source.documentType,
              rollupInterval: preferred.source.rollupInterval,
              bucketSizeInSeconds: preferred.bucketSizeInSeconds,
              useDurationSummary:
                preferred.source.hasDurationSummaryField &&
                latencyAggregationType === LatencyAggregationType.avg,
            },
          },
        });
      }
    },
    [
      end,
      environment,
      latencyAggregationType,
      serviceName,
      start,
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
    customAlertEvaluationThreshold,
    showAnnotations: showAlertAnnotations ?? !!threshold,
    showThresholdAnnotation: !!threshold,
    dateFormat,
  });

  const memoizedData = useMemo(
    () =>
      getLatencyChartSelector({
        latencyChart: data,
        latencyAggregationType,
        previousPeriodLabel: '',
      }),
    [data, latencyAggregationType]
  );
  const { currentPeriod, previousPeriod } = memoizedData;

  const timeseriesLatency = [
    currentPeriod,
    comparisonEnabled && isTimeComparison(offset) ? previousPeriod : undefined,
  ].filter(filterNil);

  const latencyMaxY = getMaxY(timeseriesLatency);
  const latencyFormatter = getDurationFormatter(latencyMaxY);

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
                {i18n.translate('xpack.apm.dependencyLatencyChart.chartTitle', {
                  defaultMessage: 'Latency',
                })}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
          {anomaly && (
            <EuiFlexItem grow={false}>
              <AnomalySeverityBadge severity={anomaly.severity} score={anomaly.score} />
            </EuiFlexItem>
          )}
          {setLatencyAggregationType && (
            <EuiFlexItem grow={false}>
              <LatencyAggregationTypeSelect
                latencyAggregationType={latencyAggregationType}
                onChange={setLatencyAggregationType}
              />
            </EuiFlexItem>
          )}
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
                    element={APM_CHART_EBT_ELEMENTS.LATENCY}
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
              annotations={alertAnnotations}
              height={200}
              comparisonEnabled={comparisonEnabled}
              offset={offset}
              fetchStatus={status}
              customTheme={comparisonChartTheme}
              timeseries={timeseriesLatency}
              yLabelFormat={getResponseTimeTickFormatter(latencyFormatter)}
              timeZone={timeZone}
              settings={{ ...CHART_SETTINGS, ...chartSettings }}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </AnomalyChartPanel>
    </EuiFlexItem>
  );
}
