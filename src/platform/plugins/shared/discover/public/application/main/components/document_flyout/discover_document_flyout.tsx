/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  EuiFlexGroup,
  EuiIcon,
  EuiLoadingSpinner,
  EuiText,
  type EuiFlyoutMenuAction,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import type { DocViewerApi, DocViewerRestorableState } from '@kbn/unified-doc-viewer';
import { getDisplayedColumns, getTextBasedColumnsMeta } from '@kbn/unified-data-table';
import type { DataTableColumnsMeta } from '@kbn/unified-data-table';
import {
  DiscoverGridFlyout,
  useShareDirectLinkAction,
} from '../../../../components/discover_grid_flyout';
import {
  DEFAULT_EXPANDED_DOC_OWNER,
  internalStateActions,
  useAppStateSelector,
  useCurrentTabAction,
  useCurrentTabDataStateContainer,
  useCurrentTabSelector,
  useInternalStateDispatch,
  useInternalStateSelector,
} from '../../state_management/redux';
import { useDataState } from '../../hooks/use_data_state';
import { ExpandedDocNotice, useExpandedDocSync } from './use_expanded_doc_sync';
import { useCopyExpandedDocLink } from './use_copy_expanded_doc_link';
import { getExpandedDocLinkability } from '../../utils/expanded_doc';

export interface DiscoverDocumentFlyoutProps {
  dataView: DataView;
  columns: string[];
  onAddColumn: (column: string) => void;
  onRemoveColumn: (column: string) => void;
  onAddFilter?: DocViewFilterFn;
}

/**
 * Renders the expanded document's flyout above the data grid,
 * so linked documents need not wait for the search to initialize.
 */
export const DiscoverDocumentFlyout = memo(
  ({
    dataView,
    columns,
    onAddColumn,
    onRemoveColumn,
    onAddFilter,
  }: DiscoverDocumentFlyoutProps) => {
    const dispatch = useInternalStateDispatch();
    const query = useAppStateSelector((state) => state.query);
    const persistedDiscoverSession = useInternalStateSelector(
      (state) => state.persistedDiscoverSession
    );
    const expandedDoc = useCurrentTabSelector((state) => state.expandedDoc);
    const expandedDocOwner = useCurrentTabSelector((state) => state.expandedDocOwner);
    const renderDocumentViewMeta = useCurrentTabSelector((state) => state.renderDocumentViewMeta);
    const initialDocViewerTabId = useCurrentTabSelector((state) => state.initialDocViewerTabId);
    const cascadedColumnsMeta = useCurrentTabSelector(
      (state) => state.cascadedDocumentsState.columnsMeta
    );

    const dataStateContainer = useCurrentTabDataStateContainer();
    const documentState = useDataState(dataStateContainer.data$.documents$);
    const rows = useMemo(() => documentState.result ?? [], [documentState.result]);

    const { hasExpandedDoc, requestState, notice, expandedDocRef } = useExpandedDocSync({
      dataView,
      rows,
      fetchStatus: documentState.fetchStatus,
    });
    const copyLink = useCopyExpandedDocLink({ dataView });
    const expandedDocLinkability = useMemo(
      () => getExpandedDocLinkability(query, expandedDoc),
      [query, expandedDoc]
    );
    const shareDirectLinkActions = useShareDirectLinkAction({
      copyLink,
      linkability: expandedDocLinkability,
    });
    const flyoutMenuTrailingActions = useMemo<EuiFlyoutMenuAction[] | undefined>(
      () =>
        expandedDoc && expandedDocOwner === DEFAULT_EXPANDED_DOC_OWNER
          ? shareDirectLinkActions
          : undefined,
      [expandedDoc, expandedDocOwner, shareDirectLinkActions]
    );

    const setExpandedDoc = useCurrentTabAction(internalStateActions.setExpandedDoc);
    const setExpandedDocForCurrentOwner = useCallback(
      (doc?: DataTableRecord) => {
        dispatch(
          setExpandedDoc({
            expandedDoc: doc,
            expandedDocOwner: doc ? expandedDocOwner ?? DEFAULT_EXPANDED_DOC_OWNER : undefined,
          })
        );
      },
      [dispatch, expandedDocOwner, setExpandedDoc]
    );

    const docViewerRef = useRef<DocViewerApi>(null);

    useEffect(() => {
      if (initialDocViewerTabId) {
        docViewerRef.current?.setSelectedTabId(initialDocViewerTabId);
      }
    }, [initialDocViewerTabId]);

    const docViewerUiState = useCurrentTabSelector((state) => state.uiState.docViewer);
    const setDocViewerUiState = useCurrentTabAction(internalStateActions.setDocViewerUiState);
    const onInitialDocViewerStateChange = useCallback(
      (newDocViewerUiState: Partial<DocViewerRestorableState>) => {
        dispatch(setDocViewerUiState({ docViewerUiState: newDocViewerUiState }));
      },
      [dispatch, setDocViewerUiState]
    );

    const setInitialDocViewerTabIdAction = useCurrentTabAction(
      internalStateActions.setInitialDocViewerTabId
    );
    const onUpdateSelectedTabId = useCallback(
      (tabId: string | undefined) => {
        dispatch(setInitialDocViewerTabIdAction({ initialDocViewerTabId: tabId }));
      },
      [dispatch, setInitialDocViewerTabIdAction]
    );

    const columnsMeta: DataTableColumnsMeta | undefined = useMemo(
      () =>
        documentState.esqlQueryColumns
          ? getTextBasedColumnsMeta(documentState.esqlQueryColumns)
          : undefined,
      [documentState.esqlQueryColumns]
    );

    const flyoutColumnsMeta = useMemo(() => {
      if (!expandedDocOwner || expandedDocOwner === DEFAULT_EXPANDED_DOC_OWNER) {
        return columnsMeta;
      }
      return cascadedColumnsMeta;
    }, [expandedDocOwner, columnsMeta, cascadedColumnsMeta]);

    // Derive columns for when a linked flyout opens before the grid exists.
    const displayedColumns = useMemo(
      () => getDisplayedColumns(columns, dataView),
      [columns, dataView]
    );

    if (!hasExpandedDoc) {
      return null;
    }

    return (
      <DiscoverGridFlyout
        dataView={dataView}
        hit={expandedDoc}
        requestState={requestState}
        requestStateMeta={expandedDocRef}
        notice={
          notice === ExpandedDocNotice.None ? undefined : <ExpandedDocNoticeText notice={notice} />
        }
        hits={renderDocumentViewMeta?.displayedRows}
        columns={renderDocumentViewMeta?.displayedColumns ?? displayedColumns}
        columnsMeta={flyoutColumnsMeta}
        savedSearchId={persistedDiscoverSession?.id}
        query={query}
        initialTabId={initialDocViewerTabId}
        onFilter={onAddFilter}
        onRemoveColumn={onRemoveColumn}
        onAddColumn={onAddColumn}
        onClose={() => setExpandedDocForCurrentOwner(undefined)}
        setExpandedDoc={setExpandedDocForCurrentOwner}
        flyoutMenuTrailingActions={flyoutMenuTrailingActions}
        docViewerRef={docViewerRef}
        onUpdateSelectedTabId={onUpdateSelectedTabId}
        initialDocViewerState={docViewerUiState}
        onInitialDocViewerStateChange={onInitialDocViewerStateChange}
      />
    );
  }
);

const ExpandedDocNoticeText = ({
  notice,
}: {
  notice: Exclude<ExpandedDocNotice, ExpandedDocNotice.None>;
}) => {
  const isSearching = notice === ExpandedDocNotice.SearchingResults;

  return (
    <EuiText size="xs" color="subdued" data-test-subj={`expandedDocNotice-${notice}`}>
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
        {isSearching ? (
          <EuiLoadingSpinner size="s" />
        ) : (
          <EuiIcon type="info" size="s" aria-hidden={true} />
        )}
        {isSearching ? (
          <FormattedMessage
            id="discover.docViews.flyout.searchingResultsDescription"
            defaultMessage="Searching current results"
          />
        ) : (
          <FormattedMessage
            id="discover.docViews.flyout.notInResultsDescription"
            defaultMessage="Not found in current results"
          />
        )}
      </EuiFlexGroup>
    </EuiText>
  );
};
