/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiIconTip, EuiText, EuiToolTip } from '@elastic/eui';
import { DISCOVER_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { apmEnableServiceInventoryTableSearchBar } from '@kbn/observability-plugin/common';
import { ALERT_STATUS_ACTIVE } from '@kbn/rule-data-utils';
import type { ApmRuleType } from '@kbn/rule-data-utils';
import type { TypeOf } from '@kbn/typed-react-router-config';
import { omit } from 'lodash';
import React, { useCallback, useMemo, useState } from 'react';
import type { AgentName } from '@kbn/elastic-agent-utils';
import { EmptyCellValue } from '@kbn/shared-ux-column-presets';
import { AlertingFlyout } from '../../../alerting/ui_components/alerting_flyout';
import type { ApmPluginStartDeps } from '../../../../plugin';
import type { ServiceListItem } from '../../../../../common/service_inventory';
import { ServiceInventoryFieldName } from '../../../../../common/service_inventory';
import { isDefaultTransactionType } from '../../../../../common/transaction_types';
import {
  asMillisecondDuration,
  asPercent,
  asTransactionRate,
} from '../../../../../common/utils/formatters';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useApmParams } from '../../../../hooks/use_apm_params';
import { useApmRouter } from '../../../../hooks/use_apm_router';
import type { Breakpoints } from '../../../../hooks/use_breakpoints';
import { useBreakpoints } from '../../../../hooks/use_breakpoints';
import { useFallbackToTransactionsFetcher } from '../../../../hooks/use_fallback_to_transactions_fetcher';
import type { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { isFailure, isPending } from '../../../../hooks/use_fetcher';
import type { APIReturnType } from '../../../../services/rest/create_call_apm_api';
import type { ApmRoutes } from '../../../routing/apm_route_config';
import { AggregatedTransactionsBadge } from '../../../shared/aggregated_transactions_badge';
import { ChartType, getTimeSeriesColor } from '../../../shared/charts/helper/get_timeseries_color';
import { EnvironmentBadge } from '../../../shared/environment_badge';
import { ServiceLink } from '../../../shared/links/apm/service_link';
import { OTHER_SERVICE_NAME } from '../../../shared/links/apm/max_groups_message';
import { ListMetric } from '../../../shared/list_metric';
import type {
  ITableColumn,
  SortFunction,
  TableSearchBar,
  VisibleItemsStartEnd,
} from '../../../shared/managed_table';
import { ManagedTable } from '../../../shared/managed_table';
import { AnomaliesBadge } from './anomalies_badge';
import { SloStatusBadge } from '../../../shared/slo_status_badge';
import { getESQLQuery, type IndexType } from '../../../shared/links/discover_links/get_esql_query';
import { useServiceActions } from './service_actions';
import {
  APM_SLO_INDICATOR_TYPES,
  type ApmIndicatorType,
} from '../../../../../common/slo_indicator_types';
import { SloOverviewFlyout, useSloOverviewFlyout } from '../../../shared/slo_overview_flyout';
import { ENVIRONMENT_ALL } from '../../../../../common/environment_filter_values';
import { useApmIndexSettingsContext } from '../../../../context/apm_index_settings/use_apm_index_settings_context';
import { listMetricColumnPreset } from '../../../../utils/column_presets';

type ServicesDetailedStatisticsAPIResponse =
  APIReturnType<'POST /internal/apm/services/detailed_statistics'>;

export function getServiceColumns({
  query,
  showTransactionTypeColumn,
  comparisonDataLoading,
  comparisonData,
  breakpoints,
  showAnomaliesColumn,
  showAlertsColumn,
  showSlosColumn,
  link,
  serviceOverflowCount,
  onSloBadgeClick,
}: {
  query: TypeOf<ApmRoutes, '/services'>['query'];
  showTransactionTypeColumn: boolean;
  showAnomaliesColumn: boolean;
  showAlertsColumn: boolean;
  showSlosColumn: boolean;
  comparisonDataLoading: boolean;
  breakpoints: Breakpoints;
  comparisonData?: ServicesDetailedStatisticsAPIResponse;
  link: any;
  serviceOverflowCount: number;
  onSloBadgeClick: (serviceName: string, agentName?: AgentName) => void;
}): Array<ITableColumn<ServiceListItem>> {
  const { isSmall, isLarge, isXl } = breakpoints;
  const showWhenSmallOrGreaterThanLarge = isSmall || !isLarge;
  const showWhenSmallOrGreaterThanXL = isSmall || !isXl;

  return [
    ...(showAlertsColumn
      ? [
          {
            field: ServiceInventoryFieldName.AlertsCount,
            name: i18n.translate('xpack.apm.servicesTable.alertsColumnLabel', {
              defaultMessage: 'Alerts',
            }),
            nameTooltip: {
              content: i18n.translate('xpack.apm.servicesTable.tooltip.alertsCount', {
                defaultMessage: 'The count of the active alerts',
              }),
              icon: 'question',
              iconProps: {
                color: 'subdued',
              },
            },
            width: '6.5em',
            minWidth: '6.5em',
            className: 'eui-textNoWrap',
            sortable: true,
            render: (_, { serviceName, alertsCount }) => {
              if (!alertsCount) {
                return <EmptyCellValue />;
              }

              return (
                <EuiToolTip
                  position="bottom"
                  content={i18n.translate(
                    'xpack.apm.home.servicesTable.tooltip.activeAlertsExplanation',
                    {
                      defaultMessage: 'Active alerts',
                    }
                  )}
                >
                  <EuiBadge
                    data-test-subj="serviceInventoryAlertsBadgeLink"
                    iconType="warning"
                    color="danger"
                    href={link('/services/{serviceName}/alerts', {
                      path: { serviceName },
                      query: {
                        ...query,
                        alertStatus: ALERT_STATUS_ACTIVE,
                      },
                    })}
                  >
                    {alertsCount}
                  </EuiBadge>
                </EuiToolTip>
              );
            },
          } as ITableColumn<ServiceListItem>,
        ]
      : []),
    ...(showSlosColumn
      ? [
          {
            field: ServiceInventoryFieldName.SloStatus,
            name: i18n.translate('xpack.apm.servicesTable.slosColumnLabel', {
              defaultMessage: 'SLOs',
            }),
            nameTooltip: {
              content: i18n.translate('xpack.apm.servicesTable.tooltip.slosStatus', {
                defaultMessage: 'The status of APM SLOs for this service',
              }),
              icon: 'question',
              iconProps: {
                color: 'subdued',
              },
            },
            width: '8.5em',
            minWidth: '8.5em',
            className: 'eui-textNoWrap',
            sortable: true,
            render: (_, { serviceName, agentName, sloStatus, sloCount }) => {
              return (
                <SloStatusBadge
                  sloStatus={sloStatus ?? 'noSLOs'}
                  sloCount={sloCount}
                  serviceName={serviceName}
                  onClick={() => onSloBadgeClick(serviceName, agentName)}
                />
              );
            },
          } as ITableColumn<ServiceListItem>,
        ]
      : []),
    ...(showAnomaliesColumn
      ? [
          {
            field: ServiceInventoryFieldName.AnomalyScore,
            name: i18n.translate('xpack.apm.servicesTable.anomaliesColumnLabel', {
              defaultMessage: 'Anomalies',
            }),
            nameTooltip: {
              content: i18n.translate('xpack.apm.servicesTable.anomaliesColumnLabel.tooltip', {
                defaultMessage:
                  'The anomaly score (max.) is the maximum ML anomaly score detected for the service in the selected time range.',
              }),
              icon: 'question',
              iconProps: {
                color: 'subdued',
              },
            },
            width: '6.5em',
            minWidth: '6.5em',
            sortable: true,
            render: (_, { serviceName, transactionType, anomalyScore, detectorType }) => {
              return (
                <AnomaliesBadge
                  score={anomalyScore}
                  detectorType={detectorType}
                  href={link('/services/{serviceName}/overview', {
                    path: { serviceName },
                    query: { ...query, transactionType },
                  })}
                />
              );
            },
          } as ITableColumn<ServiceListItem>,
        ]
      : []),
    {
      field: ServiceInventoryFieldName.ServiceName,
      name: i18n.translate('xpack.apm.servicesTable.nameColumnLabel', {
        defaultMessage: 'Name',
      }),
      sortable: true,
      minWidth: '14em',
      maxWidth: '18em',
      render: (_, { serviceName, agentName, transactionType }) => (
        <ServiceLink
          agentName={agentName}
          query={{ ...query, transactionType }}
          serviceName={serviceName}
          serviceOverflowCount={serviceOverflowCount}
        />
      ),
    },
    ...(showWhenSmallOrGreaterThanLarge
      ? [
          {
            field: ServiceInventoryFieldName.Environments,
            name: i18n.translate('xpack.apm.servicesTable.environmentColumnLabel', {
              defaultMessage: 'Environment',
            }),
            width: '10em',
            minWidth: '8em',
            maxWidth: '14em',
            sortable: true,
            truncateText: true,
            textOnly: true,
            render: (_, { environments }) => <EnvironmentBadge environments={environments ?? []} />,
          } as ITableColumn<ServiceListItem>,
        ]
      : []),
    ...(showTransactionTypeColumn && showWhenSmallOrGreaterThanXL
      ? [
          {
            field: ServiceInventoryFieldName.TransactionType,
            name: i18n.translate('xpack.apm.servicesTable.transactionColumnLabel', {
              defaultMessage: 'Transaction type',
            }),
            width: `9.5em`,
            sortable: true,
          },
        ]
      : []),
    {
      ...listMetricColumnPreset(),
      field: ServiceInventoryFieldName.Latency,
      name: i18n.translate('xpack.apm.servicesTable.latencyAvgColumnLabel', {
        defaultMessage: 'Latency (avg.)',
      }),
      sortable: true,
      render: (_, { serviceName, latency }) => {
        const { currentPeriodColor, previousPeriodColor } = getTimeSeriesColor(
          ChartType.LATENCY_AVG
        );
        return (
          <ListMetric
            isLoading={comparisonDataLoading}
            series={comparisonData?.currentPeriod[serviceName]?.latency}
            comparisonSeries={comparisonData?.previousPeriod[serviceName]?.latency}
            hideSeries={!showWhenSmallOrGreaterThanLarge}
            color={currentPeriodColor}
            valueLabel={asMillisecondDuration(latency || 0)}
            comparisonSeriesColor={previousPeriodColor}
          />
        );
      },
    },
    {
      ...listMetricColumnPreset(),
      field: ServiceInventoryFieldName.Throughput,
      name: i18n.translate('xpack.apm.servicesTable.throughputColumnLabel', {
        defaultMessage: 'Throughput',
      }),
      sortable: true,
      render: (_, { serviceName, throughput }) => {
        const { currentPeriodColor, previousPeriodColor } = getTimeSeriesColor(
          ChartType.THROUGHPUT
        );

        return (
          <ListMetric
            isLoading={comparisonDataLoading}
            series={comparisonData?.currentPeriod[serviceName]?.throughput}
            comparisonSeries={comparisonData?.previousPeriod[serviceName]?.throughput}
            hideSeries={!showWhenSmallOrGreaterThanLarge}
            color={currentPeriodColor}
            valueLabel={asTransactionRate(throughput)}
            comparisonSeriesColor={previousPeriodColor}
          />
        );
      },
    },
    {
      ...listMetricColumnPreset(),
      field: ServiceInventoryFieldName.TransactionErrorRate,
      name: i18n.translate('xpack.apm.servicesTable.transactionErrorRate', {
        defaultMessage: 'Failed transaction rate',
      }),
      sortable: true,
      render: (_, { serviceName, transactionErrorRate }) => {
        const valueLabel = asPercent(transactionErrorRate, 1);
        const { currentPeriodColor, previousPeriodColor } = getTimeSeriesColor(
          ChartType.FAILED_TRANSACTION_RATE
        );
        return (
          <ListMetric
            isLoading={comparisonDataLoading}
            series={comparisonData?.currentPeriod[serviceName]?.transactionErrorRate}
            comparisonSeries={comparisonData?.previousPeriod[serviceName]?.transactionErrorRate}
            hideSeries={!showWhenSmallOrGreaterThanLarge}
            color={currentPeriodColor}
            valueLabel={valueLabel}
            comparisonSeriesColor={previousPeriodColor}
          />
        );
      },
    },
  ];
}

interface Props {
  status: FETCH_STATUS;
  items: ServiceListItem[];
  comparisonDataLoading: boolean;
  comparisonData?: ServicesDetailedStatisticsAPIResponse;
  noItemsMessage?: React.ReactNode;
  displayAnomalies: boolean;
  displayAlerts: boolean;
  displaySlos: boolean;
  initialSortField: ServiceInventoryFieldName;
  initialPageSize: number;
  initialSortDirection: 'asc' | 'desc';
  sortFn: SortFunction<ServiceListItem>;
  serviceOverflowCount: number;
  maxCountExceeded: boolean;
  onChangeSearchQuery?: (searchQuery: string) => void;
  onChangeRenderedItems?: (renderedItems: ServiceListItem[]) => void;
  onChangeItemIndices?: (range: VisibleItemsStartEnd) => void;
}

export function ApmServicesTable({
  status,
  items,
  noItemsMessage,
  comparisonDataLoading,
  comparisonData,
  displayAnomalies,
  displayAlerts,
  displaySlos,
  initialSortField,
  initialSortDirection,
  initialPageSize,
  sortFn,
  serviceOverflowCount,
  maxCountExceeded,
  onChangeSearchQuery,
  onChangeRenderedItems,
  onChangeItemIndices,
}: Props) {
  const breakpoints = useBreakpoints();
  const { core, share } = useApmPluginContext();
  const discoverLocator = share?.url?.locators?.get(DISCOVER_APP_LOCATOR);
  const { slo } = useKibana<ApmPluginStartDeps>().services;
  const { indexSettings = [] } = useApmIndexSettingsContext();
  const { link } = useApmRouter();
  const showTransactionTypeColumn = items.some(
    ({ transactionType }) => transactionType && !isDefaultTransactionType(transactionType)
  );
  const { query } = useApmParams('/services');
  const { kuery, environment } = query;

  const { fallbackToTransactions } = useFallbackToTransactionsFetcher({
    kuery,
  });

  const [alertFlyoutState, setAlertFlyoutState] = useState<{
    isOpen: boolean;
    ruleType: ApmRuleType | null;
    serviceName: string | undefined;
  }>({
    isOpen: false,
    ruleType: null,
    serviceName: undefined,
  });

  const [sloFlyoutState, setSloFlyoutState] = useState<{
    isOpen: boolean;
    indicatorType: ApmIndicatorType | null;
    serviceName: string | undefined;
  }>({
    isOpen: false,
    indicatorType: null,
    serviceName: undefined,
  });

  const openAlertFlyout = useCallback((ruleType: ApmRuleType, serviceName: string) => {
    setAlertFlyoutState({
      isOpen: true,
      ruleType,
      serviceName,
    });
  }, []);

  const closeAlertFlyout = useCallback(() => {
    setAlertFlyoutState({
      isOpen: false,
      ruleType: null,
      serviceName: undefined,
    });
  }, []);

  const openSloFlyout = useCallback((indicatorType: ApmIndicatorType, serviceName: string) => {
    setSloFlyoutState({
      isOpen: true,
      indicatorType,
      serviceName,
    });
  }, []);

  const closeSloFlyout = useCallback(() => {
    setSloFlyoutState({
      isOpen: false,
      indicatorType: null,
      serviceName: undefined,
    });
  }, []);

  const { sloOverviewFlyout, openSloOverviewFlyout, closeSloOverviewFlyout } =
    useSloOverviewFlyout();

  const CreateSloFlyout =
    sloFlyoutState.isOpen && sloFlyoutState.indicatorType && sloFlyoutState.serviceName
      ? slo?.getCreateSLOFormFlyout({
          initialValues: {
            name: `APM SLO for ${sloFlyoutState.serviceName}`,
            indicator: {
              type: sloFlyoutState.indicatorType,
              params: {
                service: sloFlyoutState.serviceName,
                environment: environment === ENVIRONMENT_ALL.value ? '*' : environment,
              },
            },
          },
          onClose: closeSloFlyout,
          formSettings: {
            allowedIndicatorTypes: [...APM_SLO_INDICATOR_TYPES],
          },
        })
      : null;

  const serviceColumns = useMemo(() => {
    return getServiceColumns({
      // removes pagination and sort instructions from the query so it won't be passed down to next route
      query: omit(query, 'page', 'pageSize', 'sortDirection', 'sortField'),
      showTransactionTypeColumn,
      comparisonDataLoading,
      comparisonData,
      breakpoints,
      showAnomaliesColumn: displayAnomalies,
      showAlertsColumn: displayAlerts,
      showSlosColumn: displaySlos,
      link,
      serviceOverflowCount,
      onSloBadgeClick: openSloOverviewFlyout,
    });
  }, [
    query,
    showTransactionTypeColumn,
    comparisonDataLoading,
    comparisonData,
    breakpoints,
    displayAnomalies,
    displayAlerts,
    displaySlos,
    link,
    serviceOverflowCount,
    openSloOverviewFlyout,
  ]);

  const isTableSearchBarEnabled = core?.uiSettings?.get<boolean>(
    apmEnableServiceInventoryTableSearchBar,
    true
  );

  const tableSearchBar: TableSearchBar<ServiceListItem> = useMemo(() => {
    return {
      isEnabled: isTableSearchBarEnabled,
      fieldsToSearch: ['serviceName'],
      maxCountExceeded,
      onChangeSearchQuery,
      placeholder: i18n.translate('xpack.apm.servicesTable.filterServicesPlaceholder', {
        defaultMessage: 'Search services by name',
      }),
      techPreview: true,
    };
  }, [isTableSearchBarEnabled, maxCountExceeded, onChangeSearchQuery]);

  const getDiscoverHref = useCallback(
    (item: ServiceListItem, indexType: IndexType) => {
      const esqlQuery = getESQLQuery({
        indexType,
        params: {
          kuery,
          serviceName: item.serviceName,
          transactionType: indexType === 'traces' ? item.transactionType : undefined,
          environment,
          sortDirection: 'DESC',
        },
        indexSettings,
      });

      if (!esqlQuery) return undefined;

      return discoverLocator?.getRedirectUrl({
        timeRange: { from: query.rangeFrom, to: query.rangeTo },
        query: { esql: esqlQuery },
      });
    },
    [kuery, environment, indexSettings, query.rangeFrom, query.rangeTo, discoverLocator]
  );

  const serviceActions = useServiceActions({
    openAlertFlyout,
    openSloFlyout,
    getDiscoverHref,
  });

  return (
    <EuiFlexGroup gutterSize="xs" direction="column" responsive={false}>
      <EuiFlexItem>
        <EuiFlexGroup alignItems="center" gutterSize="xs" justifyContent="flexEnd">
          {fallbackToTransactions && (
            <EuiFlexItem>
              <AggregatedTransactionsBadge />
            </EuiFlexItem>
          )}
          {maxCountExceeded && (
            <EuiFlexItem grow={false}>
              <EuiIconTip
                position="top"
                type="warning"
                color="danger"
                content={i18n.translate('xpack.apm.servicesTable.tooltip.maxCountExceededWarning', {
                  defaultMessage:
                    'The limit of 1,000 services is exceeded. Please use the query bar to narrow down the results or create service groups.',
                })}
              />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiIconTip
              position="top"
              type="question"
              color="subdued"
              content={i18n.translate('xpack.apm.servicesTable.tooltip.metricsExplanation', {
                defaultMessage:
                  'Service metrics are aggregated on their transaction type, which can be request or page-load. If neither exists, metrics are aggregated on the top available transaction type.',
              })}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {i18n.translate('xpack.apm.servicesTable.metricsExplanationLabel', {
                defaultMessage: 'What are these metrics?',
              })}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem>
        <ManagedTable<ServiceListItem>
          isLoading={isPending(status)}
          error={isFailure(status)}
          columns={serviceColumns}
          items={items}
          noItemsMessage={noItemsMessage}
          initialSortField={initialSortField}
          initialSortDirection={initialSortDirection}
          initialPageSize={initialPageSize}
          sortFn={sortFn}
          onChangeRenderedItems={onChangeRenderedItems}
          onChangeItemIndices={onChangeItemIndices}
          tableSearchBar={tableSearchBar}
          actions={serviceActions}
          isActionsDisabled={(item: ServiceListItem) => item.serviceName === OTHER_SERVICE_NAME}
          tableLayout="auto"
        />
      </EuiFlexItem>
      <AlertingFlyout
        addFlyoutVisible={alertFlyoutState.isOpen}
        setAddFlyoutVisibility={(visible) => {
          if (!visible) {
            closeAlertFlyout();
          }
        }}
        ruleType={alertFlyoutState.ruleType}
        serviceName={alertFlyoutState.serviceName}
      />
      {CreateSloFlyout}
      {sloOverviewFlyout && (
        <SloOverviewFlyout
          serviceName={sloOverviewFlyout.serviceName}
          agentName={sloOverviewFlyout.agentName}
          onClose={closeSloOverviewFlyout}
        />
      )}
    </EuiFlexGroup>
  );
}
