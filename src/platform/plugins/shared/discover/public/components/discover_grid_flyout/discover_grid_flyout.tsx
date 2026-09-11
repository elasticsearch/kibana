/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo } from 'react';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { AggregateQuery, Filter, Query } from '@kbn/es-query';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import type { DataTableColumnsMeta } from '@kbn/unified-data-table';
import type { DocViewerProps, DocViewsRegistry } from '@kbn/unified-doc-viewer';
import { DiscoverFlyouts, dismissAllFlyoutsExceptFor } from '@kbn/discover-utils';
import type { UnifiedDocViewerFlyoutProps } from '@kbn/unified-doc-viewer-plugin/public';
import { UnifiedDocViewerFlyout } from '@kbn/unified-doc-viewer-plugin/public';
import { useDiscoverServices } from '../../hooks/use_discover_services';
import { useFlyoutActions } from './use_flyout_actions';
import { DiscoverGridFlyoutActions } from './discover_grid_flyout_actions';
import { DocumentType, useProfileAccessor } from '../../context_awareness';
import { recordHasContext } from '../../context_awareness/profiles_manager/record_has_context';

export const FLYOUT_WIDTH_KEY = 'discover:flyoutWidth';

export interface DiscoverGridFlyoutProps
  extends Pick<
    UnifiedDocViewerFlyoutProps,
    | 'initialDocViewerState'
    | 'onInitialDocViewerStateChange'
    | 'onUpdateSelectedTabId'
    | 'requestState'
    | 'requestStateMeta'
    | 'notice'
    | 'flyoutMenuTrailingActions'
    | 'flyoutType'
  > {
  savedSearchId?: string;
  filters?: Filter[];
  query?: Query | AggregateQuery;
  columns: string[];
  columnsMeta?: DataTableColumnsMeta;
  hit?: DataTableRecord;
  hits?: DataTableRecord[];
  dataView: DataView;
  initialTabId?: string;
  docViewerRef?: DocViewerProps['ref'];
  onAddColumn: (column: string) => void;
  onClose: () => void;
  onFilter?: DocViewFilterFn;
  onRemoveColumn: (column: string) => void;
  setExpandedDoc: (
    doc?: DataTableRecord,
    options?: { initialTabId?: string; initialTabState?: object }
  ) => void;
  hideFilteringOnComputedColumns?: boolean;
}

const getOriginDocType = (record: DataTableRecord | undefined): DocumentType =>
  recordHasContext(record) ? record.context.type : DocumentType.Default;

/**
 * Flyout displaying an expanded Elasticsearch document
 */
export function DiscoverGridFlyout({
  hit,
  hits,
  dataView,
  columns,
  columnsMeta,
  savedSearchId,
  filters,
  query,
  initialTabId,
  docViewerRef,
  onFilter,
  onClose,
  onRemoveColumn,
  onAddColumn,
  setExpandedDoc,
  initialDocViewerState,
  onInitialDocViewerStateChange,
  onUpdateSelectedTabId,
  hideFilteringOnComputedColumns,
  requestState,
  requestStateMeta,
  notice,
  flyoutMenuTrailingActions,
  flyoutType,
}: DiscoverGridFlyoutProps) {
  const services = useDiscoverServices();
  const isEsqlQuery = isOfAggregateQueryType(query);
  // Get actual hit with updated highlighted searches
  const actualHit = useMemo(() => hits?.find(({ id }) => id === hit?.id) || hit, [hit, hits]);

  const { flyoutActions } = useFlyoutActions({
    dataView,
    rowIndex: actualHit?.raw._index,
    rowId: actualHit?.raw._id,
    columns,
    filters,
    savedSearchId,
  });

  const getDocViewerAccessor = useProfileAccessor('getDocViewer', {
    record: actualHit,
  });
  const docViewer = useMemo(() => {
    const getDocViewer = getDocViewerAccessor(() => ({
      title: undefined,
      docViewsRegistry: (registry: DocViewsRegistry) => registry,
    }));

    // Document profiles cannot resolve a doc viewer until the record is available.
    return actualHit ? getDocViewer({ record: actualHit }) : undefined;
  }, [actualHit, getDocViewerAccessor]);

  useEffect(() => {
    dismissAllFlyoutsExceptFor(DiscoverFlyouts.docViewer);
  }, []);

  const originDocType = useMemo(() => getOriginDocType(actualHit), [actualHit]);

  return (
    <UnifiedDocViewerFlyout
      originDocType={originDocType}
      flyoutTitle={docViewer?.title}
      flyoutActions={
        !isEsqlQuery && actualHit && flyoutActions.length > 0 ? (
          <DiscoverGridFlyoutActions flyoutActions={flyoutActions} />
        ) : null
      }
      flyoutMenuTrailingActions={flyoutMenuTrailingActions}
      flyoutWidthLocalStorageKey={FLYOUT_WIDTH_KEY}
      flyoutType={flyoutType}
      services={services}
      docViewsRegistry={docViewer?.docViewsRegistry}
      renderCustomHeader={docViewer?.renderHeader}
      renderCustomFooter={docViewer?.renderFooter}
      isEsqlQuery={isEsqlQuery}
      hit={hit}
      requestState={requestState}
      requestStateMeta={requestStateMeta}
      notice={notice}
      hits={hits}
      dataView={dataView}
      columns={columns}
      columnsMeta={columnsMeta}
      onAddColumn={onAddColumn}
      onRemoveColumn={onRemoveColumn}
      onClose={onClose}
      onFilter={onFilter}
      setExpandedDoc={setExpandedDoc}
      initialTabId={initialTabId}
      docViewerRef={docViewerRef}
      initialDocViewerState={initialDocViewerState}
      onInitialDocViewerStateChange={onInitialDocViewerStateChange}
      onUpdateSelectedTabId={onUpdateSelectedTabId}
      hideFilteringOnComputedColumns={hideFilteringOnComputedColumns}
    />
  );
}

// eslint-disable-next-line import/no-default-export
export default DiscoverGridFlyout;
