/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiFlexGroupProps } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiLink, EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { AnnotationsContextProvider } from '../../../../context/annotations/annotations_context';
import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import { ChartPointerEventContextProvider } from '../../../../context/chart_pointer_event/chart_pointer_event_context';
import { useBreakpoints } from '../../../../hooks/use_breakpoints';
import { useApmParams } from '../../../../hooks/use_apm_params';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { useApmRouter } from '../../../../hooks/use_apm_router';
import { ServiceOverviewThroughputChart } from '../../service_overview/service_overview_throughput_chart';
import { TransactionsTable } from '../../../shared/transactions_table';
import { MostUsedCharts } from './most_used_charts';
import { GeoMap } from './geo_map';
import { isAndroidAgentName } from '../../../../../common/agent_name';
import { FailedTransactionRateChart } from '../../../shared/charts/failed_transaction_rate_chart';
import { ServiceOverviewDependenciesTable } from '../../service_overview/service_overview_dependencies_table';
import { LatencyChart } from '../../../shared/charts/latency_chart';
import { useFiltersForEmbeddableCharts } from '../../../../hooks/use_filters_for_embeddable_charts';
import { getKueryWithMobileFilters } from '../../../../../common/utils/get_kuery_with_mobile_filters';
import { MobileStats } from './stats/stats';
import { MobileLocationStats } from './stats/location_stats';
import { useAdHocApmDataView } from '../../../../hooks/use_adhoc_apm_data_view';
import { AnomaliesAutomaticEnvironmentSelectionCallout } from '../../../shared/anomalies_automatic_environment_selection_callout';
/**
 * The height a chart should be if it's next to a table with 5 rows and a title.
 * Add the height of the pagination row.
 */
export const chartHeight = 288;

export function MobileServiceOverview() {
  const { serviceName, agentName } = useApmServiceContext();
  const router = useApmRouter();
  const { dataView } = useAdHocApmDataView();
  const isAndroidAgent = isAndroidAgentName(agentName);

  const {
    query,
    query: {
      environment,
      kuery,
      rangeFrom,
      rangeTo,
      device,
      osVersion,
      appVersion,
      netConnectionType,
      offset,
      comparisonEnabled,
      transactionType,
    },
  } = useApmParams('/mobile-services/{serviceName}/overview');

  const embeddableFilters = useFiltersForEmbeddableCharts({
    serviceName,
    environment,
  });

  const kueryWithMobileFilters = getKueryWithMobileFilters({
    device,
    osVersion,
    appVersion,
    netConnectionType,
    kuery,
  });

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });
  const dependenciesLink = router.link('/services/{serviceName}/dependencies', {
    path: {
      serviceName,
    },
    query,
  });

  // The default EuiFlexGroup breaks at 768, but we want to break at 1200, so we
  // observe the window width and set the flex directions of rows accordingly
  const { isLarge } = useBreakpoints();
  const isSingleColumn = isLarge;

  const latencyChartHeight = 200;
  const nonLatencyChartHeight = isSingleColumn ? latencyChartHeight : chartHeight;

  const rowDirection: EuiFlexGroupProps['direction'] = isSingleColumn ? 'column' : 'row';

  return (
    <AnnotationsContextProvider
      serviceName={serviceName}
      environment={environment}
      start={start}
      end={end}
    >
      <ChartPointerEventContextProvider>
        <EuiFlexGroup direction="column" gutterSize="s">
          {!isAndroidAgent && (
            <>
              <EuiFlexItem>
                <MobileStats start={start} end={end} kuery={kueryWithMobileFilters} />
                <EuiSpacer size="s" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel hasBorder={true}>
                  <EuiFlexGroup gutterSize="s">
                    <EuiFlexItem grow={8}>
                      <GeoMap
                        start={start}
                        end={end}
                        kuery={kueryWithMobileFilters}
                        filters={embeddableFilters}
                        dataView={dataView}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={3}>
                      <MobileLocationStats
                        start={start}
                        end={end}
                        kuery={kueryWithMobileFilters}
                        environment={environment}
                        offset={offset}
                        serviceName={serviceName}
                        comparisonEnabled={comparisonEnabled}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            </>
          )}

          <EuiFlexItem>
            <EuiPanel hasBorder={true}>
              <EuiFlexItem grow={false}>
                <EuiTitle size="xs">
                  <h2>
                    {i18n.translate('xpack.apm.serviceOverview.mostUsedTitle', {
                      defaultMessage: 'Most used',
                    })}
                  </h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiSpacer size="xs" />
              <EuiFlexItem>
                <MostUsedCharts
                  kuery={kueryWithMobileFilters}
                  start={start}
                  end={end}
                  environment={environment}
                  transactionType={transactionType}
                  serviceName={serviceName}
                />
              </EuiFlexItem>
            </EuiPanel>
          </EuiFlexItem>

          <EuiFlexItem>
            <AnomaliesAutomaticEnvironmentSelectionCallout />
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiPanel hasBorder={true}>
              <LatencyChart height={latencyChartHeight} kuery={kueryWithMobileFilters} />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction={rowDirection} gutterSize="s" responsive={false}>
              <EuiFlexItem grow={3}>
                <ServiceOverviewThroughputChart
                  height={nonLatencyChartHeight}
                  kuery={kueryWithMobileFilters}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={7}>
                <EuiPanel hasBorder={true}>
                  <TransactionsTable
                    kuery={kueryWithMobileFilters}
                    environment={environment}
                    fixedHeight={true}
                    start={start}
                    end={end}
                    showPerPageOptions={false}
                  />
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiFlexGroup direction={rowDirection} gutterSize="s" responsive={false}>
              {!isAndroidAgent && (
                <EuiFlexItem grow={3}>
                  <FailedTransactionRateChart
                    height={nonLatencyChartHeight}
                    showAnnotations={false}
                    kuery={kueryWithMobileFilters}
                  />
                </EuiFlexItem>
              )}

              <EuiFlexItem grow={7}>
                <EuiPanel hasBorder={true}>
                  <ServiceOverviewDependenciesTable
                    fixedHeight={true}
                    showPerPageOptions={false}
                    link={
                      <EuiLink
                        data-test-subj="apmMobileServiceOverviewViewDependenciesLink"
                        href={dependenciesLink}
                      >
                        {i18n.translate('xpack.apm.serviceOverview.dependenciesTableTabLink', {
                          defaultMessage: 'View dependencies',
                        })}
                      </EuiLink>
                    }
                  />
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </ChartPointerEventContextProvider>
    </AnnotationsContextProvider>
  );
}
