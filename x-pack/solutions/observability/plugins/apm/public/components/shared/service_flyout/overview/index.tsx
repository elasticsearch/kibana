/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiSkeletonText,
  EuiSkeletonTitle,
  EuiSpacer,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { ServiceFlyoutTransactionsSection } from '@kbn/apm-ui-shared';
import { i18n } from '@kbn/i18n';
import React, { useMemo, useState } from 'react';
import type { LensESQLConfig } from './types';
import { LatencyAggregationType } from '../../../../../common/latency_aggregation_types';
import type { Environment } from '../../../../../common/environment_rt';
import { isOpenTelemetryAgentName } from '../../../../../common/agent_name';
import type { AgentName } from '../../../../../typings/es_schemas/ui/fields/agent';
import type { ServiceNodeData } from '../../../../../common/service_map';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useAdHocApmDataView } from '../../../../hooks/use_adhoc_apm_data_view';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { LatencyAggregationTypeSelect } from '../../charts/latency_chart/latency_aggregation_type_select';
import { useServiceHasSystemMetrics } from '../hooks/use_service_has_system_metrics';
import { ServiceFlyoutApmCharts } from './apm_charts';
import { getChartDefinitions } from './chart_configs';
import { ServiceFlyoutLensChart } from './lens_chart';
import { ServiceFlyoutQueryControls } from './query_controls';

const KEY_METRICS_SECTION_TITLE = i18n.translate('xpack.apm.serviceFlyout.keyMetricsSectionTitle', {
  defaultMessage: 'Key metrics',
});

const INFRASTRUCTURE_METRICS_SECTION_TITLE = i18n.translate(
  'xpack.apm.serviceFlyout.infrastructureMetricsSectionTitle',
  { defaultMessage: 'Infrastructure metrics' }
);

const INFRASTRUCTURE_METRICS_SECTION_DESCRIPTION = i18n.translate(
  'xpack.apm.serviceFlyout.infrastructureMetricsSectionTooltip',
  {
    defaultMessage:
      'Infrastructure metrics reflect system-level data and are not filtered by transaction type.',
  }
);

interface ServiceFlyoutOverviewProps {
  service: ServiceNodeData;
  environment: Environment;
  kuery: string;
  rangeFrom: string;
  rangeTo: string;
  transactionType: string;
  refreshToken: number;
  latencyAggregationType?: LatencyAggregationType;
  preferDocumentBasedCharts?: boolean;
  onEnvironmentChange: (environment: Environment) => void;
  onRangeChange: (range: { rangeFrom: string; rangeTo: string }) => void;
  onRefresh: () => void;
  onTransactionTypeChange: (transactionType: string) => void;
}

interface FlyoutLensChartDefinition {
  id: string;
  title: string;
  titleAction?: React.ReactNode;
  config?: LensESQLConfig;
}

function ServiceFlyoutSectionTitle({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description?: string;
}) {
  return (
    <>
      <EuiFlexGroup
        alignItems="center"
        gutterSize="xs"
        responsive={false}
        data-test-subj={`serviceFlyoutSection-${id}`}
      >
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{title}</h3>
          </EuiTitle>
        </EuiFlexItem>
        {description && (
          <EuiFlexItem grow={false}>
            <EuiIconTip content={description} size="s" color="subdued" aria-label={description} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="s" />
    </>
  );
}

function ServiceFlyoutChartsSection({
  id,
  title,
  description,
  charts,
  rangeFrom,
  rangeTo,
  refreshToken,
}: {
  id: string;
  title: string;
  description?: string;
  charts: FlyoutLensChartDefinition[];
  rangeFrom: string;
  rangeTo: string;
  refreshToken: number;
}) {
  const { euiTheme } = useEuiTheme();

  return (
    <>
      <EuiFlexGroup
        alignItems="center"
        gutterSize="xs"
        responsive={false}
        data-test-subj={`serviceFlyoutSection-${id}`}
      >
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{title}</h3>
          </EuiTitle>
        </EuiFlexItem>
        {description ? (
          <EuiFlexItem grow={false}>
            <EuiIconTip content={description} size="s" color="subdued" aria-label={description} />
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <div
        css={css`
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: ${euiTheme.size.m};
        `}
      >
        {charts.map((chart) => (
          <ServiceFlyoutLensChart
            key={chart.id}
            id={chart.id}
            title={chart.title}
            titleAction={chart.titleAction}
            config={chart.config}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            refreshToken={refreshToken}
          />
        ))}
      </div>
    </>
  );
}

export function ServiceFlyoutOverview({
  service,
  environment,
  kuery,
  rangeFrom,
  rangeTo,
  transactionType,
  refreshToken,
  latencyAggregationType: initialLatencyAggregationType,
  preferDocumentBasedCharts,
  onEnvironmentChange,
  onRangeChange,
  onRefresh,
  onTransactionTypeChange,
}: ServiceFlyoutOverviewProps) {
  const [latencyAggregationType, setLatencyAggregationType] = useState(
    initialLatencyAggregationType ?? LatencyAggregationType.avg
  );
  const { core, share } = useApmPluginContext();
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });
  const { dataView } = useAdHocApmDataView();
  const indexes = dataView?.getIndexPattern();
  const { hasSystemMetrics, isLoading: isSystemMetricsLoading } = useServiceHasSystemMetrics({
    serviceName: service.id,
    environment,
    rangeFrom,
    rangeTo,
  });

  // ES|QL charts over raw documents for: unprocessed OTel services (invisible to
  // the APM chart APIs) and document-based hosts like Discover (whose surrounding
  // RED charts read the raw documents). Every other case renders the same APM
  // chart components as the alert details page.
  const useEsqlKeyMetrics =
    Boolean(preferDocumentBasedCharts) || isOpenTelemetryAgentName(service.agentName as AgentName);

  const { keyMetrics, infrastructureMetrics } = useMemo(
    () =>
      getChartDefinitions({
        indexes,
        serviceName: service.id,
        environment,
        kuery,
        transactionType,
        latencyAggregationType,
        latencyTitleAction: (
          <LatencyAggregationTypeSelect
            latencyAggregationType={latencyAggregationType}
            onChange={setLatencyAggregationType}
          />
        ),
      }),
    [environment, indexes, kuery, latencyAggregationType, service.id, transactionType]
  );

  return (
    <div data-test-subj="serviceFlyoutOverview">
      <ServiceFlyoutQueryControls
        agentName={service.agentName}
        environment={environment}
        kuery={kuery}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
        serviceName={service.id}
        transactionType={transactionType}
        onEnvironmentChange={onEnvironmentChange}
        onRangeChange={onRangeChange}
        onRefresh={onRefresh}
        onTransactionTypeChange={onTransactionTypeChange}
      />
      <EuiSpacer size="m" />
      <EuiFlexGroup direction="column" responsive={false} gutterSize="m">
        <EuiFlexItem>
          {useEsqlKeyMetrics ? (
            <ServiceFlyoutChartsSection
              id="keyMetrics"
              title={KEY_METRICS_SECTION_TITLE}
              charts={keyMetrics}
              rangeFrom={rangeFrom}
              rangeTo={rangeTo}
              refreshToken={refreshToken}
            />
          ) : (
            <>
              <ServiceFlyoutSectionTitle id="keyMetrics" title={KEY_METRICS_SECTION_TITLE} />
              <ServiceFlyoutApmCharts
                key={refreshToken}
                latencyAggregationType={latencyAggregationType}
                setLatencyAggregationType={setLatencyAggregationType}
                serviceName={service.id}
                environment={environment}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                transactionType={transactionType}
                onRangeChange={onRangeChange}
              />
            </>
          )}
        </EuiFlexItem>
        {isSystemMetricsLoading ? (
          <EuiFlexItem data-test-subj="serviceFlyoutSection-infrastructureMetricsSkeleton">
            <EuiSkeletonTitle size="xs" />
            <EuiSpacer size="s" />
            <EuiSkeletonText lines={2} />
          </EuiFlexItem>
        ) : hasSystemMetrics ? (
          <EuiFlexItem>
            <ServiceFlyoutChartsSection
              id="infrastructureMetrics"
              title={INFRASTRUCTURE_METRICS_SECTION_TITLE}
              description={INFRASTRUCTURE_METRICS_SECTION_DESCRIPTION}
              charts={infrastructureMetrics}
              rangeFrom={rangeFrom}
              rangeTo={rangeTo}
              refreshToken={refreshToken}
            />
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem>
          <ServiceFlyoutTransactionsSection
            http={core.http}
            notifications={core.notifications}
            locators={share.url.locators}
            serviceName={service.id}
            environment={environment}
            start={start}
            end={end}
            transactionType={transactionType}
            latencyAggregationType={latencyAggregationType}
            refreshToken={refreshToken}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
}
