/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useContext, useState, useMemo, useEffect, useCallback } from 'react';
import _ from 'lodash';
import classNames from 'classnames';
import { i18n } from '@kbn/i18n';
import {
  UnifiedDataTable,
  DataLoadingState,
  DataGridDensity,
  useColumns,
  type UnifiedDataTableSettings,
  type UnifiedDataTableSettingsColumn,
  type CustomCellRenderer,
  type CustomGridColumnsConfiguration,
  type DataGridCellValueElementProps,
  type UnifiedDataTableRenderCustomToolbar,
} from '@kbn/unified-data-table';
import { CellActionsProvider } from '@kbn/cell-actions';
import {
  SHOW_MULTIFIELDS,
  SORT_DEFAULT_ORDER_SETTING,
  formatFieldValueText,
} from '@kbn/discover-utils';
import { type DataTableRecord } from '@kbn/discover-utils/types';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  type EuiDataGridCellValueElementProps,
  type EuiDataGridStyle,
  EuiProgress,
} from '@elastic/eui';
import { type AddFieldFilterHandler } from '@kbn/unified-field-list';
import { generateFilters } from '@kbn/data-plugin/public';
import { type DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';

import type { EntityStoreRecord } from '../../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import type { inputsModel } from '../../../../common/store';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { InspectButton } from '../../../../common/components/inspect';
import { useInvestigateInTimeline } from '../../../../common/hooks/timeline/use_investigate_in_timeline';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { EmptyComponent } from '../../../../common/lib/cell_actions/helpers';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import { useKibana } from '../../../../common/lib/kibana';
import {
  EntityPanelKeyByType,
  EntityPanelParamByType,
} from '../../../../flyout/entity_details/shared/constants';
import {
  EntitySourceValue,
  toEntitySourceArray,
} from '../../../../flyout/entity_details/shared/components/entity_source_value';

import type { CriticalityLevelWithUnassigned } from '../../../../../common/entity_analytics/asset_criticality/types';
import { AssetCriticalityBadge } from '../../asset_criticality';
import { LastUpdated } from '../last_updated';
import { EntityAlertsCell } from '../entity_alerts_cell';
import { RiskScoreCell } from './risk_score_cell';

import { AdditionalControls } from './additional_controls';
import { EntitiesEmptyState } from './empty_state';
import { DataViewContext, type EntitiesTableConfig } from '.';
import { getEntityFields } from './utils';
import { useStyles } from './hooks/use_styles';
import { useFetchGridData } from './hooks/use_fetch_grid_data';
import { useLeadingControlColumns } from './hooks/use_leading_control_columns';
import type { EntityURLStateResult } from './hooks/use_entity_url_state';
import {
  ENTITY_FIELDS,
  ENTITY_GROUPING_OPTIONS,
  DEFAULT_VISIBLE_ROWS_PER_PAGE,
  MAX_ENTITIES_TO_LOAD,
  TEST_SUBJ_DATA_GRID,
  TEST_SUBJ_GROUPING,
} from './constants';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';

interface DefaultColumn {
  id: string;
  width?: number;
}

const gridStyle: EuiDataGridStyle = {
  border: 'horizontal',
  cellPadding: 'l',
  stripes: false,
  header: 'underline',
};

const ROW_TYPE_LABEL = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entitiesTable.rowTypeLabel',
  { defaultMessage: 'entities' }
);

const INSPECT_TITLE = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entitiesTable.inspectTitle',
  { defaultMessage: 'Entity analytics table' }
);

const TARGET_ENTITY_TOOLTIP = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entitiesTable.targetEntityTooltip',
  { defaultMessage: 'Primary entity in the resolution group' }
);

const COLUMN_HEADERS: Record<string, string> = {
  [ENTITY_FIELDS.ENTITY_NAME]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.entitiesTable.columnEntityName',
    { defaultMessage: 'Entity name' }
  ),
  [ENTITY_FIELDS.ENTITY_ID]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.entitiesTable.columnEntityId',
    { defaultMessage: 'Entity ID' }
  ),
  [ENTITY_FIELDS.ENTITY_SOURCE]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.entitiesTable.columnDataSource',
    { defaultMessage: 'Data source' }
  ),
  [ENTITY_FIELDS.ENTITY_RISK]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.entitiesTable.columnRiskScore',
    { defaultMessage: 'Risk score' }
  ),
  [ENTITY_FIELDS.ASSET_CRITICALITY]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.entitiesTable.columnAssetCriticality',
    { defaultMessage: 'Asset criticality' }
  ),
  [ENTITY_FIELDS.RESOLVED_TO]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.entitiesTable.columnResolvedTo',
    { defaultMessage: 'Resolved to' }
  ),
  [ENTITY_FIELDS.ENTITY_TYPE]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.entitiesTable.columnEntityType',
    { defaultMessage: 'Entity type' }
  ),
  alerts: i18n.translate('xpack.securitySolution.entityAnalytics.entitiesTable.columnAlerts', {
    defaultMessage: 'Alerts',
  }),
  [ENTITY_FIELDS.TIMESTAMP]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.entitiesTable.columnLastSeen',
    { defaultMessage: 'Last seen' }
  ),
};

const DEFAULT_COLUMNS: DefaultColumn[] = [
  { id: ENTITY_FIELDS.ENTITY_NAME, width: 200 },
  { id: ENTITY_FIELDS.ENTITY_ID, width: 300 },
  { id: ENTITY_FIELDS.ENTITY_SOURCE, width: 216 },
  { id: ENTITY_FIELDS.RESOLVED_TO, width: 300 },
  { id: ENTITY_FIELDS.ENTITY_TYPE, width: 200 },
  { id: ENTITY_FIELDS.ENTITY_RISK, width: 200 },
  { id: ENTITY_FIELDS.ASSET_CRITICALITY, width: 200 },
  { id: 'alerts', width: 300 },
  { id: ENTITY_FIELDS.TIMESTAMP, width: 200 },
];

export interface EntitiesDataTableProps {
  state: EntityURLStateResult;
  height?: number;
  groupSelectorComponent?: JSX.Element;
  selectedGroup?: string;
  /**
   * Per-instance identifiers/localStorage keys. Required so each shared mount
   * (EA home page, case attachments accordion, …) declares its own and never
   * silently reuses another surface's keys.
   */
  config: EntitiesTableConfig;
}

export const EntitiesDataTable = ({
  state,
  height,
  groupSelectorComponent,
  selectedGroup,
  config,
}: EntitiesDataTableProps) => {
  const { tableId, columnsLocalStorageKey, columnsSettingsLocalStorageKey } = config;
  const {
    pageSize,
    sort,
    query,
    queryError,
    filters,
    getRowsFromPages,
    onChangeItemsPerPage,
    onResetFilters,
    onSort,
    setUrlQuery,
  } = state;

  const { openFlyout, closeFlyout } = useExpandableFlyoutApi();
  const { investigateInTimeline } = useInvestigateInTimeline();
  const {
    timelinePrivileges: { read: canUseTimeline },
    alertsPrivileges: {
      alerts: { read: canReadAlerts },
    },
  } = useUserPrivileges();
  const { hasIndexRead: canReadAlertsIndex } = useAlertsPrivileges();
  const { setQuery, deleteQuery } = useGlobalTime();

  const openTableFlyout = useCallback(
    (doc?: DataTableRecord | undefined) => {
      if (!doc) {
        closeFlyout();
        return;
      }

      const { entityType, entityName, entityId } = getEntityFields(doc);
      if (!entityType || !entityName) return;

      const panelKey = EntityPanelKeyByType[entityType];
      const panelParam = EntityPanelParamByType[entityType];
      if (!panelKey || !panelParam) return;

      openFlyout({
        right: {
          id: panelKey,
          params: {
            [panelParam]: entityName,
            entityId,
            contextID: tableId,
            scopeId: tableId,
          },
        },
      });
    },
    [openFlyout, closeFlyout, tableId]
  );

  const {
    data: rowsData,
    fetchNextPage: loadMore,
    isFetching: isFetchingGridData,
    isLoading: isLoadingGridData,
    refetch,
  } = useFetchGridData({
    query,
    sort,
    enabled: !queryError,
    pageSize: DEFAULT_VISIBLE_ROWS_PER_PAGE,
  });

  const rows = getRowsFromPages(rowsData?.pages);
  const totalHits = rowsData?.pages[0]?.total || 0;

  const inspectData = useMemo<inputsModel.InspectQuery | null>(
    () => (rowsData?.pages[0]?.inspect as inputsModel.InspectQuery) ?? null,
    [rowsData?.pages]
  );

  useEffect(() => {
    setQuery({
      id: tableId,
      inspect: inspectData,
      loading: isLoadingGridData,
      refetch,
    });
    return () => {
      deleteQuery({ id: tableId });
    };
  }, [setQuery, deleteQuery, inspectData, isLoadingGridData, refetch, tableId]);

  const [lastUpdatedAt, setLastUpdatedAt] = useState(Date.now());
  useEffect(() => {
    if (rowsData?.pages?.length && !isLoadingGridData) {
      setLastUpdatedAt(Date.now());
    }
  }, [rowsData?.pages, isLoadingGridData]);

  const [localStorageColumns, setLocalStorageColumns] = useLocalStorage(
    columnsLocalStorageKey,
    DEFAULT_COLUMNS.map((c) => c.id)
  );

  const [persistedSettings, setPersistedSettings] = useLocalStorage<UnifiedDataTableSettings>(
    columnsSettingsLocalStorageKey,
    {
      columns: DEFAULT_COLUMNS.reduce((columnSettings, column) => {
        const columnDefaultSettings = column.width ? { width: column.width } : {};
        const newColumn = { [column.id]: columnDefaultSettings };
        return { ...columnSettings, ...newColumn };
      }, {} as UnifiedDataTableSettings['columns']),
    }
  );

  const settings = useMemo(() => {
    return {
      columns: Object.keys(persistedSettings?.columns as UnifiedDataTableSettings).reduce(
        (columnSettings, columnId) => {
          const newColumn: UnifiedDataTableSettingsColumn = {
            ..._.pick(persistedSettings?.columns?.[columnId], ['width']),
            display: COLUMN_HEADERS[columnId],
          };

          return { ...columnSettings, [columnId]: newColumn };
        },
        {} as UnifiedDataTableSettings['columns']
      ),
    };
  }, [persistedSettings]);

  const { dataView, dataViewIsLoading } = useContext(DataViewContext);

  const customGridColumnsConfiguration = useMemo<CustomGridColumnsConfiguration>(() => {
    const columnsConfig: CustomGridColumnsConfiguration = {
      alerts: ({ column }) => ({ ...column, isExpandable: false }),
      [ENTITY_FIELDS.ENTITY_SOURCE]: ({ column }) => ({ ...column, isExpandable: false }),
    };
    if (dataView.timeFieldName) {
      columnsConfig[dataView.timeFieldName] = ({ column }) => ({ ...column, display: undefined });
    }
    return columnsConfig;
  }, [dataView.timeFieldName]);

  const {
    uiActions,
    uiSettings,
    dataViews,
    data,
    application: { capabilities },
    theme,
    fieldFormats,
    notifications,
    storage,
  } = useKibana().services;
  const { filterManager } = data.query;

  const services = {
    theme,
    fieldFormats,
    uiSettings,
    toastNotifications: notifications.toasts,
    storage,
    data,
  };

  const styles = useStyles();

  const columnsWithPrivileges = useMemo(
    () =>
      localStorageColumns?.filter((c) => c !== 'alerts' || (canReadAlerts && canReadAlertsIndex)),
    [localStorageColumns, canReadAlerts, canReadAlertsIndex]
  );

  const {
    columns: currentColumns,
    onSetColumns,
    onAddColumn,
    onRemoveColumn,
  } = useColumns({
    capabilities,
    defaultOrder: uiSettings.get(SORT_DEFAULT_ORDER_SETTING),
    dataView,
    dataViews,
    setAppState: (props) => setLocalStorageColumns(props.columns),
    columns: columnsWithPrivileges,
    sort,
  });

  const computeDataTableRendering = useMemo(() => {
    const isVirtualizationEnabled = pageSize >= 100;

    const getWrapperHeight = () => {
      if (height) return height;
      if (!isVirtualizationEnabled) return 'auto';

      const baseHeight = 362;
      return `calc(100vh - ${baseHeight}px)`;
    };

    return {
      wrapperHeight: getWrapperHeight(),
      mode: isVirtualizationEnabled ? 'virtualized' : 'standard',
    };
  }, [pageSize, height]);

  const onAddFilter: AddFieldFilterHandler | undefined = useMemo(
    () =>
      filterManager && dataView
        ? (clickedField, values, operation) => {
            const newFilters = generateFilters(
              filterManager,
              clickedField,
              values,
              operation,
              dataView
            );
            setUrlQuery({
              filters: [...filters, ...newFilters],
            });
          }
        : undefined,
    [dataView, filterManager, filters, setUrlQuery]
  );

  const onResize = (colSettings: { columnId: string; width: number | undefined }) => {
    const grid = persistedSettings || {};
    const newColumns = { ...(grid.columns || {}) };
    newColumns[colSettings.columnId] = colSettings.width
      ? { width: Math.round(colSettings.width) }
      : {};
    const newGrid = { ...grid, columns: newColumns };
    setPersistedSettings(newGrid);
  };

  const externalCustomRenderers = useMemo<CustomCellRenderer>(() => {
    const nullSafeRenderers: CustomCellRenderer = Object.fromEntries(
      currentColumns.map((columnId) => [
        columnId,
        ({ row, dataView: dv, fieldFormats: ff }: DataGridCellValueElementProps) => {
          const value = row.flattened[columnId];
          if (value === null || value === undefined) {
            return getEmptyTagValue();
          }
          const field = dv.fields.getByName(columnId);
          return <>{formatFieldValueText({ value, fieldFormats: ff, dataView: dv, field })}</>;
        },
      ])
    );

    const isResolutionGroup = selectedGroup === ENTITY_GROUPING_OPTIONS.RESOLUTION;

    const specificRenderers: CustomCellRenderer = {
      ...(isResolutionGroup
        ? {
            [ENTITY_FIELDS.ENTITY_NAME]: ({
              row,
              dataView: dv,
              fieldFormats: ff,
            }: DataGridCellValueElementProps) => {
              const value = row.flattened[ENTITY_FIELDS.ENTITY_NAME];
              if (value === null || value === undefined) {
                return getEmptyTagValue();
              }
              const resolvedTo = row.flattened[ENTITY_FIELDS.RESOLVED_TO];
              const isTarget = resolvedTo === null || resolvedTo === undefined;
              const field = dv.fields.getByName(ENTITY_FIELDS.ENTITY_NAME);
              const formattedValue = formatFieldValueText({
                value,
                fieldFormats: ff,
                dataView: dv,
                field,
              });

              if (isTarget) {
                return (
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>{formattedValue}</EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiIconTip
                        content={TARGET_ENTITY_TOOLTIP}
                        type="aggregate"
                        size="s"
                        data-test-subj="target-entity-icon"
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                );
              }

              return <>{formattedValue}</>;
            },
          }
        : {}),
      [ENTITY_FIELDS.ENTITY_TYPE]: ({ row }: DataGridCellValueElementProps) => {
        const value = row.flattened[ENTITY_FIELDS.ENTITY_TYPE] as string | undefined;
        if (value == null) return getEmptyTagValue();
        return <>{_.capitalize(value)}</>;
      },
      [ENTITY_FIELDS.ENTITY_SOURCE]: ({ row }: DataGridCellValueElementProps) => {
        const values = toEntitySourceArray(row.flattened[ENTITY_FIELDS.ENTITY_SOURCE]);
        if (values.length === 0) return getEmptyTagValue();
        return <EntitySourceValue values={values} textSize="xs" />;
      },
      [ENTITY_FIELDS.ASSET_CRITICALITY]: ({ row }: DataGridCellValueElementProps) => {
        const value = row.flattened[ENTITY_FIELDS.ASSET_CRITICALITY] as
          | CriticalityLevelWithUnassigned
          | undefined;
        if (value == null) return getEmptyTagValue();
        return <AssetCriticalityBadge criticalityLevel={value} />;
      },
      [ENTITY_FIELDS.ENTITY_RISK]: ({ row }: DataGridCellValueElementProps) => {
        const value = row.flattened[ENTITY_FIELDS.ENTITY_RISK] as number | undefined;
        return <RiskScoreCell riskScore={value != null ? Number(value) : undefined} />;
      },
      alerts: ({ rowIndex }: EuiDataGridCellValueElementProps) => {
        const doc = rows[rowIndex];
        if (!doc) return null;
        const { entityType, entityName } = getEntityFields(doc);
        if (!entityName || !entityType) return null;
        const entityRecord = doc?.raw?._source ? (doc.raw._source as EntityStoreRecord) : null;
        return (
          <EntityAlertsCell
            entityRecord={entityRecord}
            entityName={entityName}
            entityType={entityType}
          />
        );
      },
    };

    return {
      ...nullSafeRenderers,
      ...specificRenderers,
    };
  }, [rows, currentColumns, selectedGroup]);

  const leadingControlColumns = useLeadingControlColumns({
    canUseTimeline,
    investigateInTimeline,
    tableId,
  });

  const onResetColumns = () => {
    setLocalStorageColumns(DEFAULT_COLUMNS.map((c) => c.id));
  };

  const handleAddColumn = (columnId: string) => {
    onAddColumn(columnId);
  };

  const handleRemoveColumn = (columnId: string) => {
    onRemoveColumn(columnId);
  };

  const externalAdditionalControls = (
    <AdditionalControls
      total={totalHits}
      title={ROW_TYPE_LABEL}
      columns={currentColumns}
      onAddColumn={handleAddColumn}
      onRemoveColumn={handleRemoveColumn}
      onResetColumns={onResetColumns}
    />
  );

  const customRenderToolbar: UnifiedDataTableRenderCustomToolbar = useCallback(
    ({ toolbarProps, gridProps }) => {
      const {
        hasRoomForGridControls,
        columnControl,
        columnSortingControl,
        fullScreenControl,
        keyboardShortcutsControl,
        displayControl,
      } = toolbarProps;

      return (
        <EuiFlexGroup
          responsive={false}
          gutterSize="s"
          justifyContent="spaceBetween"
          alignItems="center"
          css={{ padding: '8px 0px 4px 0px' }}
          data-test-subj="entityAnalyticsTableToolbar"
        >
          <EuiFlexItem grow={false}>
            <EuiFlexGroup responsive={false} gutterSize="s" alignItems="center">
              {gridProps.additionalControls && (
                <EuiFlexItem grow={false}>{gridProps.additionalControls}</EuiFlexItem>
              )}
              {hasRoomForGridControls && columnControl && (
                <EuiFlexItem grow={false}>{columnControl}</EuiFlexItem>
              )}
              {hasRoomForGridControls && columnSortingControl && (
                <EuiFlexItem grow={false}>{columnSortingControl}</EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup responsive={false} gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                <InspectButton queryId={tableId} title={INSPECT_TITLE} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <LastUpdated updatedAt={lastUpdatedAt} />
              </EuiFlexItem>
              {groupSelectorComponent && (
                <EuiFlexItem grow={false} data-test-subj={TEST_SUBJ_GROUPING}>
                  {groupSelectorComponent}
                </EuiFlexItem>
              )}
              {gridProps.inTableSearchControl && (
                <EuiFlexItem grow={false}>{gridProps.inTableSearchControl}</EuiFlexItem>
              )}
              {hasRoomForGridControls && keyboardShortcutsControl && (
                <EuiFlexItem grow={false}>{keyboardShortcutsControl}</EuiFlexItem>
              )}
              {hasRoomForGridControls && displayControl && (
                <EuiFlexItem grow={false}>{displayControl}</EuiFlexItem>
              )}
              {hasRoomForGridControls && fullScreenControl && (
                <EuiFlexItem grow={false}>{fullScreenControl}</EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    },
    [lastUpdatedAt, groupSelectorComponent, tableId]
  );

  const loadingState = isLoadingGridData ? DataLoadingState.loading : DataLoadingState.loaded;

  return (
    <CellActionsProvider getTriggerCompatibleActions={uiActions.getTriggerCompatibleActions}>
      <div
        data-test-subj={TEST_SUBJ_DATA_GRID}
        className={classNames(styles.gridContainer, {
          [styles.gridContainerLoading]: isLoadingGridData,
        })}
        style={{
          height: computeDataTableRendering.wrapperHeight,
        }}
      >
        <EuiProgress
          size="xs"
          color="accent"
          css={{ opacity: isFetchingGridData ? 1 : 0 }}
          className={styles.gridProgressBar}
        />
        {dataViewIsLoading ? null : loadingState === DataLoadingState.loaded && totalHits === 0 ? (
          <EntitiesEmptyState onResetFilters={onResetFilters} />
        ) : (
          <UnifiedDataTable
            key={computeDataTableRendering.mode}
            className={styles.gridStyle}
            ariaLabelledBy={ROW_TYPE_LABEL}
            columns={currentColumns}
            dataView={dataView}
            loadingState={loadingState}
            onFilter={onAddFilter as DocViewFilterFn}
            onResize={onResize}
            onSetColumns={onSetColumns}
            onSort={onSort}
            rows={rows}
            sampleSizeState={MAX_ENTITIES_TO_LOAD}
            setExpandedDoc={openTableFlyout}
            renderDocumentView={EmptyComponent}
            sort={sort}
            rowsPerPageState={pageSize}
            totalHits={totalHits}
            services={services}
            onUpdateRowsPerPage={onChangeItemsPerPage}
            rowHeightState={0}
            showMultiFields={uiSettings.get(SHOW_MULTIFIELDS)}
            showTimeCol={false}
            settings={settings}
            onFetchMoreRecords={loadMore}
            externalCustomRenderers={externalCustomRenderers}
            externalAdditionalControls={externalAdditionalControls}
            renderCustomToolbar={customRenderToolbar}
            gridStyleOverride={gridStyle}
            rowLineHeightOverride="24px"
            dataGridDensityState={DataGridDensity.EXPANDED}
            rowAdditionalLeadingControls={leadingControlColumns}
            customGridColumnsConfiguration={customGridColumnsConfiguration}
          />
        )}
      </div>
    </CellActionsProvider>
  );
};
