/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { useFlyoutPagination } from '../../common/utils/flyout_pagination/use_flyout_pagination';
import { cellActionRenderer } from '../shared/components/cell_actions';
import { DocumentFlyoutWrapper } from './main/document_flyout_wrapper';

export interface PaginatedTimelineDocumentFlyoutProps {
  /**
   * Per-source-instance UUID minted by `TimelineDataTableComponent` at mount.
   * Used to read the current document ref from the per-slice
   * `flyoutPaginationStore` instead of the old singleton store.
   */
  paginationInstanceId: string;
  /**
   * Callback invoked after alert mutations to refresh the originating
   * timeline. Forwarded to `DocumentFlyoutWrapper` (which in turn drives
   * the V2 `Footer` and `Header` actions). Captured at the time the system
   * flyout is opened, so a stable `refetch` reference (e.g.
   * `inputsModel.Refetch`) is expected.
   */
  onAlertUpdated: () => void;
}

/**
 * Flyout V2 entry point used by the timeline data table when in-flyout
 * pagination is active. Reads the document currently shown in the flyout
 * from the per-slice `flyoutPaginationStore.flyoutDocumentRef` and renders
 * `<DocumentFlyoutWrapper>` against those `{ id, indexName }` coordinates.
 *
 * Mirrors `PaginatedDocumentFlyout` but consumes the generic
 * `flyoutDocumentRef` field rather than `flyoutAlert` — timeline events
 * are `TimelineItem`/`DataTableRecord`, not `Alert`, so they cannot be
 * pushed through the alerts-only `flyoutAlert` slot.
 *
 * `DocumentFlyoutWrapper` performs its own `useEsDocSearch`, so swapping
 * to an adjacent timeline row via the in-flyout `EuiPagination` (which
 * mutates `flyoutDocumentRef` through this table's
 * `openAlertFlyoutImpl`) re-renders this wrapper with new coordinates and
 * triggers a fresh fetch.
 */
export const PaginatedTimelineDocumentFlyout = memo(
  ({ paginationInstanceId, onAlertUpdated }: PaginatedTimelineDocumentFlyoutProps) => {
    const { flyoutDocumentRef } = useFlyoutPagination(paginationInstanceId);

    if (!flyoutDocumentRef) {
      return null;
    }

    return (
      <DocumentFlyoutWrapper
        documentId={flyoutDocumentRef.id}
        indexName={flyoutDocumentRef.indexName}
        renderCellActions={cellActionRenderer}
        onAlertUpdated={onAlertUpdated}
        paginationInstanceId={paginationInstanceId}
      />
    );
  }
);

PaginatedTimelineDocumentFlyout.displayName = 'PaginatedTimelineDocumentFlyout';
