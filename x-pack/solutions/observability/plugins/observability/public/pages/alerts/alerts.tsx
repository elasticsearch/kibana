/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { BrushEndListener, XYBrushEvent } from '@elastic/charts';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import type { FilterGroupHandler } from '@kbn/alerts-ui-shared';
import type { BoolQuery, Filter } from '@kbn/es-query';
import { usePageReady } from '@kbn/ebt-tools';
import { i18n } from '@kbn/i18n';
import { loadRuleAggregations } from '@kbn/triggers-actions-ui-plugin/public';
import { useBreadcrumbs } from '@kbn/observability-shared-plugin/public';
import { OBSERVABILITY_RULE_TYPE_IDS_WITH_SUPPORTED_STACK_RULE_TYPES } from '@kbn/observability-shared-plugin/common';
import { MaintenanceWindowCallout } from '@kbn/alerts-ui-shared/src/maintenance_window_callout';
import { useGetRuleTypesPermissions } from '@kbn/alerts-ui-shared/src/common/hooks';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core-application-common';
import { AlertsGrouping } from '@kbn/alerts-grouping';

import { rulesLocatorID, type RulesLocatorParams } from '@kbn/rule-data-utils';
import { createUseRulesLink } from '../../hooks/create_use_rules_link';
import { renderGroupPanel } from '../../components/alerts_table/grouping/render_group_panel';
import { getGroupStats } from '../../components/alerts_table/grouping/get_group_stats';
import { getAggregationsByGroupingField } from '../../components/alerts_table/grouping/get_aggregations_by_grouping_field';
import { DEFAULT_GROUPING_OPTIONS } from '../../components/alerts_table/grouping/constants';
import type {
  AlertsByGroupingAgg,
  GetObservabilityAlertsTableProp,
} from '../../components/alerts_table/types';
import { ObservabilityAlertSearchBar } from '../../components/alert_search_bar/alert_search_bar';
import { useGetFilteredRuleTypes } from '../../hooks/use_get_filtered_rule_types';
import { usePluginContext } from '../../hooks/use_plugin_context';
import { useTimeBuckets } from '../../hooks/use_time_buckets';
import { useToasts } from '../../hooks/use_toast';
import { useKibana } from '../../utils/kibana_react';
import {
  alertSearchBarStateContainer,
  Provider,
  useAlertSearchBarStateContainer,
} from '../../components/alert_search_bar/containers';
import { calculateTimeRangeBucketSize } from '../overview/helpers/calculate_bucket_size';
import { getAlertSummaryTimeRange } from '../../utils/alert_summary_widget';
import { ALERTS_URL_STORAGE_KEY, observabilityAlertFeatureIds } from '../../../common/constants';
import { ALERTS_PAGE_ALERTS_TABLE_CONFIG_ID } from '../../constants';
import { useGetAvailableRulesWithDescriptions } from '../../hooks/use_get_available_rules_with_descriptions';
import { ObservabilityAlertsTable } from '../../components/alerts_table/alerts_table';
import { getColumns } from '../../components/alerts_table/common/get_columns';
import { HeaderMenu } from '../overview/components/header_menu/header_menu';
import { buildEsQuery } from '../../utils/build_es_query';
import type { RuleStatsState } from './components/rule_stats';
import { renderRuleStats } from './components/rule_stats';
import { mergeBoolQueries } from './helpers/merge_bool_queries';
import { GroupingToolbarControls } from '../../components/alerts_table/grouping/grouping_toolbar_controls';
import { AlertsLoader } from './components/alerts_loader';

const ALERTS_SEARCH_BAR_ID = 'alerts-search-bar-o11y';
const ALERTS_PER_PAGE = 50;
const ALERTS_TABLE_ID = 'xpack.observability.alerts.alert.table';

const DEFAULT_INTERVAL = '60s';
const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD HH:mm';
const DEFAULT_EMPTY_FILTERS: Filter[] = [];

const tableColumns = getColumns({ showRuleName: true });

function InternalAlertsPage() {
  const kibanaServices = useKibana().services;
  const {
    data,
    http,
    notifications,
    fieldFormats,
    application,
    licensing,
    cases,
    settings,
    charts,
    dataViews,
    observabilityAIAssistant,
    share: {
      url: { locators },
    },
    spaces,
    triggersActionsUi: {
      getAlertsSearchBar: AlertsSearchBar,
      getAlertSummaryWidget: AlertSummaryWidget,
    },
    uiSettings,
  } = kibanaServices;
  const { toasts } = notifications;
  const {
    query: {
      timefilter: { timefilter: timeFilterService },
    },
  } = data;
  const { ObservabilityPageTemplate } = usePluginContext();
  const [filterControls, setFilterControls] = useState<Filter[]>();
  const [controlApi, setControlApi] = useState<FilterGroupHandler | undefined>();
  const alertSearchBarStateProps = useAlertSearchBarStateContainer(ALERTS_URL_STORAGE_KEY, {
    replace: false,
  });
  const hasInitialControlLoadingFinished = useMemo(
    () => controlApi && Array.isArray(filterControls),
    [controlApi, filterControls]
  );
  const filteredRuleTypes = useGetFilteredRuleTypes();
  const themeOverrides = charts.theme.useChartsBaseTheme();
  const globalFilters = useMemo(() => {
    return [
      ...(alertSearchBarStateProps.filters ?? DEFAULT_EMPTY_FILTERS),
      ...(filterControls ?? DEFAULT_EMPTY_FILTERS),
    ];
  }, [alertSearchBarStateProps.filters, filterControls]);
  const globalQuery = useMemo(() => {
    return { query: alertSearchBarStateProps.kuery, language: 'kuery' };
  }, [alertSearchBarStateProps.kuery]);

  const { setScreenContext } = observabilityAIAssistant?.service || {};

  const ruleTypesWithDescriptions = useGetAvailableRulesWithDescriptions();

  const { authorizedToReadAnyRules } = useGetRuleTypesPermissions({
    http,
    toasts,
    filteredRuleTypes,
  });

  const [tableLoading, setTableLoading] = useState(true);
  const [tableCount, setTableCount] = useState(0);

  const onUpdate: GetObservabilityAlertsTableProp<'onUpdate'> = ({ isLoading, alertsCount }) => {
    setTableLoading(isLoading);
    setTableCount(alertsCount);
  };

  usePageReady({
    isRefreshing: tableLoading,
    isReady: !tableLoading,
    customMetrics: {
      key1: 'total_alert_count',
      value1: tableCount,
    },
    meta: {
      rangeFrom: alertSearchBarStateProps.rangeFrom,
      rangeTo: alertSearchBarStateProps.rangeTo,
      description: '[ttfmp_alerts] The Observability Alerts page has loaded a table of alerts.',
    },
  });

  const useRulesLink = createUseRulesLink();

  const onGroupingsChange = useCallback(
    ({ activeGroups }: { activeGroups: string[] }) => {
      alertSearchBarStateProps.onGroupingsChange(activeGroups);
    },
    [alertSearchBarStateProps]
  );

  useEffect(() => {
    return setScreenContext?.({
      data: ruleTypesWithDescriptions.map((rule) => ({
        name: rule.id,
        value: `${rule.name} ${rule.description}`,
        description: `An available rule is ${rule.name}.`,
      })),
      starterPrompts: [
        {
          title: i18n.translate('xpack.observability.app.starterPrompts.explainRules.title', {
            defaultMessage: 'Explain',
          }),
          prompt: i18n.translate('xpack.observability.app.starterPrompts.explainRules.prompt', {
            defaultMessage: `Can you explain the rule types that are available?`,
          }),
          icon: 'sparkles',
        },
      ],
    });
  }, [filteredRuleTypes, ruleTypesWithDescriptions, setScreenContext]);

  const onBrushEnd: BrushEndListener = (brushEvent) => {
    const { x } = brushEvent as XYBrushEvent;
    if (x) {
      const [start, end] = x;
      alertSearchBarStateProps.onRangeFromChange(new Date(start).toISOString());
      alertSearchBarStateProps.onRangeToChange(new Date(end).toISOString());
    }
  };

  const [ruleStatsLoading, setRuleStatsLoading] = useState<boolean>(false);
  const [ruleStats, setRuleStats] = useState<RuleStatsState>({
    total: 0,
    disabled: 0,
    muted: 0,
    error: 0,
    snoozed: 0,
  });
  const [esQuery, setEsQuery] = useState<{ bool: BoolQuery }>();
  const timeBuckets = useTimeBuckets();
  const bucketSize = useMemo(
    () =>
      calculateTimeRangeBucketSize(
        {
          from: alertSearchBarStateProps.rangeFrom,
          to: alertSearchBarStateProps.rangeTo,
        },
        timeBuckets
      ),
    [alertSearchBarStateProps.rangeFrom, alertSearchBarStateProps.rangeTo, timeBuckets]
  );
  const alertSummaryTimeRange = useMemo(
    () =>
      getAlertSummaryTimeRange(
        {
          from: alertSearchBarStateProps.rangeFrom,
          to: alertSearchBarStateProps.rangeTo,
        },
        bucketSize?.intervalString || DEFAULT_INTERVAL,
        bucketSize?.dateFormat || DEFAULT_DATE_FORMAT
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alertSearchBarStateProps.rangeFrom, alertSearchBarStateProps.rangeTo, bucketSize, esQuery]
  );

  useBreadcrumbs([
    {
      text: i18n.translate('xpack.observability.breadcrumbs.alertsLinkText', {
        defaultMessage: 'Alerts',
      }),
    },
  ]);

  async function loadRuleStats() {
    setRuleStatsLoading(true);
    try {
      const response = await loadRuleAggregations({
        http,
        ruleTypeIds: filteredRuleTypes,
        consumers: observabilityAlertFeatureIds,
      });
      const { ruleExecutionStatus, ruleMutedStatus, ruleEnabledStatus, ruleSnoozedStatus } =
        response;
      if (ruleExecutionStatus && ruleMutedStatus && ruleEnabledStatus && ruleSnoozedStatus) {
        const total = Object.values(ruleExecutionStatus).reduce((acc, value) => acc + value, 0);
        const { disabled } = ruleEnabledStatus;
        const { muted } = ruleMutedStatus;
        const { error } = ruleExecutionStatus;
        const { snoozed } = ruleSnoozedStatus;
        setRuleStats({
          ...ruleStats,
          total,
          disabled,
          muted,
          error,
          snoozed,
        });
      }
      setRuleStatsLoading(false);
    } catch (_e) {
      toasts.addDanger({
        title: i18n.translate('xpack.observability.alerts.ruleStats.loadError', {
          defaultMessage: 'Unable to load rule stats',
        }),
      });
      setRuleStatsLoading(false);
    }
  }

  useEffect(() => {
    if (authorizedToReadAnyRules) {
      loadRuleStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizedToReadAnyRules]);

  const manageRulesHref = useRulesLink().href;

  return (
    <Provider value={alertSearchBarStateContainer}>
      <ObservabilityPageTemplate
        data-test-subj="alertsPageWithData"
        pageHeader={{
          pageTitle: (
            <>{i18n.translate('xpack.observability.alertsTitle', { defaultMessage: 'Alerts' })} </>
          ),
          rightSideItems: authorizedToReadAnyRules
            ? renderRuleStats(
                ruleStats,
                manageRulesHref as string,
                ruleStatsLoading,
                locators.get<RulesLocatorParams>(rulesLocatorID)
              )
            : undefined,
        }}
      >
        <HeaderMenu />
        <EuiFlexGroup direction="column" gutterSize="m">
          <EuiFlexItem>
            <MaintenanceWindowCallout
              kibanaServices={kibanaServices}
              categories={[DEFAULT_APP_CATEGORIES.observability.id]}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <ObservabilityAlertSearchBar
              {...alertSearchBarStateProps}
              appName={ALERTS_SEARCH_BAR_ID}
              onEsQueryChange={setEsQuery}
              filterControls={filterControls}
              onFilterControlsChange={setFilterControls}
              onControlApiAvailable={setControlApi}
              showFilterBar
              services={{
                timeFilterService,
                AlertsSearchBar,
                http,
                data,
                dataViews,
                notifications,
                spaces,
                useToasts,
                uiSettings,
              }}
            />
            <EuiSpacer size="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            {hasInitialControlLoadingFinished ? (
              <AlertSummaryWidget
                ruleTypeIds={OBSERVABILITY_RULE_TYPE_IDS_WITH_SUPPORTED_STACK_RULE_TYPES}
                consumers={observabilityAlertFeatureIds}
                filter={esQuery}
                fullSize
                timeRange={alertSummaryTimeRange}
                chartProps={{
                  themeOverrides,
                  onBrushEnd,
                }}
              />
            ) : (
              <AlertsLoader />
            )}
          </EuiFlexItem>
          <EuiFlexItem>
            {esQuery && hasInitialControlLoadingFinished && (
              <AlertsGrouping<AlertsByGroupingAgg>
                ruleTypeIds={OBSERVABILITY_RULE_TYPE_IDS_WITH_SUPPORTED_STACK_RULE_TYPES}
                consumers={observabilityAlertFeatureIds}
                from={alertSearchBarStateProps.rangeFrom}
                to={alertSearchBarStateProps.rangeTo}
                globalFilters={globalFilters}
                globalQuery={globalQuery}
                groupingId={ALERTS_PAGE_ALERTS_TABLE_CONFIG_ID}
                defaultGroupingOptions={DEFAULT_GROUPING_OPTIONS}
                initialGroupings={
                  alertSearchBarStateProps?.groupings?.length
                    ? alertSearchBarStateProps.groupings
                    : undefined
                }
                onGroupingsChange={onGroupingsChange}
                getAggregationsByGroupingField={getAggregationsByGroupingField}
                renderGroupPanel={renderGroupPanel}
                getGroupStats={getGroupStats}
                services={{
                  notifications,
                  dataViews,
                  http,
                }}
              >
                {(groupingFilters) => {
                  const groupQuery = buildEsQuery({
                    filters: groupingFilters,
                  });
                  return (
                    <ObservabilityAlertsTable
                      id={ALERTS_TABLE_ID}
                      ruleTypeIds={OBSERVABILITY_RULE_TYPE_IDS_WITH_SUPPORTED_STACK_RULE_TYPES}
                      consumers={observabilityAlertFeatureIds}
                      query={mergeBoolQueries(esQuery, groupQuery)}
                      pageSize={ALERTS_PER_PAGE}
                      onUpdate={onUpdate}
                      columns={tableColumns}
                      renderAdditionalToolbarControls={() => (
                        <GroupingToolbarControls
                          groupingId={ALERTS_PAGE_ALERTS_TABLE_CONFIG_ID}
                          ruleTypeIds={OBSERVABILITY_RULE_TYPE_IDS_WITH_SUPPORTED_STACK_RULE_TYPES}
                        />
                      )}
                      showInspectButton
                      services={{
                        data,
                        http,
                        notifications,
                        fieldFormats,
                        application,
                        licensing,
                        cases,
                        settings,
                      }}
                    />
                  );
                }}
              </AlertsGrouping>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </ObservabilityPageTemplate>
    </Provider>
  );
}

export function AlertsPage() {
  return (
    <Provider value={alertSearchBarStateContainer}>
      <InternalAlertsPage />
    </Provider>
  );
}
