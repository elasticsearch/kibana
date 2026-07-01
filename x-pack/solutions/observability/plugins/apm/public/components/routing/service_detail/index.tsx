/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import { toBooleanRt, toNumberRt } from '@kbn/io-ts-utils';
import { ALERT_STATUS_ACTIVE, ALERT_STATUS_RECOVERED } from '@kbn/rule-data-utils';
import { Outlet } from '@kbn/typed-react-router-config';
import * as t from 'io-ts';
import qs from 'query-string';
import React from 'react';
import { Redirect } from 'react-router-dom';
import { dynamic } from '@kbn/shared-ux-utility';
import { offsetRt } from '../../../../common/comparison_rt';
import { ENVIRONMENT_ALL } from '../../../../common/environment_filter_values';
import { environmentRt } from '../../../../common/environment_rt';
import {
  LatencyAggregationType,
  latencyAggregationTypeRt,
} from '../../../../common/latency_aggregation_types';
import {
  DEFAULT_ANOMALY_THRESHOLD,
  anomalyThresholdRt,
} from '../../../../common/anomaly_detection/anomaly_threshold';
import { ApmTimeRangeMetadataContextProvider } from '../../../context/time_range_metadata/time_range_metadata_context';
import { useApmParams } from '../../../hooks/use_apm_params';
import {
  ALERT_STATUS_ALL,
  AlertsOverview,
  AlertsSearchBarContextProvider,
  AlertsHeaderSearchBar,
} from '../../app/alerts_overview';
import { InfraTab } from '../../app/infra_overview/infra_tabs/use_tabs';
import { ApmServiceTemplate } from '../templates/apm_service_template';
import { ApmServiceWrapper } from './apm_service_wrapper';
import { RedirectToDefaultServiceRouteView } from './redirect_to_default_service_route_view';
import type { SearchBar } from '../../shared/search_bar/search_bar';
import { ServiceDependencies } from '../../app/service_dependencies';
import { ServiceDashboards } from '../../app/service_dashboards';
import { ErrorGroupDetails } from '../../app/error_group_details';
import { ServiceMapSearchBar } from '../../app/service_map/service_map_search_bar';
import { ServiceMapSearchProvider } from '../../app/service_map/service_map_search_context';

const ErrorGroupOverview = dynamic(() =>
  import('../../app/error_group_overview').then((mod) => ({ default: mod.ErrorGroupOverview }))
);
const InfraOverview = dynamic(() =>
  import('../../app/infra_overview').then((mod) => ({ default: mod.InfraOverview }))
);
const Metrics = dynamic(() =>
  import('../../app/metrics').then((mod) => ({ default: mod.Metrics }))
);
const MetricsDetails = dynamic(() =>
  import('../../app/metrics_details').then((mod) => ({ default: mod.MetricsDetails }))
);

const ServiceLogs = dynamic(() =>
  import('../../app/service_logs').then((mod) => ({ default: mod.ServiceLogs }))
);
const ServiceMapServiceDetail = dynamic(() =>
  import('../../app/service_map').then((mod) => ({ default: mod.ServiceMapServiceDetail }))
);
const ServiceOverview = dynamic(() =>
  import('../../app/service_overview').then((mod) => ({ default: mod.ServiceOverview }))
);
const TransactionDetails = dynamic(() =>
  import('../../app/transaction_details').then((mod) => ({ default: mod.TransactionDetails }))
);
const TransactionOverview = dynamic(() =>
  import('../../app/transaction_overview').then((mod) => ({ default: mod.TransactionOverview }))
);
const ProfilingOverview = dynamic(() =>
  import('../../app/profiling_overview').then((mod) => ({ default: mod.ProfilingOverview }))
);
const ProfilingHeaderSearchBar = dynamic(() =>
  import('../../app/profiling_overview').then((mod) => ({
    default: mod.ProfilingHeaderSearchBar,
  }))
);

function page({
  title,
  tab,
  element,
  searchBarOptions,
  customSearchBar,
  bottomHeaderContent,
  contentWrapper,
  contextWrapper: ContextWrapper,
}: {
  title: string;
  tab: React.ComponentProps<typeof ApmServiceTemplate>['selectedTab'];
  element: React.ReactElement<any, any>;
  searchBarOptions?: React.ComponentProps<typeof SearchBar>;
  customSearchBar?: React.ReactNode;
  bottomHeaderContent?: React.ComponentType;
  contentWrapper?: React.ComponentType<{ children: React.ReactNode }>;
  contextWrapper?: React.ComponentType<{ children: React.ReactNode }>;
}): {
  element: React.ReactElement<any, any>;
} {
  const template = (
    <ApmServiceTemplate
      title={title}
      selectedTab={tab}
      searchBarOptions={searchBarOptions}
      customSearchBar={customSearchBar}
      bottomHeaderContent={bottomHeaderContent}
      contentWrapper={contentWrapper}
    >
      {element}
    </ApmServiceTemplate>
  );
  return {
    element: ContextWrapper ? <ContextWrapper>{template}</ContextWrapper> : template,
  };
}

function RedirectNodesToMetrics() {
  const { query, path } = useApmParams('/services/{serviceName}/nodes');
  const search = qs.stringify(query);
  return <Redirect to={{ pathname: `/services/${path.serviceName}/metrics`, search }} />;
}

function RedirectNodeMetricsToMetricsDetails() {
  const { query, path } = useApmParams('/services/{serviceName}/nodes/{serviceNodeName}/metrics');
  const search = qs.stringify(query);
  return (
    <Redirect
      to={{
        pathname: `/services/${path.serviceName}/metrics/${path.serviceNodeName}`,
        search,
      }}
    />
  );
}

export const serviceDetailRoute = {
  '/services/{serviceName}': {
    element: (
      <ApmTimeRangeMetadataContextProvider>
        <ApmServiceWrapper />
      </ApmTimeRangeMetadataContextProvider>
    ),
    params: t.intersection([
      t.type({
        path: t.type({
          serviceName: t.string,
        }),
      }),
      t.type({
        query: t.intersection([
          environmentRt,
          t.type({
            rangeFrom: t.string,
            rangeTo: t.string,
            kuery: t.string,
            serviceGroup: t.string,
            comparisonEnabled: toBooleanRt,
          }),
          t.partial({
            latencyAggregationType: latencyAggregationTypeRt,
            anomalyThreshold: anomalyThresholdRt,
            transactionType: t.string,
            refreshPaused: t.union([t.literal('true'), t.literal('false')]),
            refreshInterval: t.string,
          }),
          offsetRt,
        ]),
      }),
    ]),
    defaults: {
      query: {
        kuery: '',
        environment: ENVIRONMENT_ALL.value,
        serviceGroup: '',
        latencyAggregationType: LatencyAggregationType.avg,
        anomalyThreshold: DEFAULT_ANOMALY_THRESHOLD,
      },
    },
    children: {
      '/services/{serviceName}/overview': {
        ...page({
          element: <ServiceOverview />,
          tab: 'overview',
          title: i18n.translate('xpack.apm.views.overview.title', {
            defaultMessage: 'Overview',
          }),
          searchBarOptions: {
            showTimeComparison: true,
            showTransactionTypeSelector: true,
          },
        }),
        params: t.partial({
          query: t.partial({
            page: toNumberRt,
            pageSize: toNumberRt,
            sortField: t.string,
            sortDirection: t.union([t.literal('asc'), t.literal('desc')]),
          }),
        }),
      },
      '/services/{serviceName}/transactions': {
        ...page({
          tab: 'transactions',
          title: i18n.translate('xpack.apm.views.transactions.title', {
            defaultMessage: 'Transactions',
          }),
          element: <Outlet />,
          searchBarOptions: {
            showTransactionTypeSelector: true,
            showTimeComparison: true,
          },
        }),
        params: t.partial({
          query: t.partial({
            page: toNumberRt,
            pageSize: toNumberRt,
            sortField: t.string,
            sortDirection: t.union([t.literal('asc'), t.literal('desc')]),
          }),
        }),
        children: {
          '/services/{serviceName}/transactions/view': {
            element: <TransactionDetails />,
            params: t.type({
              query: t.intersection([
                t.intersection([
                  t.type({
                    comparisonEnabled: toBooleanRt,
                    showCriticalPath: toBooleanRt,
                  }),
                  t.partial({ transactionName: t.string }),
                ]),
                t.partial({
                  traceId: t.string,
                  transactionId: t.string,
                  flyoutDetailTab: t.string,
                  sampleRangeTo: toNumberRt,
                  sampleRangeFrom: toNumberRt,
                  page: toNumberRt,
                  pageSize: toNumberRt,
                  sortField: t.string,
                  sortDirection: t.union([t.literal('asc'), t.literal('desc')]),
                }),
                offsetRt,
              ]),
            }),
            defaults: {
              query: {
                showCriticalPath: '',
              },
            },
          },
          '/services/{serviceName}/transactions': {
            element: <TransactionOverview />,
          },
        },
      },
      '/services/{serviceName}/dependencies': page({
        element: <ServiceDependencies />,
        tab: 'dependencies',
        title: i18n.translate('xpack.apm.views.dependencies.title', {
          defaultMessage: 'Dependencies',
        }),
        searchBarOptions: {
          showTimeComparison: true,
        },
      }),
      '/services/{serviceName}/errors': {
        ...page({
          tab: 'errors',
          title: i18n.translate('xpack.apm.views.errors.title', {
            defaultMessage: 'Errors',
          }),
          element: <Outlet />,
          searchBarOptions: {
            showTimeComparison: true,
          },
        }),
        params: t.partial({
          query: t.partial({
            page: toNumberRt,
            pageSize: toNumberRt,
            sortField: t.string,
            sortDirection: t.union([t.literal('asc'), t.literal('desc')]),
          }),
        }),
        children: {
          '/services/{serviceName}/errors/{groupId}': {
            element: <ErrorGroupDetails />,
            params: t.type({
              path: t.type({
                groupId: t.string,
              }),
              query: t.partial({ errorId: t.string }),
            }),
          },
          '/services/{serviceName}/errors': {
            element: <ErrorGroupOverview />,
          },
        },
      },
      '/services/{serviceName}/metrics': {
        ...page({
          tab: 'metrics',
          title: i18n.translate('xpack.apm.views.metrics.title', {
            defaultMessage: 'Metrics',
          }),
          element: <Outlet />,
        }),
        children: {
          '/services/{serviceName}/metrics': {
            element: <Metrics />,
          },
          '/services/{serviceName}/metrics/{id}': {
            element: <MetricsDetails />,
            params: t.type({
              path: t.type({
                id: t.string,
              }),
            }),
          },
        },
      },
      // Deprecated: redirect it to metrics
      '/services/{serviceName}/nodes': {
        ...page({
          tab: 'nodes',
          title: i18n.translate('xpack.apm.views.nodes.title', {
            defaultMessage: 'Metrics',
          }),
          element: <Outlet />,
        }),
        children: {
          '/services/{serviceName}/nodes/{serviceNodeName}/metrics': {
            element: <RedirectNodeMetricsToMetricsDetails />,
            params: t.type({
              path: t.type({
                serviceNodeName: t.string,
              }),
            }),
          },
          '/services/{serviceName}/nodes': {
            element: <RedirectNodesToMetrics />,
            params: t.partial({
              query: t.partial({
                sortDirection: t.string,
                sortField: t.string,
                pageSize: t.string,
                page: t.string,
              }),
            }),
          },
        },
      },
      '/services/{serviceName}/service-map': page({
        tab: 'service-map',
        title: i18n.translate('xpack.apm.views.serviceMap.title', {
          defaultMessage: 'Service map',
        }),
        element: <ServiceMapServiceDetail />,
        customSearchBar: <ServiceMapSearchBar />,
        contextWrapper: ServiceMapSearchProvider,
        searchBarOptions: {
          showTimeComparison: true,
          showFilterBar: true,
        },
      }),
      '/services/{serviceName}/logs': page({
        tab: 'logs',
        title: i18n.translate('xpack.apm.views.logs.title', {
          defaultMessage: 'Logs',
        }),
        element: <ServiceLogs />,
        searchBarOptions: {
          showQueryInput: true,
          searchBarPlaceholder: i18n.translate('xpack.apm.views.logs.searchBarPlaceholder', {
            defaultMessage: 'Search for log entries',
          }),
        },
      }),
      '/services/{serviceName}/infrastructure': {
        ...page({
          tab: 'infrastructure',
          title: i18n.translate('xpack.apm.views.infra.title', {
            defaultMessage: 'Infrastructure',
          }),
          element: <InfraOverview />,
        }),
        params: t.partial({
          query: t.partial({
            detailTab: t.union([
              t.literal(InfraTab.containers),
              t.literal(InfraTab.pods),
              t.literal(InfraTab.hosts),
            ]),
          }),
        }),
      },
      '/services/{serviceName}/alerts': {
        ...page({
          tab: 'alerts',
          title: i18n.translate('xpack.apm.views.alerts.title', {
            defaultMessage: 'Alerts',
          }),
          element: <AlertsOverview />,
          searchBarOptions: {
            showUnifiedSearchBar: false,
          },
          bottomHeaderContent: AlertsHeaderSearchBar,
          contentWrapper: AlertsSearchBarContextProvider,
        }),
        params: t.partial({
          query: t.partial({
            alertStatus: t.union([
              t.literal(ALERT_STATUS_ACTIVE),
              t.literal(ALERT_STATUS_RECOVERED),
              t.literal(ALERT_STATUS_ALL),
            ]),
          }),
        }),
      },
      '/services/{serviceName}/profiling': {
        ...page({
          tab: 'profiling',
          title: i18n.translate('xpack.apm.views.profiling.title', {
            defaultMessage: 'Universal Profiling',
          }),
          element: <ProfilingOverview />,
          searchBarOptions: {
            hidden: true,
          },
          bottomHeaderContent: ProfilingHeaderSearchBar,
        }),
      },
      '/services/{serviceName}/dashboards': {
        ...page({
          tab: 'dashboards',
          title: i18n.translate('xpack.apm.views.dashboard.title', {
            defaultMessage: 'Dashboards',
          }),
          element: <ServiceDashboards />,
        }),
        params: t.partial({
          query: t.partial({
            dashboardId: t.string,
          }),
        }),
      },
      '/services/{serviceName}/': {
        element: <RedirectToDefaultServiceRouteView />,
      },
    },
  },
};
