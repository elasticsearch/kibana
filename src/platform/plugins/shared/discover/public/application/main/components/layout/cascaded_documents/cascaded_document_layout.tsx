/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentRef } from 'react';
import React, { useMemo, useCallback, Fragment, useRef, useState, useEffect } from 'react';
import { useEuiTheme } from '@elastic/eui';
import {
  DataCascade,
  DataCascadeRow,
  DataCascadeRowCell,
  toRestorableState,
  type DataCascadeRowCellProps,
  type DataCascadeRestorableState,
} from '@kbn/shared-ux-document-data-cascade';
import type { UnifiedDataTableProps } from '@kbn/unified-data-table';
import { getESQLStatsQueryMeta } from '@kbn/esql-utils';
import { EsqlQuery } from '@elastic/esql';
import { type ESQLStatsQueryMeta } from '@kbn/esql-utils';
import { getStatsCommandToOperateOn } from '@kbn/esql-utils/src/utils/cascaded_documents_helpers/utils';
import type { DataTableRecord } from '@kbn/discover-utils';
import { throttle } from 'lodash';
import useLatest from 'react-use/lib/useLatest';
import {
  useEsqlDataCascadeRowHeaderComponents,
  useEsqlDataCascadeHeaderComponent,
  ESQLDataCascadeLeafCell,
  type ESQLDataGroupNode,
} from './blocks';
import { cascadedDocumentsStyles } from './cascaded_documents.styles';
import { useEsqlDataCascadeRowActionHelpers } from './blocks/use_row_header_components';
import { useDataCascadeRowExpansionHandlers, useGroupedCascadeData } from './hooks';
import { useCascadedDocumentsContext } from './cascaded_documents_provider';
import { useCascadedDocumentsTelemetry } from './telemetry';

export interface ESQLDataCascadeProps
  extends Pick<
    UnifiedDataTableProps,
    | 'rows'
    | 'columns'
    | 'dataGridDensityState'
    | 'showTimeCol'
    | 'dataView'
    | 'showKeyboardShortcuts'
    | 'externalCustomRenderers'
    | 'onUpdateDataGridDensity'
  > {
  togglePopover: ReturnType<typeof useEsqlDataCascadeRowActionHelpers>['togglePopover'];
  queryMeta: ESQLStatsQueryMeta;
}

type EsqlDataCascade = typeof DataCascade<ESQLDataGroupNode>;

const ESQLDataCascade = React.memo(
  ({ rows, columns, dataView, togglePopover, queryMeta, ...props }: ESQLDataCascadeProps) => {
    const {
      availableCascadeGroups,
      selectedCascadeGroups,
      esqlVariables,
      renderViewModeToggle,
      getDataCascadeUiState,
      setDataCascadeUiState,
      cascadeGroupingChangeHandler,
    } = useCascadedDocumentsContext();

    const { data: cascadeGroupData, columnTypes } = useGroupedCascadeData({
      selectedCascadeGroups,
      rows,
      queryMeta,
      esqlVariables,
    });

    const { trackCascadeOptOut } = useCascadedDocumentsTelemetry();

    const {
      onCascadeGroupNodeExpanded,
      onCascadeGroupNodeCollapsed,
      onCascadeLeafNodeExpanded,
      onCascadeLeafNodeCollapsed,
    } = useDataCascadeRowExpansionHandlers({ dataView });

    const cascadeGroupingChangeHandlerWithTracking = useCallback(
      (groups: string[]) => {
        if (groups.length === 0) {
          trackCascadeOptOut();
        }
        cascadeGroupingChangeHandler(groups);
      },
      [cascadeGroupingChangeHandler, trackCascadeOptOut]
    );

    const customTableHeading = useEsqlDataCascadeHeaderComponent({
      renderViewModeToggle,
      cascadeGroupingChangeHandler: cascadeGroupingChangeHandlerWithTracking,
    });

    const { rowActions, rowHeaderMeta, rowHeaderTitle } = useEsqlDataCascadeRowHeaderComponents(
      queryMeta,
      columns,
      togglePopover,
      columnTypes
    );

    const cascadeLeafRowRenderer = useCallback<
      DataCascadeRowCellProps<ESQLDataGroupNode, DataTableRecord>['children']
    >(
      ({ data: cellData, cellId, virtualizerController, rowIndex, nodePath, nodePathMap }) => (
        <ESQLDataCascadeLeafCell
          {...props}
          dataView={dataView}
          cellData={cellData!}
          cellId={cellId}
          virtualizerController={virtualizerController}
          rowIndex={rowIndex}
          nodePath={nodePath}
          nodePathMap={nodePathMap}
        />
      ),
      [dataView, props]
    );

    const dataCascadeUiState = useMemo<DataCascadeRestorableState | undefined>(
      () => getDataCascadeUiState(),
      [getDataCascadeUiState]
    );

    const latestSetDataCascadeUiState = useLatest(setDataCascadeUiState);
    const [dataCascadeRef, setDataCascadeRef] = useState<ComponentRef<EsqlDataCascade> | null>(
      null
    );

    useEffect(() => {
      const snapshotStore = dataCascadeRef?.getUISnapshotStore();

      if (!snapshotStore) {
        return;
      }

      const throttledHandler = throttle(() => {
        const snapshot = toRestorableState(snapshotStore.getSnapshot());
        latestSetDataCascadeUiState.current(snapshot);
      }, 150);

      const unsubscribeSnapshot = snapshotStore.subscribe(throttledHandler);

      return () => {
        // Flush any pending throttled invocation so the last scroll
        // position is persisted before the listener is removed.
        throttledHandler.flush();
        throttledHandler.cancel();
        unsubscribeSnapshot();
      };
    }, [dataCascadeRef, latestSetDataCascadeUiState]);

    return (
      <DataCascade<ESQLDataGroupNode>
        ref={setDataCascadeRef}
        size="s"
        overscan={2}
        data={cascadeGroupData}
        cascadeGroups={availableCascadeGroups}
        initialGroupColumn={selectedCascadeGroups}
        initialState={dataCascadeUiState}
        customTableHeader={customTableHeading}
      >
        <DataCascadeRow<ESQLDataGroupNode, DataTableRecord>
          rowHeaderTitleSlot={rowHeaderTitle}
          rowHeaderMetaSlots={rowHeaderMeta}
          rowHeaderActions={rowActions}
          onCascadeGroupNodeExpanded={onCascadeGroupNodeExpanded}
          onCascadeGroupNodeCollapsed={onCascadeGroupNodeCollapsed}
        >
          <DataCascadeRowCell
            onCascadeLeafNodeExpanded={onCascadeLeafNodeExpanded}
            onCascadeLeafNodeCollapsed={onCascadeLeafNodeCollapsed}
          >
            {cascadeLeafRowRenderer}
          </DataCascadeRowCell>
        </DataCascadeRow>
      </DataCascade>
    );
  }
);

export type CascadedDocumentsLayoutProps = Omit<
  ESQLDataCascadeProps,
  'togglePopover' | 'queryMeta'
>;

export const CascadedDocumentsLayout = React.memo(
  ({ dataView, ...props }: CascadedDocumentsLayoutProps) => {
    const { esqlQuery, esqlVariables, onUpdateESQLQuery, openInNewTab, setDataCascadeUiState } =
      useCascadedDocumentsContext();
    const { euiTheme } = useEuiTheme();
    const cascadeWrapperRef = useRef<HTMLDivElement | null>(null);
    const { trackCascadeOpenInNewTab } = useCascadedDocumentsTelemetry();

    const styles = useMemo(() => cascadedDocumentsStyles({ euiTheme }), [euiTheme]);

    const queryMeta = useMemo(() => {
      return getESQLStatsQueryMeta(esqlQuery.esql);
    }, [esqlQuery]);

    const statsCommandBeingOperatedOn = useMemo(() => {
      const parsedQuery = EsqlQuery.fromSrc(esqlQuery.esql);
      return getStatsCommandToOperateOn(parsedQuery);
    }, [esqlQuery]);

    const updateESQLQuery = useCallback(
      (...args: Parameters<typeof onUpdateESQLQuery>) => {
        onUpdateESQLQuery(...args);
        // reset data cascade ui state, on query change
        setDataCascadeUiState(undefined);
      },
      [onUpdateESQLQuery, setDataCascadeUiState]
    );

    const openInNewTabWithTracking = useCallback<typeof openInNewTab>(
      (...args) => {
        trackCascadeOpenInNewTab();
        return openInNewTab(...args);
      },
      [openInNewTab, trackCascadeOpenInNewTab]
    );

    const { renderRowActionPopover, togglePopover } = useEsqlDataCascadeRowActionHelpers({
      dataView,
      esqlVariables,
      editorQuery: esqlQuery,
      statsFieldSummary: statsCommandBeingOperatedOn?.grouping,
      updateESQLQuery,
      openInNewTab: openInNewTabWithTracking,
    });

    return (
      <div css={styles.wrapper} ref={cascadeWrapperRef}>
        <Fragment>{renderRowActionPopover(cascadeWrapperRef.current ?? undefined)}</Fragment>
        <ESQLDataCascade
          dataView={dataView}
          togglePopover={togglePopover}
          queryMeta={queryMeta}
          {...props}
        />
      </div>
    );
  }
);
