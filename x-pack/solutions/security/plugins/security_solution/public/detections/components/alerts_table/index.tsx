/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type FC, memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { EuiDataGridRowHeightsOptions, EuiDataGridStyle } from '@elastic/eui';
import { EuiFlexGroup } from '@elastic/eui';
import type { Filter } from '@kbn/es-query';
import type {
  AlertsTableProps as ResponseOpsAlertsTableProps,
  RenderContext as ResponseOpsRenderContext,
} from '@kbn/response-ops-alerts-table/types';
import { ALERT_BUILDING_BLOCK_TYPE, AlertConsumers } from '@kbn/rule-data-utils';
import { SECURITY_SOLUTION_RULE_TYPE_IDS } from '@kbn/securitysolution-rules';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { getEsQueryConfig } from '@kbn/data-plugin/public';
import {
  dataTableActions,
  dataTableSelectors,
  tableDefaults,
  TableId,
} from '@kbn/securitysolution-data-table';
import type { SetOptional } from 'type-fest';
import { noop } from 'lodash';
import type { Alert } from '@kbn/alerting-types';
import {
  AlertsTable as ResponseOpsAlertsTable,
  alertsTableQueryClient,
} from '@kbn/response-ops-alerts-table';
import { useSearchAlertsQuery } from '@kbn/alerts-ui-shared/src/common/hooks/use_search_alerts_query';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import { QueryClientProvider } from '@kbn/react-query';
import { PROJECT_ROUTING } from '@kbn/cps-utils';
import { DocumentDetailsRightPanelKey } from '../../../flyout/document_details/shared/constants/panel_keys';
import { PageScope } from '../../../data_view_manager/constants';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import { documentFlyoutHistoryKey } from '../../../flyout_v2/shared/constants/flyout_history';
import { PaginatedDocumentFlyout } from '../../../flyout_v2/document/paginated_document_flyout';
import type { ScopedPaginationSlice } from '../../../common/utils/flyout_pagination/types';
import { usePaginatedFlyout } from '../../../common/utils/flyout_pagination/use_paginated_flyout';
import { alertsTableRef } from './alerts_table_ref';
import { useBulkActionsByTableType } from '../../hooks/trigger_actions_alert_table/use_bulk_actions';
import type {
  GetSecurityAlertsTableProp,
  SecurityAlertsTableContext,
  SecurityAlertsTableProps,
} from './types';
import { ActionsCell } from './actions_cell';
import { useGlobalTime } from '../../../common/containers/use_global_time';
import { useLicense } from '../../../common/hooks/use_license';
import { APP_ID, CASES_FEATURE_ID, VIEW_SELECTION } from '../../../../common/constants';
import { useBulkAddToChatConfig } from '../../../agent_builder/hooks/use_bulk_add_to_chat_config';
import { useAgentBuilderAvailability } from '../../../agent_builder/hooks/use_agent_builder_availability';
import { DEFAULT_COLUMN_MIN_WIDTH } from '../../../timelines/components/timeline/body/constants';
import { defaultRowRenderers } from '../../../timelines/components/timeline/body/renderers';
import { eventsDefaultModel } from '../../../common/components/events_viewer/default_model';
import type { State } from '../../../common/store';
import { inputsSelectors } from '../../../common/store';
import { combineQueries } from '../../../common/lib/kuery';
import { useInvalidFilterQuery } from '../../../common/hooks/use_invalid_filter_query';
import { StatefulEventContext } from '../../../common/components/events_viewer/stateful_event_context';
import { useKibana, KibanaServices } from '../../../common/lib/kibana';
import { useDeepEqualSelector } from '../../../common/hooks/use_selector';
import { CellValue, getColumns } from '../../configurations/security_solution_detections';
import { buildTimeRangeFilter } from './helpers';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import * as i18n from './translations';
import { eventRenderedViewColumns } from '../../configurations/security_solution_detections/columns';
import { getAlertsDefaultModel } from './default_config';
import { useFetchNotes } from '../../../notes/hooks/use_fetch_notes';
import { getDefaultControlColumn } from '../../../timelines/components/timeline/body/control_columns';
import { AdditionalToolbarControls } from './additional_toolbar_controls';
import { useFetchUserProfilesFromAlerts } from '../../configurations/security_solution_detections/fetch_page_context';
import { useCellActionsOptions } from '../../hooks/trigger_actions_alert_table/use_cell_actions';
import { useAlertsTableFieldsBrowserOptions } from '../../hooks/trigger_actions_alert_table/use_trigger_actions_browser_fields_options';
import { AlertTableCellContextProvider } from '../../configurations/security_solution_detections/cell_value_context';
import { useBrowserFields } from '../../../data_view_manager/hooks/use_browser_fields';
import { DETECTIONS_TABLE_IDS } from '../../constants';

const { updateIsLoading, updateItemsPerPage, updateTotalCount } = dataTableActions;

// we show a maximum of 6 action buttons
// - open flyout
// - investigate in timeline
// - 3-dot menu for more actions
// - add new note
// - session view
// - analyzer graph
const MAX_ACTION_BUTTON_COUNT = 6;
const DEFAULT_DATA_GRID_HEIGHT = 600;

const ALERT_TABLE_CONSUMERS: ResponseOpsAlertsTableProps['consumers'] = [AlertConsumers.SIEM];

// Highlight rows with building block alerts
const shouldHighlightRow = (alert: Alert) => !!alert[ALERT_BUILDING_BLOCK_TYPE];

interface GridContainerProps {
  hideLastPage: boolean;
}

export const FullWidthFlexGroupTable = styled(EuiFlexGroup)`
  overflow: hidden;
  margin: 0;
  display: flex;
`;

const EuiDataGridContainer = styled.div<GridContainerProps>`
  ul.euiPagination__list {
    li.euiPagination__item:last-child {
      ${({ hideLastPage }) => {
        return `${hideLastPage ? 'display:none' : ''}`;
      }};
    }
  }

  div .euiDataGridRowCell {
    display: flex;
    align-items: center;
  }

  div .euiDataGridRowCell > [data-focus-lock-disabled] {
    display: flex;
    align-items: center;
    flex-grow: 1;
    width: 100%;
  }

  div .euiDataGridRowCell__content {
    flex-grow: 1;
  }

  div .siemEventsTable__trSupplement--summary {
    display: block;
  }

  width: 100%;
`;

interface AlertTableProps
  extends SetOptional<SecurityAlertsTableProps, 'id' | 'ruleTypeIds' | 'query'> {
  inputFilters?: Filter[];
  tableType?: TableId;
  pageScope?: PageScope;
  isLoading?: boolean;
  onRuleChange?: () => void;
  disableAdditionalToolbarControls?: boolean;
}

const sort: GetSecurityAlertsTableProp<'sort'> = [
  {
    '@timestamp': {
      order: 'desc',
    },
  },
];
const casesConfiguration = {
  featureId: CASES_FEATURE_ID,
  owner: [APP_ID],
  syncAlerts: true,
  extractObservables: true,
};
const emptyInputFilters: Filter[] = [];

const AlertsTableComponent: FC<Omit<AlertTableProps, 'services' | 'isMutedAlertsEnabled'>> = ({
  inputFilters = emptyInputFilters,
  tableType = TableId.alertsOnAlertsPage,
  pageScope = PageScope.alerts,
  isLoading,
  onRuleChange,
  disableAdditionalToolbarControls,
  ...tablePropsOverrides
}) => {
  const { id } = tablePropsOverrides;
  const { services: kibanaServices } = useKibana();
  const {
    data,
    http,
    notifications,
    rendering,
    fieldFormats,
    application,
    licensing,
    uiSettings,
    settings,
    cases,
    agentBuilder,
  } = kibanaServices;

  const { from, to, setQuery } = useGlobalTime();

  const dispatch = useDispatch();

  const timelineID = tableType;
  // Store context in state rather than creating object in provider value={} to prevent re-renders caused by a new object being created
  const [activeStatefulEventContext] = useState({
    timelineID,
    tabType: 'query',
    enableHostDetailsFlyout: true,
    enableIpDetailsFlyout: true,
    onRuleChange,
  });
  const { dataView } = useDataView(pageScope);
  const browserFields = useBrowserFields(pageScope);
  const runtimeMappings = useMemo(() => dataView.getRuntimeMappings(), [dataView]);

  const license = useLicense();
  const isEnterprisePlus = license.isEnterprise();

  const getGlobalFiltersQuerySelector = useMemo(
    () => inputsSelectors.globalFiltersQuerySelector(),
    []
  );
  const getGlobalQuerySelector = useMemo(() => inputsSelectors.globalQuerySelector(), []);
  const globalQuery = useDeepEqualSelector(getGlobalQuerySelector);
  const globalFilters = useDeepEqualSelector(getGlobalFiltersQuerySelector);
  const licenseDefaults = useMemo(() => getAlertsDefaultModel(license), [license]);
  const getTable = useMemo(() => dataTableSelectors.getTableByIdSelector(), []);

  const {
    initialized: isDataTableInitialized,
    viewMode: tableView = eventsDefaultModel.viewMode,
    columns,
    totalCount: count,
    itemsPerPage: reduxItemsPerPage = tableDefaults.itemsPerPage,
  } = useSelector((state: State) => getTable(state, tableType) ?? licenseDefaults);

  const timeRangeFilter = useMemo(() => buildTimeRangeFilter(from, to), [from, to]);

  const allFilters = useMemo(() => {
    return [...inputFilters, ...(globalFilters ?? []), ...(timeRangeFilter ?? [])];
  }, [inputFilters, globalFilters, timeRangeFilter]);

  const combinedQuery = useMemo(() => {
    if (browserFields != null) {
      return combineQueries({
        config: getEsQueryConfig(uiSettings),
        dataProviders: [],
        dataView,
        browserFields,
        filters: [...allFilters],
        kqlQuery: globalQuery,
        kqlMode: globalQuery.language,
      });
    }
    return null;
  }, [browserFields, uiSettings, dataView, allFilters, globalQuery]);

  useInvalidFilterQuery({
    id: tableType,
    filterQuery: combinedQuery?.filterQuery,
    kqlError: combinedQuery?.kqlError,
    query: globalQuery,
    startDate: from,
    endDate: to,
  });

  const finalBoolQuery: ResponseOpsAlertsTableProps['query'] = useMemo(() => {
    if (combinedQuery?.kqlError || !combinedQuery?.filterQuery) {
      return { bool: {} };
    }
    return { bool: { filter: JSON.parse(combinedQuery?.filterQuery) } };
  }, [combinedQuery?.filterQuery, combinedQuery?.kqlError]);

  const isEventRenderedView = tableView === VIEW_SELECTION.eventRenderedView;

  const gridStyle = useMemo(
    () =>
      ({
        border: 'none',
        fontSize: 's',
        header: 'underline',
        stripes: isEventRenderedView,
      } as EuiDataGridStyle),
    [isEventRenderedView]
  );

  const rowHeightsOptions: EuiDataGridRowHeightsOptions | undefined = useMemo(() => {
    if (isEventRenderedView) {
      return {
        defaultHeight: 'auto',
      };
    }
    return undefined;
  }, [isEventRenderedView]);

  const alertColumns = useMemo(
    () => (columns?.length ? columns : getColumns(license)),
    [columns, license]
  );

  const finalBrowserFields = useMemo(
    () => (isEventRenderedView ? {} : browserFields),
    [isEventRenderedView, browserFields]
  );

  const finalColumns = useMemo(
    () => (isEventRenderedView ? eventRenderedViewColumns : alertColumns),
    [alertColumns, isEventRenderedView]
  );

  const { onLoad } = useFetchNotes();
  const [tableContext, setTableContext] =
    useState<ResponseOpsRenderContext<SecurityAlertsTableContext>>();

  // The user's chosen page in the response-ops alerts table. Owned locally so
  // that the in-flyout pagination, which spans the entire result set, cannot
  // shift the underlying table view.
  const [tablePageIndex, setTablePageIndex] = useState(0);

  // `sort` is lifted up so the parallel `useSearchAlertsQuery` below uses the
  // same ordering as the response-ops table when the user reorders columns.
  // Without this, switching sort in the table would cause the cross-page
  // flyout query to return alerts in a different (stale) order.
  const [liftedSort, setLiftedSort] = useState<GetSecurityAlertsTableProp<'sort'>>(sort);

  const getAlertBody = useCallback(
    (instanceId: string) => (
      <PaginatedDocumentFlyout scopeId={tableType} paginationInstanceId={instanceId} />
    ),
    [tableType]
  );

  // Resolves the document at an absolute alert index (0-based across the full
  // result set) from the currently-loaded page. Returns null when the alert is
  // on a different page — the parallel cross-page query will resolve it and
  // call openPaginatedFlyout again once the data is available.
  const resolveDocument = useCallback(
    (alertIndex: number) => {
      if (reduxItemsPerPage <= 0 || !tableContext) return null;
      const targetPageIndex = Math.floor(alertIndex / reduxItemsPerPage);
      const isInPage = targetPageIndex === tablePageIndex;
      const offset = alertIndex - tablePageIndex * reduxItemsPerPage;
      const alert = isInPage ? (tableContext.alerts?.[offset] as Alert | undefined) : undefined;
      if (!alert) return null;
      return {
        id: alert._id,
        indexName: alert._index,
        scopeId: tableType,
        stateUpdate: { flyoutAlert: alert } as Partial<ScopedPaginationSlice>,
      };
    },
    [reduxItemsPerPage, tableContext, tablePageIndex, tableType]
  );

  const { paginationInstanceId, slice, setState, openPaginatedFlyout } = usePaginatedFlyout({
    rightPanelKey: DocumentDetailsRightPanelKey,
    resolveDocument,
    renderBody: getAlertBody,
    historyKey: documentFlyoutHistoryKey,
  });

  const { flyoutAlertIndex, pageSize } = slice;

  const onUpdate: GetSecurityAlertsTableProp<'onUpdate'> = useCallback(
    (context) => {
      setTableContext(context);
      dispatch(
        updateIsLoading({
          id: tableType,
          isLoading: context.isLoading ?? true,
        })
      );
      dispatch(
        updateTotalCount({
          id: tableType,
          totalCount: context.alertsCount ?? -1,
        })
      );
      setState({ totalAlertCount: context.alertsCount ?? 0 });
      setQuery({
        id: tableType,
        loading: context.isLoading ?? true,
        refetch: context.refresh ?? noop,
        inspect: null,
      });
    },
    [dispatch, setQuery, setState, tableType]
  );

  const onPageIndexChange = useCallback((newPageIndex: number) => {
    setTablePageIndex(newPageIndex);
  }, []);

  const onPageSizeChange = useCallback(
    (newPageSize: number) => {
      dispatch(updateItemsPerPage({ id: tableType, itemsPerPage: newPageSize }));
      setState({ pageSize: newPageSize });
    },
    [dispatch, setState, tableType]
  );

  // Mirror Redux `itemsPerPage` into the pagination slice so that the
  // in-flyout pagination can compute `alertIndexInPage` without reaching
  // into Redux.
  useEffect(() => {
    if (reduxItemsPerPage !== pageSize) {
      setState({ pageSize: reduxItemsPerPage });
    }
  }, [pageSize, reduxItemsPerPage, setState]);

  // Fields fetched alongside each alert. Same shape that response-ops derives
  // internally from `columns` (see `useColumns`); reproduced here so the
  // parallel flyout query stays in sync with the table query and React Query
  // can dedupe identical requests via its query key.
  const flyoutQueryFields = useMemo(
    () => finalColumns.map((col) => ({ field: col.id, include_unmapped: true })),
    [finalColumns]
  );

  // The page that holds the alert currently shown in the flyout. When the
  // user navigates the flyout into another page than the table's current
  // page, this drives a parallel `useSearchAlertsQuery` so the new alert can
  // be loaded without moving the table.
  const flyoutPageIndex = useMemo(
    () =>
      flyoutAlertIndex != null && reduxItemsPerPage > 0
        ? Math.floor(flyoutAlertIndex / reduxItemsPerPage)
        : tablePageIndex,
    [flyoutAlertIndex, reduxItemsPerPage, tablePageIndex]
  );

  // Parallel query for the flyout. When `flyoutPageIndex === tablePageIndex`
  // the params (and therefore the React Query key) are identical to the
  // table's `useSearchAlertsQuery`, so no extra request is made — both hooks
  // share the same cache entry. When the flyout strays onto another page,
  // this query lazily fetches that page while the table stays put.
  const { data: flyoutAlertsData, isFetching: isFetchingFlyoutAlerts } = useSearchAlertsQuery({
    data,
    ruleTypeIds: SECURITY_SOLUTION_RULE_TYPE_IDS,
    consumers: ALERT_TABLE_CONSUMERS,
    projectRouting: PROJECT_ROUTING.ORIGIN,
    fields: flyoutQueryFields,
    query: finalBoolQuery,
    sort: liftedSort,
    runtimeMappings,
    pageIndex: flyoutPageIndex,
    pageSize: reduxItemsPerPage,
  });

  // Drive the loading state shown by the right panel. We are loading whenever
  // the user has navigated the flyout to a page that isn't the table's page
  // and the parallel query hasn't resolved that alert yet.
  useEffect(() => {
    if (flyoutAlertIndex == null || flyoutPageIndex === tablePageIndex) {
      setState({ isFlyoutAlertLoading: false });
      return;
    }
    const offset = flyoutAlertIndex - flyoutPageIndex * reduxItemsPerPage;
    const alertOnRequestedPage = flyoutAlertsData?.alerts?.[offset];
    setState({
      isFlyoutAlertLoading: !alertOnRequestedPage || isFetchingFlyoutAlerts,
    });
  }, [
    flyoutAlertIndex,
    flyoutAlertsData?.alerts,
    flyoutPageIndex,
    isFetchingFlyoutAlerts,
    reduxItemsPerPage,
    setState,
    tablePageIndex,
  ]);

  // Push the resolved alert into the shared store once the parallel query
  // returns it, for the cross-page case. The synchronous in-page case is
  // handled by `usePaginatedFlyout` / `onOpen` so that re-clicking the same
  // row after closing the flyout reliably re-opens it.
  useEffect(() => {
    if (flyoutAlertIndex == null || reduxItemsPerPage <= 0) return;
    if (flyoutPageIndex === tablePageIndex) return;
    const offset = flyoutAlertIndex - flyoutPageIndex * reduxItemsPerPage;
    const alert = flyoutAlertsData?.alerts?.[offset] as Alert | undefined;
    if (!alert) return;
    openPaginatedFlyout(flyoutAlertIndex, {
      id: alert._id,
      indexName: alert._index,
      scopeId: tableType,
      stateUpdate: { flyoutAlert: alert },
    });
  }, [
    flyoutAlertIndex,
    flyoutAlertsData?.alerts,
    flyoutPageIndex,
    openPaginatedFlyout,
    reduxItemsPerPage,
    tablePageIndex,
    tableType,
  ]);
  const userProfiles = useFetchUserProfilesFromAlerts({
    alerts: tableContext?.alerts ?? [],
    columns: tableContext?.columns ?? [],
  });

  let ACTION_BUTTON_COUNT = MAX_ACTION_BUTTON_COUNT;

  // hiding the session view icon for users without enterprise plus license
  if (!isEnterprisePlus) {
    ACTION_BUTTON_COUNT--;
  }
  const {
    timelinePrivileges: { read: canReadTimelines },
    notesPrivileges: { read: canReadNotes },
  } = useUserPrivileges();

  // remove space if investigate timeline icon shouldn't be displayed
  if (!canReadTimelines) {
    ACTION_BUTTON_COUNT--;
  }

  if (!canReadNotes) {
    ACTION_BUTTON_COUNT--;
  }

  const leadingControlColumn = useMemo(
    () => getDefaultControlColumn(ACTION_BUTTON_COUNT)[0],
    [ACTION_BUTTON_COUNT]
  );

  const additionalContext: SecurityAlertsTableContext = useMemo(
    () => ({
      rowRenderers: defaultRowRenderers,
      isDetails: false,
      truncate: true,
      isDraggable: false,
      leadingControlColumn,
      userProfiles,
      tableType,
      pageScope,
      paginationInstanceId,
    }),
    [leadingControlColumn, pageScope, paginationInstanceId, tableType, userProfiles]
  );

  const refreshAlertsTable = useCallback(() => {
    alertsTableRef.current?.refresh();
  }, []);

  const fieldsBrowserOptions = useAlertsTableFieldsBrowserOptions(
    pageScope,
    alertsTableRef.current?.toggleColumn
  );
  const cellActionsOptions = useCellActionsOptions(tableType, tableContext);
  const bulkActions = useBulkActionsByTableType(tableType, finalBoolQuery, refreshAlertsTable);

  useEffect(() => {
    if (isDataTableInitialized) return;
    dispatch(
      dataTableActions.initializeDataTableSettings({
        id: tableType,
        title: i18n.SESSIONS_TITLE,
        defaultColumns: finalColumns.map((c) => ({
          initialWidth: DEFAULT_COLUMN_MIN_WIDTH,
          ...c,
        })),
      })
    );
  }, [dispatch, tableType, finalColumns, isDataTableInitialized]);

  const toolbarVisibility = useMemo(
    () => ({
      showColumnSelector: !isEventRenderedView,
      showSortSelector: !isEventRenderedView,
    }),
    [isEventRenderedView]
  );

  const services = useMemo(
    () => ({
      data,
      http,
      notifications,
      rendering,
      fieldFormats,
      application,
      licensing,
      settings,
      cases,
      agentBuilder,
    }),
    [
      application,
      data,
      fieldFormats,
      http,
      licensing,
      notifications,
      rendering,
      settings,
      cases,
      agentBuilder,
    ]
  );

  /**
   * if records are too less, we don't want table to be of fixed height.
   * it should shrink to the content height.
   * Height setting enables/disables virtualization depending on fixed/undefined height values respectively.
   * */
  const alertTableHeight = useMemo(
    () =>
      isEventRenderedView
        ? `${DEFAULT_DATA_GRID_HEIGHT}px`
        : /*
         * We keep fixed height in Event rendered because of the row height issue
         * as mentioned here
         */
        count > 20
        ? `${DEFAULT_DATA_GRID_HEIGHT}px`
        : undefined,
    [count, isEventRenderedView]
  );

  const onLoaded = useCallback(({ alerts }: { alerts: Alert[] }) => onLoad(alerts), [onLoad]);

  const { isAgentBuilderEnabled } = useAgentBuilderAvailability();
  const pathway =
    tableType === TableId.alertsOnRuleDetailsPage
      ? ('bulk_alerts_rule_details' as const)
      : ('bulk_alerts_alerts_page' as const);
  const bulkAddToChatConfig = useBulkAddToChatConfig(pathway);
  const maybeBulkAddToChatConfig = isAgentBuilderEnabled ? bulkAddToChatConfig : undefined;

  /**
   * We want to hide additional controls (like grouping) if the table is being rendered
   * in the cases page OR if the user of the table explicitly set `disableAdditionalToolbarControls`
   * to true
   */
  const shouldRenderAdditionalToolbarControls =
    disableAdditionalToolbarControls || tableType === TableId.alertsOnCasePage;

  if (isLoading) {
    return null;
  }

  return (
    <FullWidthFlexGroupTable gutterSize="none">
      <StatefulEventContext.Provider value={activeStatefulEventContext}>
        <EuiDataGridContainer hideLastPage={false}>
          <AlertTableCellContextProvider tableId={tableType} sourcererScope={pageScope}>
            <ResponseOpsAlertsTable<SecurityAlertsTableContext>
              key={isEventRenderedView ? 'eventRenderedView' : 'defaultView'}
              ref={alertsTableRef}
              // Stores separate configuration based on the view of the table
              id={id ?? `detection-engine-alert-table-${tableType}-${tableView}`}
              ruleTypeIds={SECURITY_SOLUTION_RULE_TYPE_IDS}
              consumers={ALERT_TABLE_CONSUMERS}
              projectRouting={PROJECT_ROUTING.ORIGIN}
              query={finalBoolQuery}
              sort={liftedSort}
              onSortChange={setLiftedSort}
              casesConfiguration={casesConfiguration}
              gridStyle={gridStyle}
              shouldHighlightRow={shouldHighlightRow}
              rowHeightsOptions={rowHeightsOptions}
              columns={finalColumns}
              browserFields={finalBrowserFields}
              onUpdate={onUpdate}
              onLoaded={onLoaded}
              additionalContext={additionalContext}
              height={alertTableHeight}
              isMutedAlertsEnabled={false}
              pageSize={reduxItemsPerPage}
              onPageSizeChange={onPageSizeChange}
              pageIndex={tablePageIndex}
              onPageIndexChange={onPageIndexChange}
              renderExpandedAlertView={null}
              runtimeMappings={runtimeMappings}
              toolbarVisibility={toolbarVisibility}
              renderCellValue={CellValue}
              renderActionsCell={ActionsCell}
              renderAdditionalToolbarControls={
                shouldRenderAdditionalToolbarControls ? undefined : AdditionalToolbarControls
              }
              actionsColumnWidth={leadingControlColumn.width}
              additionalBulkActions={bulkActions}
              fieldsBrowserOptions={
                DETECTIONS_TABLE_IDS.some((tableId) => tableId === tableType)
                  ? fieldsBrowserOptions
                  : undefined
              }
              cellActionsOptions={cellActionsOptions}
              showInspectButton
              showCsvExportButton
              kibanaVersion={KibanaServices.getKibanaVersion()}
              services={services}
              bulkAddToChatConfig={maybeBulkAddToChatConfig}
              {...tablePropsOverrides}
            />
          </AlertTableCellContextProvider>
        </EuiDataGridContainer>
      </StatefulEventContext.Provider>
    </FullWidthFlexGroupTable>
  );
};

const MemoizedAlertsTable = memo(AlertsTableComponent);

// Wrapping the table in a `QueryClientProvider` here (rather than relying on
// the provider rendered inside `<ResponseOpsAlertsTable>`) is what lets the
// parallel `useSearchAlertsQuery` call inside `AlertsTableComponent` find a
// `QueryClient` via `AlertsQueryContext`. Reusing `alertsTableQueryClient`
// keeps the parallel flyout query and the internal table query on the same
// cache, so identical params dedupe to a single network request.
export const AlertsTable: FC<Omit<AlertTableProps, 'services' | 'isMutedAlertsEnabled'>> = (
  props
) => (
  <QueryClientProvider client={alertsTableQueryClient} context={AlertsQueryContext}>
    <MemoizedAlertsTable {...props} />
  </QueryClientProvider>
);
