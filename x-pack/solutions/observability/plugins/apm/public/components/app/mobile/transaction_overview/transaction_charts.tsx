/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGrid, EuiFlexItem, EuiPanel, EuiSpacer } from '@elastic/eui';
import React from 'react';
import { AnnotationsContextProvider } from '../../../../context/annotations/annotations_context';
import { ChartPointerEventContextProvider } from '../../../../context/chart_pointer_event/chart_pointer_event_context';
import { ServiceOverviewThroughputChart } from '../../service_overview/service_overview_throughput_chart';
import { SessionsChart } from '../charts/sessions_chart';
import { HttpRequestsChart } from '../charts/http_requests_chart';
import { LatencyChart } from '../../../shared/charts/latency_chart';
import { FailedTransactionRateChart } from '../../../shared/charts/failed_transaction_rate_chart';
import { AnomaliesAutomaticEnvironmentSelectionCallout } from '../../../shared/anomalies_automatic_environment_selection_callout';

export function MobileTransactionCharts({
  serviceName,
  kuery,
  environment,
  start,
  end,
  transactionType,
  offset,
  comparisonEnabled,
}: {
  serviceName: string;
  kuery: string;
  environment: string;
  start: string;
  end: string;
  transactionType?: string;
  offset?: string;
  comparisonEnabled: boolean;
}) {
  return (
    <AnnotationsContextProvider
      serviceName={serviceName}
      environment={environment}
      start={start}
      end={end}
    >
      <ChartPointerEventContextProvider>
        <EuiFlexGrid columns={2} gutterSize="s">
          <EuiFlexItem data-cy={'mobile-transaction-session-chart'}>
            <SessionsChart
              kuery={kuery}
              start={start}
              end={end}
              environment={environment}
              serviceName={serviceName}
              transactionType={transactionType}
              offset={offset}
              comparisonEnabled={comparisonEnabled}
            />
          </EuiFlexItem>
          <EuiFlexItem data-cy={'mobile-transaction-http-chart'}>
            <HttpRequestsChart
              kuery={kuery}
              start={start}
              end={end}
              environment={environment}
              serviceName={serviceName}
              transactionType={transactionType}
              offset={offset}
              comparisonEnabled={comparisonEnabled}
            />
          </EuiFlexItem>
        </EuiFlexGrid>

        <EuiSpacer size="s" />

        <AnomaliesAutomaticEnvironmentSelectionCallout />

        <EuiSpacer size="s" />

        <EuiFlexGrid columns={3} gutterSize="s">
          <EuiFlexItem data-cy={'mobile-transaction-duration-charts'}>
            <EuiPanel hasBorder={true}>
              <LatencyChart kuery={kuery} />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem style={{ flexShrink: 1 }}>
            <ServiceOverviewThroughputChart kuery={kuery} />
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <FailedTransactionRateChart kuery={kuery} />
          </EuiFlexItem>
        </EuiFlexGrid>
      </ChartPointerEventContextProvider>
    </AnnotationsContextProvider>
  );
}
