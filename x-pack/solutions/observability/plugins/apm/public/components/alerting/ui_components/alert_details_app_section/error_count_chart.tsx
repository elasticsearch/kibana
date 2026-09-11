/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactElement } from 'react';
import React from 'react';
import type { RecursivePartial } from '@elastic/eui';
import { EuiFlexItem, EuiPanel, EuiFlexGroup, EuiTitle } from '@elastic/eui';
import type { Theme } from '@elastic/charts';
import { i18n } from '@kbn/i18n';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import type { TopAlert } from '@kbn/observability-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { APIReturnType } from '@kbn/apm-api-shared';
import { ApmDocumentType } from '@kbn/apm-types';
import { CHART_SETTINGS, DEFAULT_DATE_FORMAT } from './constants';
import { usePreferredDataSourceAndBucketSize } from '../../../../hooks/use_preferred_data_source_and_bucket_size';
import { useFetcher } from '../../../../hooks/use_fetcher';
import { ChartType, getTimeSeriesColor } from '../../../shared/charts/helper/get_timeseries_color';
import { TimeseriesChart } from '../../../shared/charts/timeseries_chart';
import { asInteger } from '../../../../../common/utils/formatters';
import { APM_CHART_EBT_ELEMENTS } from '../../../shared/charts/ebt_constants';
import { RedMetricsChartActions } from './red_metrics_chart_actions';
import { useGetChartAlertAnnotations } from './use_get_chart_alert_annotations';

type ErrorDistribution =
  APIReturnType<'GET /internal/apm/services/{serviceName}/errors/distribution'>;

const INITIAL_STATE: ErrorDistribution = {
  currentPeriod: [],
  previousPeriod: [],
  bucketSize: 0,
};

export function ErrorCountChart({
  alert,
  serviceName,
  environment,
  start,
  end,
  comparisonChartTheme,
  timeZone,
  comparisonEnabled,
  offset,
  kuery = '',
  transactionName,
  groupId,
  threshold,
  ruleTypeId,
  compact,
  showAlertAnnotations,
}: {
  alert: TopAlert;
  serviceName: string;
  environment: string;
  start: string;
  end: string;
  comparisonChartTheme: RecursivePartial<Theme>;
  timeZone: string;
  comparisonEnabled: boolean;
  offset: string;
  kuery?: string;
  transactionName?: string;
  groupId?: string;
  threshold?: ReactElement;
  ruleTypeId?: string;
  /** When true, hide the threshold side panel even if `threshold` is provided. */
  compact?: boolean;
  /** When set, overrides the default annotation behavior (which is keyed off `threshold`). */
  showAlertAnnotations?: boolean;
}) {
  const {
    services: { uiSettings },
  } = useKibana();

  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery,
    numBuckets: 100,
    type: transactionName
      ? ApmDocumentType.TransactionMetric
      : ApmDocumentType.ServiceTransactionMetric,
  });

  const { data = INITIAL_STATE, status } = useFetcher(
    (callApmApi) => {
      if (serviceName && start && end && preferred) {
        return callApmApi('GET /internal/apm/services/{serviceName}/errors/distribution', {
          params: {
            path: { serviceName },
            query: {
              environment,
              kuery,
              start,
              end,
              groupId,
              transactionName,
              bucketSizeInSeconds: preferred.bucketSizeInSeconds,
            },
          },
        });
      }
    },
    [environment, serviceName, start, end, groupId, transactionName, kuery, preferred]
  );

  const dateFormat = (uiSettings && uiSettings.get(UI_SETTINGS.DATE_FORMAT)) || DEFAULT_DATE_FORMAT;

  const alertAnnotations = useGetChartAlertAnnotations({
    alert,
    showAnnotations: showAlertAnnotations ?? !!threshold,
    showThresholdAnnotation: !!threshold,
    dateFormat,
  });

  const { currentPeriodColor } = getTimeSeriesColor(ChartType.ERROR_OCCURRENCES);

  const timeseries = [
    {
      data: data.currentPeriod,
      type: 'bar' as const,
      color: currentPeriodColor,
      title: i18n.translate('xpack.apm.alertDetails.errorCountChart.title', {
        defaultMessage: 'Error occurrences',
      }),
    },
  ];

  return (
    <EuiFlexItem>
      <EuiPanel hasBorder={true}>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h2>
                {i18n.translate('xpack.apm.alertDetails.errorCountChart.chartTitle', {
                  defaultMessage: 'Errors',
                })}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
              <EuiFlexItem grow={false}>
                <RedMetricsChartActions
                  indexType="error"
                  queryParams={{
                    serviceName,
                    transactionName,
                    environment,
                    errorGroupId: groupId,
                  }}
                  timeRange={{ from: start, to: end }}
                  ruleTypeId={ruleTypeId}
                  element={APM_CHART_EBT_ELEMENTS.ERROR_COUNT}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiFlexGroup direction="row" gutterSize="m">
          {!!threshold && !compact && (
            <EuiFlexItem style={{ minWidth: 180 }} grow={1}>
              {threshold}
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={!!threshold && !compact ? 5 : undefined}>
            <TimeseriesChart
              id="errorCountChart"
              height={200}
              annotations={alertAnnotations}
              comparisonEnabled={comparisonEnabled}
              offset={offset}
              fetchStatus={status}
              customTheme={comparisonChartTheme}
              timeseries={timeseries}
              yLabelFormat={asInteger}
              timeZone={timeZone}
              settings={CHART_SETTINGS}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </EuiFlexItem>
  );
}
