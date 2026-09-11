/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiLoadingLogo,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import styled from '@emotion/styled';
import React from 'react';
import { truncate, unit } from '@kbn/apm-common';
import { ApmDocumentType } from '@kbn/apm-types';
import { getServiceNodeName, SERVICE_NODE_NAME_MISSING } from '../../../../../common/service_nodes';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import { useBreadcrumb } from '../../../../context/breadcrumbs/use_breadcrumb';
import { ChartPointerEventContextProvider } from '../../../../context/chart_pointer_event/chart_pointer_event_context';
import { useApmParams } from '../../../../hooks/use_apm_params';
import { useApmRouter } from '../../../../hooks/use_apm_router';
import { FETCH_STATUS, useFetcher } from '../../../../hooks/use_fetcher';
import { usePreferredDataSourceAndBucketSize } from '../../../../hooks/use_preferred_data_source_and_bucket_size';
import { useServiceMetricChartsFetcher } from '../../../../hooks/use_service_metric_charts_fetcher';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { MetricsChart } from '../../../shared/charts/metrics_chart';

const INITIAL_DATA = {
  host: '',
  containerId: '',
};

const Truncate = styled.span`
  display: block;
  ${truncate(unit * 12)}
`;

interface Props {
  serviceNodeName: string;
}

export function ServiceNodeMetrics({ serviceNodeName }: Props) {
  const { agentName, serviceName } = useApmServiceContext();

  const apmRouter = useApmRouter();

  const { query } = useApmParams('/services/{serviceName}/metrics/{id}');

  const { environment, kuery, rangeFrom, rangeTo } = query;

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  useBreadcrumb(
    () => ({
      title: getServiceNodeName(serviceNodeName),
      href: apmRouter.link('/services/{serviceName}/metrics/{id}', {
        path: {
          serviceName,
          id: serviceNodeName,
        },
        query,
      }),
    }),
    [apmRouter, query, serviceName, serviceNodeName]
  );

  const { data } = useServiceMetricChartsFetcher({
    serviceNodeName,
    kuery,
    environment,
  });

  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery,
    type: ApmDocumentType.ServiceTransactionMetric,
    numBuckets: 100,
  });

  const { data: { host, containerId } = INITIAL_DATA, status } = useFetcher(
    (callApmApi) => {
      if (start && end && preferred) {
        return callApmApi(
          'GET /internal/apm/services/{serviceName}/node/{serviceNodeName}/metadata',
          {
            params: {
              path: { serviceName, serviceNodeName },
              query: {
                kuery,
                start,
                end,
                environment,
                documentType: preferred.source.documentType,
                rollupInterval: preferred.source.rollupInterval,
              },
            },
          }
        );
      }
    },
    [kuery, serviceName, serviceNodeName, start, end, environment, preferred]
  );

  const { docLinks } = useApmPluginContext().core;
  const isLoading = status === FETCH_STATUS.LOADING;
  const isAggregatedData = serviceNodeName === SERVICE_NODE_NAME_MISSING;

  return (
    <>
      {isAggregatedData ? (
        <EuiCallOut
          announceOnMount
          title={i18n.translate(
            'xpack.apm.serviceNodeMetrics.unidentifiedServiceNodesWarningTitle',
            {
              defaultMessage: 'Could not identify JVMs',
            }
          )}
          iconType="question"
          color="warning"
        >
          <FormattedMessage
            id="xpack.apm.serviceNodeMetrics.unidentifiedServiceNodesWarningText"
            defaultMessage="We could not identify which JVMs these metrics belong to. This is likely caused by running a version of APM Server that is older than 7.5. Upgrading to APM Server 7.5 or higher should resolve this issue. For more information on upgrading, see the {link}. As an alternative, you can use the Kibana Query bar to filter by hostname, container ID or other fields."
            values={{
              link: (
                <EuiLink
                  data-test-subj="apmServiceNodeMetricsDocumentationOfApmServerLink"
                  href={docLinks.links.apm.upgrading}
                >
                  {i18n.translate(
                    'xpack.apm.serviceNodeMetrics.unidentifiedServiceNodesWarningDocumentationLink',
                    { defaultMessage: 'documentation of APM Server' }
                  )}
                </EuiLink>
              ),
            }}
          />
        </EuiCallOut>
      ) : (
        <EuiPanel hasShadow={false} paddingSize={'none'}>
          <EuiSpacer size={'s'} />
          <EuiFlexGroup gutterSize="xl">
            <EuiFlexItem grow={false}>
              <EuiStat
                titleSize="s"
                description={i18n.translate('xpack.apm.serviceNodeMetrics.serviceName', {
                  defaultMessage: 'Service name',
                })}
                title={
                  <EuiToolTip content={serviceName}>
                    <Truncate>{serviceName}</Truncate>
                  </EuiToolTip>
                }
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiStat
                titleSize="s"
                isLoading={isLoading}
                description={i18n.translate('xpack.apm.serviceNodeMetrics.host', {
                  defaultMessage: 'Host',
                })}
                title={
                  <EuiToolTip content={host}>
                    <Truncate>{host}</Truncate>
                  </EuiToolTip>
                }
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiStat
                titleSize="s"
                isLoading={isLoading}
                description={i18n.translate('xpack.apm.serviceNodeMetrics.containerId', {
                  defaultMessage: 'Container ID',
                })}
                title={
                  <EuiToolTip content={containerId}>
                    <Truncate>{containerId}</Truncate>
                  </EuiToolTip>
                }
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size={'s'} />
        </EuiPanel>
      )}

      {isLoading && (
        <EuiEmptyPrompt
          icon={<EuiLoadingLogo logo="logoObservability" size="xl" />}
          title={
            <h2>
              {i18n.translate('xpack.apm.serviceMetrics.loading', {
                defaultMessage: 'Loading metrics',
              })}
            </h2>
          }
        />
      )}

      {agentName && (
        <ChartPointerEventContextProvider>
          <EuiFlexGrid columns={2} gutterSize="s">
            {data.charts.map((chart) => (
              <EuiFlexItem key={chart.key}>
                <EuiPanel hasBorder={true}>
                  <MetricsChart start={start} end={end} chart={chart} fetchStatus={status} />
                </EuiPanel>
              </EuiFlexItem>
            ))}
          </EuiFlexGrid>
          <EuiSpacer size="xxl" />
        </ChartPointerEventContextProvider>
      )}
    </>
  );
}
