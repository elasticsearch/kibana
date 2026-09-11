/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo } from 'react';
import { useEuiTheme, type EuiFlyoutMenuAction } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { AggregateQuery, Query, Filter } from '@kbn/es-query';
import type { SearchResponseWarning } from '@kbn/search-response-warnings';
import { MAX_DOC_FIELDS_DISPLAYED, SHOW_MULTIFIELDS } from '@kbn/discover-utils';
import {
  type DataTableColumnsMeta,
  type UnifiedDataTableProps,
  DataLoadingState as DiscoverGridLoadingState,
  getRenderCustomToolbarWithElements,
  getDataGridDensity,
  getRowHeight,
} from '@kbn/unified-data-table';
import type { DocViewerApi } from '@kbn/unified-doc-viewer';
import { DiscoverGrid } from '../../components/discover_grid';
import { DiscoverGridFlyout } from '../../components/discover_grid_flyout';
import { SavedSearchEmbeddableBase } from './saved_search_embeddable_base';
import { TotalDocuments } from '../../application/main/components/total_documents/total_documents';
import { useProfileAccessor } from '../../context_awareness';

export interface InlineEditing {
  isActive: boolean;
  hasPendingChanges: boolean;
  onApply: () => Promise<void>;
  onCancel: () => Promise<void>;
}

interface DiscoverGridEmbeddableProps extends Omit<UnifiedDataTableProps, 'sampleSizeState'> {
  sampleSizeState: number; // a required prop
  totalHitCount?: number;
  query: AggregateQuery | Query | undefined;
  filters: Filter[] | undefined;
  interceptedWarnings?: SearchResponseWarning[];
  onAddColumn: (column: string) => void;
  onRemoveColumn: (column: string) => void;
  savedSearchId?: string;
  enableDocumentViewer: boolean;
  inlineEditing: InlineEditing;
  expandedDoc: DataTableRecord | undefined;
  initialDocViewerTabId: string | undefined;
  docViewerRef: React.RefObject<DocViewerApi>;
  setExpandedDoc?: (doc: DataTableRecord | undefined, options?: { initialTabId?: string }) => void;
  flyoutMenuTrailingActions?: EuiFlyoutMenuAction[];
}

const noopSetExpandedDoc: NonNullable<UnifiedDataTableProps['setExpandedDoc']> = () => undefined;

export function DiscoverGridEmbeddable(props: DiscoverGridEmbeddableProps) {
  const {
    enableDocumentViewer,
    inlineEditing,
    interceptedWarnings,
    flyoutMenuTrailingActions,
    ...gridProps
  } = props;
  const { euiTheme } = useEuiTheme();
  const setExpandedDoc = props.setExpandedDoc ?? noopSetExpandedDoc;

  const renderDocumentView = useCallback(
    (
      hit: DataTableRecord,
      displayedRows: DataTableRecord[],
      displayedColumns: string[],
      columnsMeta?: DataTableColumnsMeta
    ) => (
      <DiscoverGridFlyout
        dataView={props.dataView}
        hit={hit}
        hits={displayedRows}
        // if default columns are used, dont make them part of the URL - the context state handling will take care to restore them
        columns={displayedColumns}
        columnsMeta={columnsMeta}
        savedSearchId={props.savedSearchId}
        onFilter={props.onFilter}
        onRemoveColumn={props.onRemoveColumn}
        onAddColumn={props.onAddColumn}
        onClose={() => setExpandedDoc(undefined)}
        setExpandedDoc={setExpandedDoc}
        initialTabId={props.initialDocViewerTabId}
        query={props.query}
        filters={props.filters}
        docViewerRef={props.docViewerRef}
        flyoutMenuTrailingActions={flyoutMenuTrailingActions}
        hideFilteringOnComputedColumns={true}
      />
    ),
    [
      setExpandedDoc,
      props.dataView,
      props.docViewerRef,
      props.filters,
      props.initialDocViewerTabId,
      props.onAddColumn,
      props.onFilter,
      props.onRemoveColumn,
      props.query,
      props.savedSearchId,
      flyoutMenuTrailingActions,
    ]
  );

  const renderCustomToolbarWithElements = useMemo(
    () =>
      getRenderCustomToolbarWithElements({
        leftSide:
          typeof props.totalHitCount === 'number' ? (
            <TotalDocuments totalHitCount={props.totalHitCount} isEsqlMode={props.isPlainRecord} />
          ) : undefined,
      }),
    [props.totalHitCount, props.isPlainRecord]
  );

  const getCellRenderersAccessor = useProfileAccessor('getCellRenderers');
  const cellRenderers = useMemo(() => {
    const getCellRenderers = getCellRenderersAccessor(() => ({}));
    return getCellRenderers({
      dataView: props.dataView,
      density:
        gridProps.dataGridDensityState ?? getDataGridDensity(props.services.storage, 'discover'),
      rowHeight: getRowHeight({
        storage: props.services.storage,
        consumer: 'discover',
        rowHeightState: gridProps.rowHeightState,
        configRowHeight: props.configRowHeight,
      }),
    });
  }, [
    getCellRenderersAccessor,
    props.dataView,
    props.services.storage,
    props.configRowHeight,
    gridProps.dataGridDensityState,
    gridProps.rowHeightState,
  ]);

  return (
    <SavedSearchEmbeddableBase
      totalHitCount={undefined} // it will be rendered inside the custom grid toolbar instead
      isLoading={props.loadingState === DiscoverGridLoadingState.loading}
      interceptedWarnings={interceptedWarnings}
      inlineEditing={inlineEditing}
    >
      <DiscoverGrid
        {...gridProps}
        isPaginationEnabled={!gridProps.isPlainRecord}
        totalHits={props.totalHitCount}
        setExpandedDoc={props.setExpandedDoc}
        expandedDoc={props.expandedDoc}
        showMultiFields={props.services.uiSettings.get(SHOW_MULTIFIELDS)}
        hideFilteringOnComputedColumns={true}
        maxDocFieldsDisplayed={props.services.uiSettings.get(MAX_DOC_FIELDS_DISPLAYED)}
        renderDocumentView={enableDocumentViewer ? renderDocumentView : undefined}
        renderCustomToolbar={renderCustomToolbarWithElements}
        externalCustomRenderers={cellRenderers}
        enableComparisonMode
        showColumnTokens
        showFullScreenButton={false}
        className="unifiedDataTable"
        css={{ '.unifiedDataTableToolbar': { paddingBlockStart: euiTheme.size.xs } }}
      />
    </SavedSearchEmbeddableBase>
  );
}
