/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type {
  UnifiedDataTableProps,
  UnifiedDataTableSettingsColumn,
} from '@kbn/unified-data-table';
import { DataLoadingState, UnifiedDataTable } from '@kbn/unified-data-table';
import type { DataView } from '@kbn/data-views-plugin/public';
import type {
  EuiDataGridControlColumn,
  EuiDataGridCustomBodyProps,
  EuiDataGridProps,
} from '@elastic/eui';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useHistory } from 'react-router-dom';
import { SECURITY_CELL_ACTIONS_DEFAULT } from '@kbn/ui-actions-plugin/common/trigger_ids';
import { documentFlyoutHistoryKey } from '../../../../../flyout_v2/shared/constants/flyout_history';
import { cellActionRenderer } from '../../../../../flyout_v2/shared/components/cell_actions';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import { JEST_ENVIRONMENT } from '../../../../../../common/constants';
import { useOnExpandableFlyoutClose } from '../../../../../flyout/shared/hooks/use_on_expandable_flyout_close';
import { DocumentDetailsRightPanelKey } from '../../../../../flyout/document_details/shared/constants/panel_keys';
import { AttackDetailsRightPanelKey } from '../../../../../flyout/attack_details/constants/panel_keys';
import { selectTimelineById } from '../../../../store/selectors';
import { RowRendererCount } from '../../../../../../common/api/timeline';
import { EmptyComponent } from '../../../../../common/lib/cell_actions/helpers';
import { StatefulEventContext } from '../../../../../common/components/events_viewer/stateful_event_context';
import type { TimelineItem } from '../../../../../../common/search_strategy';
import { useKibana } from '../../../../../common/lib/kibana';
import type {
  ColumnHeaderOptions,
  OnFetchMoreRecords,
  RowRenderer,
  TimelineTabs,
} from '../../../../../../common/types/timeline';
import type { inputsModel, State } from '../../../../../common/store';
import { getFormattedFields } from '../../body/renderers/formatted_field_udt';
import ToolbarAdditionalControls from './toolbar_additional_controls';
import {
  StyledEuiProgress,
  StyledTimelineUnifiedDataTable,
  UnifiedTimelineGlobalStyles,
} from '../styles';
import { timelineActions } from '../../../../store';
import { transformTimelineItemToUnifiedRows } from '../utils';
import { TimelineEventDetailRow } from './timeline_event_detail_row';
import { CustomTimelineDataGridBody } from './custom_timeline_data_grid_body';
import { TIMELINE_EVENT_DETAIL_ROW_ID } from '../../body/constants';
import { DocumentEventTypes } from '../../../../../common/lib/telemetry/types';
import { getTimelineRowTypeIndicator } from './get_row_indicator';
import { isAttackDiscoveryRow } from './is_attack_discovery_row';
import { DocumentFlyoutWrapper } from '../../../../../flyout_v2/document/main/document_flyout_wrapper';
import { AttackFlyoutWrapper } from '../../../../../flyout_v2/attack/main/attack_flyout_wrapper';
import { flyoutProviders } from '../../../../../flyout_v2/shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../../../../flyout_v2/shared/hooks/use_default_flyout_properties';

const DataGridMemoized = React.memo(UnifiedDataTable);

type CommonDataTableProps = {
  columns: ColumnHeaderOptions[];
  columnIds: string[];
  rowRenderers: RowRenderer[];
  timelineId: string;
  itemsPerPage: number;
  itemsPerPageOptions: number[];
  events: TimelineItem[];
  refetch: inputsModel.Refetch;
  onFieldEdited: () => void;
  totalCount: number;
  onFetchMoreRecords: OnFetchMoreRecords;
  activeTab: TimelineTabs;
  dataLoadingState: DataLoadingState;
  updatedAt: number;
  isTextBasedQuery?: boolean;
  leadingControlColumns: EuiDataGridProps['leadingControlColumns'];
} & Pick<
  UnifiedDataTableProps,
  | 'onSort'
  | 'onSetColumns'
  | 'sort'
  | 'onFilter'
  | 'renderCustomGridBody'
  | 'trailingControlColumns'
  | 'isSortEnabled'
  | 'onUpdatePageIndex'
>;

interface DataTableProps extends CommonDataTableProps {
  dataView: DataView;
}

export const TimelineDataTableComponent: React.FC<DataTableProps> = memo(
  function TimelineDataTableMemo({
    columns,
    columnIds,
    dataView,
    activeTab,
    timelineId,
    itemsPerPage,
    itemsPerPageOptions,
    rowRenderers,
    sort,
    events,
    isSortEnabled = true,
    onFieldEdited,
    refetch,
    dataLoadingState,
    totalCount,
    onFetchMoreRecords,
    updatedAt,
    isTextBasedQuery = false,
    onSetColumns,
    onSort,
    onFilter,
    leadingControlColumns,
    onUpdatePageIndex,
  }) {
    const newFlyoutSystemEnabled = useIsExperimentalFeatureEnabled('newFlyoutSystemEnabled');
    const dispatch = useDispatch();
    const store = useStore();
    const history = useHistory();
    const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();

    // Store context in state rather than creating object in provider value={} to prevent re-renders caused by a new object being created
    const [activeStatefulEventContext] = useState({
      timelineID: timelineId,
      enableHostDetailsFlyout: true,
      enableIpDetailsFlyout: true,
      tabType: activeTab,
    });

    const { services } = useKibana();
    const {
      uiSettings,
      fieldFormats,
      storage,
      dataViewFieldEditor,
      notifications: { toasts: toastsService },
      telemetry,
      theme,
      data: dataPluginContract,
      overlays,
    } = services;

    const [expandedDoc, setExpandedDoc] = useState<DataTableRecord & TimelineItem>();

    const onCloseExpandableFlyout = useCallback((id: string) => {
      setExpandedDoc((prev) => (!prev ? prev : undefined));
    }, []);

    const { closeFlyout, openFlyout } = useExpandableFlyoutApi();

    useOnExpandableFlyoutClose({ callback: onCloseExpandableFlyout });

    const showTimeCol = useMemo(() => !!dataView && !!dataView.timeFieldName, [dataView]);

    const {
      rowHeight,
      sampleSize,
      excludedRowRendererIds,
      columns: timelineColumns,
    } = useSelector((state: State) => selectTimelineById(state, timelineId));

    const settings: UnifiedDataTableProps['settings'] = useMemo(() => {
      const _columns: Record<string, UnifiedDataTableSettingsColumn> = {};
      timelineColumns.forEach((timelineColumn) => {
        _columns[timelineColumn.id] = {
          width: timelineColumn.initialWidth ?? undefined,
        };
      });
      return {
        columns: _columns,
      };
    }, [timelineColumns]);

    const { tableRows, tableStylesOverride } = useMemo(
      () => transformTimelineItemToUnifiedRows({ events, dataView }),
      [events, dataView]
    );

    const handleOnEventDetailPanelOpened = useCallback(
      (eventData: DataTableRecord & TimelineItem) => {
        if (newFlyoutSystemEnabled) {
          const isAttackRow = isAttackDiscoveryRow(eventData);
          overlays.openSystemFlyout(
            flyoutProviders({
              services,
              store,
              history,
              children: isAttackRow ? (
                <AttackFlyoutWrapper
                  attackId={eventData._id}
                  indexName={eventData.ecs._index ?? ''}
                  onAttackUpdated={refetch}
                />
              ) : (
                <DocumentFlyoutWrapper
                  documentId={eventData._id}
                  indexName={eventData.ecs._index}
                  renderCellActions={cellActionRenderer}
                  onAlertUpdated={refetch}
                />
              ),
            }),
            {
              ...defaultFlyoutProperties,
              historyKey: documentFlyoutHistoryKey,
              session: 'start',
            }
          );
        } else {
          const isAttackRow = isAttackDiscoveryRow(eventData);
          const indexName = eventData.ecs._index ?? '';
          const rightPanel = isAttackRow
            ? {
                id: AttackDetailsRightPanelKey,
                params: {
                  attackId: eventData._id,
                  indexName,
                },
              }
            : {
                id: DocumentDetailsRightPanelKey,
                params: {
                  id: eventData._id,
                  indexName,
                  scopeId: timelineId,
                },
              };
          openFlyout({
            right: rightPanel,
          });
          telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutOpened, {
            location: timelineId,
            panel: 'right',
          });
        }
      },
      [
        defaultFlyoutProperties,
        newFlyoutSystemEnabled,
        overlays,
        services,
        store,
        history,
        timelineId,
        refetch,
        openFlyout,
        telemetry,
      ]
    );

    const onSetExpandedDoc = useCallback(
      (newDoc?: DataTableRecord) => {
        if (newDoc) {
          const timelineDoc = tableRows.find((r) => r.id === newDoc.id);
          setExpandedDoc(timelineDoc);
          if (timelineDoc) {
            handleOnEventDetailPanelOpened(timelineDoc);
          }
        } else {
          closeFlyout();
          setExpandedDoc(undefined);
        }
      },
      [tableRows, handleOnEventDetailPanelOpened, closeFlyout]
    );

    const onResizeDataGrid = useCallback<NonNullable<UnifiedDataTableProps['onResize']>>(
      (colSettings) => {
        if (colSettings.width) {
          dispatch(
            timelineActions.updateColumnWidth({
              columnId: colSettings.columnId,
              id: timelineId,
              width: Math.round(colSettings.width),
            })
          );
        }
      },
      [dispatch, timelineId]
    );

    const onChangeItemsPerPage = useCallback<
      NonNullable<UnifiedDataTableProps['onUpdateRowsPerPage']>
    >(
      (itemsChangedPerPage) => {
        dispatch(
          timelineActions.updateItemsPerPage({ id: timelineId, itemsPerPage: itemsChangedPerPage })
        );
      },
      [dispatch, timelineId]
    );

    const customColumnRenderers = useMemo(
      () =>
        getFormattedFields({
          dataTableRows: tableRows,
          scopeId: 'timeline',
          headers: columns,
        }),
      [columns, tableRows]
    );

    const handleFetchMoreRecords = useCallback(() => {
      onFetchMoreRecords();
    }, [onFetchMoreRecords]);

    const additionalControls = useMemo(
      () => <ToolbarAdditionalControls timelineId={timelineId} updatedAt={updatedAt} />,
      [timelineId, updatedAt]
    );

    const cellActionsMetadata = useMemo(() => ({ scopeId: timelineId }), [timelineId]);

    const onUpdateSampleSize = useCallback(
      (newSampleSize: number) => {
        if (newSampleSize !== sampleSize) {
          dispatch(timelineActions.updateSampleSize({ id: timelineId, sampleSize: newSampleSize }));
        }
      },
      [dispatch, sampleSize, timelineId]
    );

    const onUpdateRowHeight = useCallback(
      (newRowHeight: number) => {
        if (newRowHeight !== rowHeight) {
          dispatch(timelineActions.updateRowHeight({ id: timelineId, rowHeight: newRowHeight }));
        }
      },
      [dispatch, rowHeight, timelineId]
    );

    const dataGridServices = useMemo(() => {
      return {
        theme,
        fieldFormats,
        storage,
        toastNotifications: toastsService,
        uiSettings,
        dataViewFieldEditor,
        data: dataPluginContract,
      };
    }, [
      theme,
      fieldFormats,
      storage,
      toastsService,
      uiSettings,
      dataViewFieldEditor,
      dataPluginContract,
    ]);

    const enabledRowRenderers = useMemo(() => {
      if (excludedRowRendererIds && excludedRowRendererIds.length === RowRendererCount) return [];

      if (!excludedRowRendererIds) return rowRenderers;

      return rowRenderers.filter((rowRenderer) => !excludedRowRendererIds.includes(rowRenderer.id));
    }, [excludedRowRendererIds, rowRenderers]);

    const TimelineEventDetailRowRendererComp = useMemo<EuiDataGridControlColumn['rowCellRender']>(
      () =>
        function TimelineEventDetailRowRenderer(props) {
          const { rowIndex, ...restProps } = props;
          return (
            <TimelineEventDetailRow
              event={tableRows[rowIndex]}
              rowIndex={rowIndex}
              timelineId={timelineId}
              enabledRowRenderers={enabledRowRenderers}
              {...restProps}
            />
          );
        },
      [tableRows, timelineId, enabledRowRenderers]
    );

    /**
     * Ref: https://eui.elastic.co/#/tabular-content/data-grid-advanced#custom-body-renderer
     */
    const trailingControlColumns: EuiDataGridProps['trailingControlColumns'] = useMemo(
      () => [
        {
          id: TIMELINE_EVENT_DETAIL_ROW_ID,
          width: 0,
          // The header cell should be visually hidden, but available to screen readers
          headerCellRender: () => <></>,
          headerCellProps: { className: 'euiScreenReaderOnly' },

          // The footer cell can be hidden to both visual & SR users, as it does not contain meaningful information
          footerCellProps: { style: { display: 'none' } },

          rowCellRender: JEST_ENVIRONMENT
            ? TimelineEventDetailRowRendererComp
            : React.memo(TimelineEventDetailRowRendererComp),
        },
      ],
      [TimelineEventDetailRowRendererComp]
    );

    /**
     * Ref: https://eui.elastic.co/#/tabular-content/data-grid-advanced#custom-body-renderer
     */
    const renderCustomBodyCallback = useCallback(
      ({
        Cell,
        visibleRowData,
        visibleColumns,
        setCustomGridBodyProps,
        gridWidth,
        headerRow,
        footerRow,
      }: EuiDataGridCustomBodyProps) => (
        <CustomTimelineDataGridBody
          rows={tableRows}
          Cell={Cell}
          visibleColumns={visibleColumns}
          visibleRowData={visibleRowData}
          headerRow={headerRow}
          footerRow={footerRow}
          setCustomGridBodyProps={setCustomGridBodyProps}
          enabledRowRenderers={enabledRowRenderers}
          rowHeight={rowHeight}
          gridWidth={gridWidth}
          refetch={refetch}
        />
      ),
      [tableRows, enabledRowRenderers, rowHeight, refetch]
    );

    const finalRenderCustomBodyCallback = useMemo(() => {
      return enabledRowRenderers.length > 0 ? renderCustomBodyCallback : undefined;
    }, [enabledRowRenderers.length, renderCustomBodyCallback]);

    const finalTrailControlColumns = useMemo(() => {
      return enabledRowRenderers.length > 0 ? trailingControlColumns : undefined;
    }, [enabledRowRenderers.length, trailingControlColumns]);

    return (
      <StatefulEventContext.Provider value={activeStatefulEventContext}>
        <StyledTimelineUnifiedDataTable>
          {(dataLoadingState === DataLoadingState.loading ||
            dataLoadingState === DataLoadingState.loadingMore) && (
            <StyledEuiProgress data-test-subj="discoverDataGridUpdating" size="xs" color="accent" />
          )}
          <UnifiedTimelineGlobalStyles />
          <DataGridMemoized
            ariaLabelledBy="timelineDocumentsAriaLabel"
            className="udtTimeline"
            columns={columnIds}
            expandedDoc={expandedDoc}
            gridStyleOverride={tableStylesOverride}
            dataView={dataView}
            showColumnTokens={true}
            loadingState={dataLoadingState}
            onFilter={onFilter}
            onResize={onResizeDataGrid}
            onSetColumns={onSetColumns}
            onSort={!isTextBasedQuery ? onSort : undefined}
            rows={tableRows}
            sampleSizeState={sampleSize || 500}
            onUpdateSampleSize={onUpdateSampleSize}
            setExpandedDoc={onSetExpandedDoc}
            showTimeCol={showTimeCol}
            isSortEnabled={isSortEnabled}
            sort={sort}
            rowHeightState={rowHeight}
            isPlainRecord={isTextBasedQuery}
            rowsPerPageState={itemsPerPage}
            onUpdateRowsPerPage={onChangeItemsPerPage}
            onUpdateRowHeight={onUpdateRowHeight}
            onFieldEdited={onFieldEdited}
            cellActionsTriggerId={SECURITY_CELL_ACTIONS_DEFAULT}
            services={dataGridServices}
            visibleCellActions={3}
            externalCustomRenderers={customColumnRenderers}
            renderDocumentView={EmptyComponent}
            rowsPerPageOptions={itemsPerPageOptions}
            showFullScreenButton={false}
            maxDocFieldsDisplayed={50}
            consumer="timeline"
            totalHits={totalCount}
            onFetchMoreRecords={handleFetchMoreRecords}
            configRowHeight={3}
            showMultiFields={true}
            cellActionsMetadata={cellActionsMetadata}
            externalAdditionalControls={additionalControls}
            renderCustomGridBody={finalRenderCustomBodyCallback}
            trailingControlColumns={finalTrailControlColumns}
            externalControlColumns={leadingControlColumns}
            onUpdatePageIndex={onUpdatePageIndex}
            getRowIndicator={getTimelineRowTypeIndicator}
            settings={settings}
          />
        </StyledTimelineUnifiedDataTable>
      </StatefulEventContext.Provider>
    );
  }
);

export const TimelineDataTable = React.memo(TimelineDataTableComponent);

// eslint-disable-next-line import/no-default-export
export { TimelineDataTable as default };
