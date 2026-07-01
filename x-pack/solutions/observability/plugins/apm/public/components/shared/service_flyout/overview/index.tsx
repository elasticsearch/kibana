/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiAccordion,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIconTip,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import type { LensConfig } from '@kbn/lens-embeddable-utils';
import { i18n } from '@kbn/i18n';
import React, { useMemo, useState } from 'react';
import { LatencyAggregationType } from '../../../../../common/latency_aggregation_types';
import type { Environment } from '../../../../../common/environment_rt';
import type { ServiceNodeData } from '../../../../../common/service_map';
import { useAdHocApmDataView } from '../../../../hooks/use_adhoc_apm_data_view';
import { LatencyAggregationTypeSelect } from '../../charts/latency_chart/latency_aggregation_type_select';
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
  onEnvironmentChange: (environment: Environment) => void;
  onRangeChange: (range: { rangeFrom: string; rangeTo: string }) => void;
  onRefresh: () => void;
  onTransactionTypeChange: (transactionType: string) => void;
}

interface FlyoutLensChartDefinition {
  id: string;
  title: string;
  titleAction?: React.ReactNode;
  config?: LensConfig;
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
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <EuiAccordion
        id={`sectionAccordion-${id}`}
        initialIsOpen
        onToggle={setIsOpen}
        buttonContent={
          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h3>{title}</h3>
              </EuiTitle>
            </EuiFlexItem>
            {description ? (
              <EuiFlexItem grow={false}>
                <EuiIconTip
                  content={description}
                  size="s"
                  color="subdued"
                  aria-label={description}
                />
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        }
        data-test-subj={`serviceFlyoutSection-${id}`}
      >
        <EuiSpacer size="s" />
        <EuiFlexGrid columns={2} responsive={false} gutterSize="m">
          {charts.map((chart) => (
            <EuiFlexItem key={chart.id}>
              <ServiceFlyoutLensChart
                id={chart.id}
                title={chart.title}
                titleAction={chart.titleAction}
                config={chart.config}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                refreshToken={refreshToken}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGrid>
      </EuiAccordion>
      {isOpen ? null : <EuiHorizontalRule margin="xs" />}
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
  onEnvironmentChange,
  onRangeChange,
  onRefresh,
  onTransactionTypeChange,
}: ServiceFlyoutOverviewProps) {
  const [latencyAggregationType, setLatencyAggregationType] = useState(LatencyAggregationType.avg);
  const { dataView } = useAdHocApmDataView();
  const indexes = dataView?.getIndexPattern();

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
      <EuiFlexGroup direction="column" responsive={false} gutterSize="l">
        <EuiFlexItem>
          <ServiceFlyoutChartsSection
            id="keyMetrics"
            title={KEY_METRICS_SECTION_TITLE}
            charts={keyMetrics}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            refreshToken={refreshToken}
          />
        </EuiFlexItem>
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
      </EuiFlexGroup>
    </div>
  );
}
