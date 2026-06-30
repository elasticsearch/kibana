/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Ref, FC } from 'react';
import React, {
  useCallback,
  useRef,
  useMemo,
  useReducer,
  useEffect,
  useImperativeHandle,
  forwardRef,
  memo,
} from 'react';
import type {
  EuiDataGridColumn,
  EuiDataGridSorting,
  EuiDataGridControlColumn,
  EuiDataGridRefProps,
} from '@elastic/eui';
import { EuiProgress } from '@elastic/eui';
import {
  ALERT_CASE_IDS,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_RULE_UUID,
} from '@kbn/rule-data-utils';
import { QueryClientProvider, useQueryClient } from '@kbn/react-query';
import { useSearchAlertsQuery } from '@kbn/alerts-ui-shared/src/common/hooks/use_search_alerts_query';
import { DEFAULT_ALERTS_PAGE_SIZE } from '@kbn/alerts-ui-shared/src/common/constants';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import type { Alert, BrowserFields } from '@kbn/alerting-types';
import { useGetAlertSnoozeStateQuery } from '@kbn/response-ops-alerts-apis/hooks/use_get_alert_snooze_state_query';
import deepEqual from 'fast-deep-equal';
import { useFetchAlertsFieldsQuery } from '@kbn/alerts-ui-shared/src/common/hooks/use_fetch_alerts_fields_query';
import { queryKeys as alertsQueryKeys } from '@kbn/response-ops-alerts-apis/query_keys';
import { applySetStateAction } from '../utils/apply_set_state_action';
import { useAlertsTableQueryParams } from '../hooks/use_alerts_table_query_params';
import { applyColumnsConfiguration } from '../utils/columns_configuration';
import { useAlertsTableConfiguration } from '../hooks/use_alerts_table_configuration';
import { ErrorFallback } from './error_fallback';
import { defaultAlertsTableColumns } from '../configuration';
import { queryKeys } from '../constants';
import { AlertsDataGrid } from './alerts_data_grid';
import { EmptyState } from './empty_state';
import type { AlertsTableSortCombinations, RenderContext, RowSelectionState } from '../types';
import type {
  AdditionalContext,
  AlertsDataGridProps,
  AlertsTableImperativeApi,
  AlertsTableProps,
} from '../types';
import { bulkActionsReducer } from '../reducers/bulk_actions_reducer';
import { useColumns } from '../hooks/use_columns';
import { InspectButtonContainer } from './alerts_query_inspector';
import { alertsTableQueryClient } from '../query_client';
import { useBulkGetCasesQuery } from '../hooks/use_bulk_get_cases';
import { useBulkGetMaintenanceWindowsQuery } from '../hooks/use_bulk_get_maintenance_windows';
import { AlertsTableContextProvider } from '../contexts/alerts_table_context';
import { ErrorBoundary } from './error_boundary';
import { typedForwardRef } from '../utils/react';
import { useControllableState } from '../hooks/use_controllable_state';
import { LocalStorageWrapper } from '../utils/local_storage_wrapper';

type AlertWithCaseIds = Alert & Required<Pick<Alert, typeof ALERT_CASE_IDS>>;
type AlertWithMaintenanceWindowIds = Alert &
  Required<Pick<Alert, typeof ALERT_MAINTENANCE_WINDOW_IDS>>;

const getCaseIdsFromAlerts = (alerts: Alert[]) => [
  ...new Set(
    alerts
      .filter((alert): alert is AlertWithCaseIds => {
        const caseIds = alert[ALERT_CASE_IDS];
        return caseIds != null && caseIds.length > 0;
      })
      .map((alert) => alert[ALERT_CASE_IDS] as string[])
      .flat()
  ),
];

const getRuleIdsFromAlerts = (alerts: Alert[]) => [
  ...new Set(alerts.map((a) => a[ALERT_RULE_UUID]![0] as string)),
];

const getMaintenanceWindowIdsFromAlerts = (alerts: Alert[]) => [
  ...new Set(
    alerts
      .filter((alert): alert is AlertWithMaintenanceWindowIds => {
        const maintenanceWindowIds = alert[ALERT_MAINTENANCE_WINDOW_IDS];
        return maintenanceWindowIds != null && maintenanceWindowIds.length > 0;
      })
      .map((alert) => alert[ALERT_MAINTENANCE_WINDOW_IDS] as string[])
      .flat()
  ),
];

const isCasesColumnEnabled = (columns: EuiDataGridColumn[]): boolean =>
  columns.some(({ id }) => id === ALERT_CASE_IDS);

const isMaintenanceWindowColumnEnabled = (columns: EuiDataGridColumn[]): boolean =>
  columns.some(({ id }) => id === ALERT_MAINTENANCE_WINDOW_IDS);

/**
 * If an alert is expanded, returns the page where the alert is located if different
 * from the current page index
 */
const getExpandedAlertPage = (
  expandedAlertIndex: number | null,
  pageSize: number,
  pageIndex: number
) => {
  if (expandedAlertIndex !== null) {
    const expandedAlertPage = Math.floor(expandedAlertIndex / pageSize);
    if (expandedAlertPage >= 0 && expandedAlertPage !== pageIndex) {
      return expandedAlertPage;
    }
  }
};

const getLocalStorageWrapper = () => new LocalStorageWrapper(window.localStorage);

const emptyRowSelection = new Map<number, RowSelectionState>();

const initialBulkActionsState = {
  rowSelection: emptyRowSelection,
  isAllSelected: false,
  areAllVisibleRowsSelected: false,
  rowCount: 0,
  updatedAt: Date.now(),
};

/**
 * An `EuiDataGrid` abstraction to render alert documents
 *
 * It manages the paginated and cached fetching of alerts based on the
 * provided `ruleTypeIds` and `consumers` (the final query can be refined
 * through the `query` and `sort` props). The `id` prop is required in order
 * to persist the table state in `localStorage`
 *
 * @example
 * ```tsx
 * <AlertsTable
 *   id="my-alerts-table"
 *   ruleTypeIds={ruleTypeIds}
 *   consumers={consumers}
 *   query={esQuery}
 *   sort={defaultAlertsTableSort}
 *   renderCellValue={CellValue}
 *   renderActionsCell={ActionsCell}
 *   services={{ ... }}
 * />
 * ```
 */
export const AlertsTable = memo(
  forwardRef((props, ref) => {
    return (
      <QueryClientProvider client={alertsTableQueryClient} context={AlertsQueryContext}>
        <ErrorBoundary fallback={ErrorFallback}>
          <AlertsTableContent {...props} ref={ref} />
        </ErrorBoundary>
      </QueryClientProvider>
    );
  })
  // Type cast to avoid losing the generic type
) as typeof AlertsTableContent;

(AlertsTable as FC).displayName = 'AlertsTable';

const DEFAULT_LEADING_CONTROL_COLUMNS: EuiDataGridControlColumn[] = [];
const DEFAULT_SORT: AlertsTableSortCombinations[] = [];

const AlertsTableContent = typedForwardRef(
  <AC extends AdditionalContext>(
    {
      id,
      ruleTypeIds,
      consumers,
      projectRouting,
      query,
      minScore,
      trackScores = false,
      sort: sortProp = DEFAULT_SORT,
      onSortChange,
      pageIndex: pageIndexProp,
      onPageIndexChange,
      pageSize: pageSizeProp,
      onPageSizeChange,
      columns: columnsProp,
      onColumnsChange,
      visibleColumns: visibleColumnsProp,
      onVisibleColumnsChange,
      leadingControlColumns = DEFAULT_LEADING_CONTROL_COLUMNS,
      trailingControlColumns,
      rowHeightsOptions,
      gridStyle,
      browserFields: alertsFieldsProp,
      onUpdate,
      onLoaded,
      runtimeMappings,
      showAlertStatusWithFlapping,
      toolbarVisibility,
      shouldHighlightRow,
      dynamicRowHeight = false,
      emptyState,
      openLinksInNewTab = false,
      additionalContext,
      renderCellValue,
      renderCellPopover,
      renderActionsCell,
      getAlertFormatter,
      alertDetailsNavigation,
      expandedAlertIndex: expandedAlertIndexProp,
      onExpandedAlertIndexChange,
      renderExpandedAlertView,
      renderAdditionalToolbarControls: AdditionalToolbarControlsComponent,
      lastReloadRequestTime,
      configurationStorage: configurationStorageProp,
      isMutedAlertsEnabled = true,
      showCsvExportButton = false,
      kibanaVersion,
      services,
      ...publicDataGridProps
    }: AlertsTableProps<AC>,
    ref: Ref<AlertsTableImperativeApi>
  ) => {
    // Memoized so that consumers can pass an inline object without causing re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const memoizedServices = useMemo(() => services, Object.values(services));
    const { casesConfiguration, showInspectButton } = publicDataGridProps;
    const { data, cases: casesService, http, notifications, application, licensing } = services;
    const queryClient = useQueryClient({ context: AlertsQueryContext });
    const dataGridRef = useRef<EuiDataGridRefProps>(null);
    const configurationStorage = useMemo(
      () => configurationStorageProp ?? getLocalStorageWrapper(),
      [configurationStorageProp]
    );

    const [configuration, setConfiguration] = useAlertsTableConfiguration({
      id,
      configurationStorage,
      notifications,
    });

    // Keeping a stable reference to the default columns to support the reset functionality and
    // to apply default properties to the configured columns
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const defaultColumns = useMemo(() => columnsProp ?? defaultAlertsTableColumns, []);
    const [columns, setColumns] = useControllableState({
      value: columnsProp,
      onChange: onColumnsChange,
      defaultValue: applyColumnsConfiguration({
        defaultColumns,
        configuredColumns: configuration?.columns,
      }),
    });
    const updateColumns = useCallback<typeof setColumns>(
      (setStateAction) => {
        const newColumns = applySetStateAction(setStateAction, columns);
        setColumns(newColumns);
        setConfiguration({ columns: newColumns });
      },
      [columns, setColumns, setConfiguration]
    );
    // Like `defaultColumns`, purposefully keeping the initial value only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const defaultVisibleColumns = useMemo(() => visibleColumnsProp ?? columns.map((c) => c.id), []);
    const [visibleColumns, setVisibleColumns] = useControllableState({
      value: visibleColumnsProp,
      onChange: onVisibleColumnsChange,
      defaultValue: configuration?.visibleColumns ?? defaultVisibleColumns,
    });
    const updateVisibleColumns = useCallback<typeof setVisibleColumns>(
      (setStateAction) => {
        const newVisibleColumns = applySetStateAction(setStateAction, visibleColumns);
        setVisibleColumns(newVisibleColumns);
        setConfiguration({ visibleColumns: newVisibleColumns });
      },
      [setConfiguration, setVisibleColumns, visibleColumns]
    );
    // Purposefully keeping the initial value only for reset
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const defaultSort = useMemo(() => sortProp ?? DEFAULT_SORT, []);
    const [sort, setSort] = useControllableState({
      value: sortProp,
      onChange: onSortChange,
      defaultValue: configuration?.sort ?? defaultSort,
    });
    const updateSort = useCallback<typeof setSort>(
      (setStateAction) => {
        const newSort = applySetStateAction(setStateAction, sort);
        setSort(newSort);
        setConfiguration({ sort: newSort });
      },
      [setConfiguration, setSort, sort]
    );
    const [expandedAlertIndex, setExpandedAlertIndex] = useControllableState({
      value: expandedAlertIndexProp,
      onChange: onExpandedAlertIndexChange,
      defaultValue: expandedAlertIndexProp ?? null,
    });
    const [pageSize, setPageSize] = useControllableState({
      value: pageSizeProp,
      onChange: onPageSizeChange,
      defaultValue: pageSizeProp ?? DEFAULT_ALERTS_PAGE_SIZE,
    });
    const defaultPageIndex = pageIndexProp ?? 0;
    const [pageIndex, setPageIndex] = useControllableState({
      value: pageIndexProp,
      onChange: onPageIndexChange,
      defaultValue:
        // If an alert is expanded, make sure to show its page on first load
        getExpandedAlertPage(expandedAlertIndex, pageSize, defaultPageIndex) ?? defaultPageIndex,
    });
    const updateExpandedAlertIndex = useCallback<typeof setExpandedAlertIndex>(
      (setStateAction) => {
        const newExpandedAlertIndex = applySetStateAction(setStateAction, expandedAlertIndex);
        // If the new expanded alert is outside the current page, update the page index
        const expandedAlertPage = getExpandedAlertPage(newExpandedAlertIndex, pageSize, pageIndex);
        if (expandedAlertPage != null) {
          setPageIndex(expandedAlertPage);
        }
        setExpandedAlertIndex(newExpandedAlertIndex);
      },
      [expandedAlertIndex, setExpandedAlertIndex, pageSize, pageIndex, setPageIndex]
    );

    const fieldsQuery = useFetchAlertsFieldsQuery(
      { http, ruleTypeIds },
      { enabled: !alertsFieldsProp, context: AlertsQueryContext }
    );
    const selectedAlertsFields = useMemo<BrowserFields>(
      () => alertsFieldsProp ?? fieldsQuery.data?.browserFields ?? {},
      [alertsFieldsProp, fieldsQuery.data?.browserFields]
    );

    const { columnsWithFieldsData, onToggleColumn, onColumnResize, onResetColumns, fields } =
      useColumns({
        columns,
        updateColumns,
        defaultColumns,
        visibleColumns,
        updateVisibleColumns,
        defaultVisibleColumns,
        alertsFields: selectedAlertsFields,
      });

    const [bulkActionsState, dispatchBulkAction] = useReducer(
      bulkActionsReducer,
      initialBulkActionsState
    );

    const bulkActionsStore = useMemo(
      () =>
        [bulkActionsState, dispatchBulkAction] as [
          typeof bulkActionsState,
          typeof dispatchBulkAction
        ],
      [bulkActionsState, dispatchBulkAction]
    );

    const queryParams = useAlertsTableQueryParams({
      ruleTypeIds,
      consumers,
      projectRouting,
      fields,
      query,
      sort,
      runtimeMappings,
      pageIndex,
      pageSize,
      minScore,
      trackScores,
      dispatchBulkAction,
      setPageIndex,
    });

    const {
      data: alertsData,
      refetch: refetchAlerts,
      isSuccess,
      isFetching: isLoadingAlerts,
    } = useSearchAlertsQuery({
      data,
      ...queryParams,
    });

    const {
      alerts = [],
      total: alertsCount = -1,
      querySnapshot: alertsQuerySnapshot,
      error: alertsError,
    } = alertsData ?? {};

    useEffect(() => {
      if (onLoaded && !isLoadingAlerts && isSuccess) {
        onLoaded({ alerts, columns, totalAlertsCount: alertsCount });
      }
    }, [alerts, columns, isLoadingAlerts, isSuccess, onLoaded, alertsCount]);

    const fieldWithSortingError = useMemo(
      () =>
        alertsError?.message?.toLowerCase()?.includes('sort')
          ? queryParams.sort.find((sortField) =>
              alertsError?.message?.includes(Object.keys(sortField)[0])
            )
          : undefined,
      [alertsError?.message, queryParams.sort]
    );

    const ruleIds = useMemo(() => getRuleIdsFromAlerts(alerts), [alerts]);
    const alertSnoozeStateQuery = useGetAlertSnoozeStateQuery(
      {
        ruleIds,
        http,
        notifications,
      },
      { enabled: isMutedAlertsEnabled }
    );

    const caseIds = useMemo(() => getCaseIdsFromAlerts(alerts), [alerts]);
    const casesPermissions = useMemo(() => {
      return casesService?.helpers.canUseCases(casesConfiguration?.owner ?? []);
    }, [casesConfiguration?.owner, casesService?.helpers]);
    const casesQuery = useBulkGetCasesQuery(
      { caseIds, http, notifications },
      {
        enabled: isCasesColumnEnabled(columns) && !!casesPermissions?.read,
      }
    );

    const maintenanceWindowIds = useMemo(() => getMaintenanceWindowIdsFromAlerts(alerts), [alerts]);
    const maintenanceWindowsQuery = useBulkGetMaintenanceWindowsQuery(
      { ids: maintenanceWindowIds, http, application, notifications, licensing },
      { enabled: isMaintenanceWindowColumnEnabled(columns), context: AlertsQueryContext }
    );

    const refresh = useCallback(() => {
      if (pageIndex !== 0) {
        // Refetch from the first page when refreshing
        setPageIndex(0);
      } else {
        refetchAlerts();
      }
      queryClient.invalidateQueries(queryKeys.casesBulkGet(caseIds));
      queryClient.invalidateQueries(alertsQueryKeys.getAlertSnoozeState(ruleIds));
      queryClient.invalidateQueries(queryKeys.maintenanceWindowsBulkGet(maintenanceWindowIds));
    }, [
      pageIndex,
      queryClient,
      caseIds,
      ruleIds,
      maintenanceWindowIds,
      setPageIndex,
      refetchAlerts,
    ]);

    useEffect(() => {
      if (lastReloadRequestTime) {
        refresh();
      }
      // Purposefully not including `refresh` to avoid refreshing when it changes
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastReloadRequestTime]);

    useImperativeHandle(ref, () => ({
      refresh,
      toggleColumn: onToggleColumn,
    }));

    const onDataGridSortChange = useCallback(
      (_sort: EuiDataGridSorting['columns']) => {
        const newSort = _sort
          .map((sortItem) => {
            return {
              [sortItem.id]: {
                order: sortItem.direction,
              },
            };
          })
          .filter((entry) => {
            const sortKey = Object.keys(entry)[0];
            return visibleColumns.includes(sortKey);
          });

        updateSort(newSort);
      },
      [updateSort, visibleColumns]
    );

    const handleReset = useCallback(() => {
      // allow to reset to previous sort state in case of sorting error
      if (fieldWithSortingError) {
        const newSort = sort.filter((sortField) => !deepEqual(sortField, fieldWithSortingError));
        updateSort(newSort);
      } else {
        // allow to reset to default state in case of any other error
        updateSort(defaultSort);
        onResetColumns();
      }
    }, [fieldWithSortingError, sort, updateSort, defaultSort, onResetColumns]);

    const CasesContext = useMemo(() => {
      return casesService?.ui.getCasesContext();
    }, [casesService?.ui]);

    const isCasesContextAvailable = casesService && CasesContext;

    const renderContext = useMemo(
      () =>
        ({
          ...additionalContext,
          columns: columnsWithFieldsData,
          tableId: id,
          dataGridRef,
          ruleTypeIds,
          consumers,
          query,
          sort,
          refresh,
          isLoading:
            isLoadingAlerts ||
            casesQuery.isFetching ||
            maintenanceWindowsQuery.isFetching ||
            alertSnoozeStateQuery.isFetching ||
            fieldsQuery.isFetching,
          isLoadingAlerts,
          alerts,
          alertsCount,

          browserFields: selectedAlertsFields,
          isLoadingCases: casesQuery.isFetching,
          cases: casesQuery.data,
          isLoadingMaintenanceWindows: maintenanceWindowsQuery.isFetching,
          maintenanceWindows: maintenanceWindowsQuery.data,
          isLoadingMutedAlerts: alertSnoozeStateQuery.isFetching,
          mutedAlerts: alertSnoozeStateQuery.data?.mutedAlerts,
          isLoadingSnoozedAlerts: alertSnoozeStateQuery.isFetching,
          snoozedAlerts: alertSnoozeStateQuery.data?.snoozedAlerts,
          pageIndex,
          onPageIndexChange: setPageIndex,
          pageSize,
          onPageSizeChange: setPageSize,
          showAlertStatusWithFlapping,
          bulkActionsStore,
          renderCellValue,
          renderCellPopover,
          renderActionsCell,
          getAlertFormatter,
          alertDetailsNavigation,
          openLinksInNewTab,
          services: memoizedServices,
          kibanaVersion,
          expandedAlertIndex,
          onExpandedAlertIndexChange: updateExpandedAlertIndex,
          renderExpandedAlertView,
          isMutedAlertsEnabled,
        } as RenderContext<AC>),
      [
        additionalContext,
        columnsWithFieldsData,
        id,
        ruleTypeIds,
        consumers,
        query,
        sort,
        refresh,
        isLoadingAlerts,
        casesQuery.isFetching,
        casesQuery.data,
        maintenanceWindowsQuery.isFetching,
        maintenanceWindowsQuery.data,
        alertSnoozeStateQuery.isFetching,
        alertSnoozeStateQuery.data,
        fieldsQuery.isFetching,
        alerts,
        alertsCount,
        selectedAlertsFields,
        pageIndex,
        setPageIndex,
        pageSize,
        setPageSize,
        showAlertStatusWithFlapping,
        bulkActionsStore,
        renderCellValue,
        renderCellPopover,
        renderActionsCell,
        getAlertFormatter,
        alertDetailsNavigation,
        openLinksInNewTab,
        memoizedServices,
        kibanaVersion,
        expandedAlertIndex,
        updateExpandedAlertIndex,
        renderExpandedAlertView,
        isMutedAlertsEnabled,
      ]
    );

    useEffect(() => {
      if (onUpdate) {
        onUpdate(renderContext);
      }
    }, [onUpdate, renderContext]);

    const additionalToolbarControls = useMemo(
      () =>
        AdditionalToolbarControlsComponent ? (
          <AdditionalToolbarControlsComponent {...renderContext} />
        ) : undefined,
      [AdditionalToolbarControlsComponent, renderContext]
    );

    const dataGridProps: AlertsDataGridProps<AC> = useMemo(
      () => ({
        ...publicDataGridProps,
        renderContext,
        columnVisibility: {
          visibleColumns,
          setVisibleColumns: updateVisibleColumns,
        },
        additionalToolbarControls,
        leadingControlColumns,
        trailingControlColumns,
        'data-test-subj': 'internalAlertsState',
        onToggleColumn,
        onResetColumns,
        onColumnResize,
        query,
        rowHeightsOptions,
        gridStyle,
        toolbarVisibility,
        shouldHighlightRow,
        dynamicRowHeight,
        ruleTypeIds,
        alertsQuerySnapshot,
        sort,
        onSortChange: onDataGridSortChange,
        showCsvExportButton,
      }),
      [
        publicDataGridProps,
        renderContext,
        visibleColumns,
        updateVisibleColumns,
        additionalToolbarControls,
        leadingControlColumns,
        trailingControlColumns,
        onToggleColumn,
        onResetColumns,
        onColumnResize,
        query,
        rowHeightsOptions,
        gridStyle,
        toolbarVisibility,
        shouldHighlightRow,
        dynamicRowHeight,
        ruleTypeIds,
        alertsQuerySnapshot,
        sort,
        onDataGridSortChange,
        showCsvExportButton,
      ]
    );

    return (
      <AlertsTableContextProvider value={renderContext}>
        {!isLoadingAlerts && alertsCount <= 0 && (
          <InspectButtonContainer>
            <EmptyState
              additionalToolbarControls={additionalToolbarControls}
              alertsQuerySnapshot={alertsQuerySnapshot}
              showInspectButton={showInspectButton}
              messageTitle={emptyState?.messageTitle}
              messageBody={emptyState?.messageBody}
              height={emptyState?.height}
              variant={emptyState?.variant}
              error={alertsError}
              fieldWithSortingError={fieldWithSortingError}
              onReset={handleReset}
            />
          </InspectButtonContainer>
        )}
        {(isLoadingAlerts || fieldsQuery.isLoading) && (
          <EuiProgress size="xs" color="accent" data-test-subj="internalAlertsPageLoading" />
        )}
        {alertsCount > 0 &&
          (isCasesContextAvailable ? (
            <CasesContext
              owner={casesConfiguration?.owner ?? []}
              permissions={casesPermissions}
              features={{
                alerts: { sync: casesConfiguration?.syncAlerts ?? false },
                observables: {
                  enabled: true,
                  autoExtract: casesConfiguration?.extractObservables ?? false,
                },
              }}
            >
              <AlertsDataGrid {...dataGridProps} />
            </CasesContext>
          ) : (
            <AlertsDataGrid {...dataGridProps} />
          ))}
      </AlertsTableContextProvider>
    );
  }
);

// Lazy loading helpers
// eslint-disable-next-line import/no-default-export
export { AlertsTable as default };
export type AlertsTable = typeof AlertsTable;
