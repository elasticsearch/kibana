/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { EuiCallOut } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ElasticRequestState } from '@kbn/unified-doc-viewer';
import { useEsDocSearch } from '@kbn/unified-doc-viewer-plugin/public';
import { getFieldValue } from '@kbn/discover-utils';
import { EVENT_KIND } from '@kbn/rule-data-utils';
import type { CellActionRenderer } from '../../shared/components/cell_actions';
import { useAlertsPrivileges } from '../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { FlyoutLoading } from '../../shared/components/flyout_loading';
import { FlyoutMissingAlertsPrivilege } from './components/flyout_missing_alerts_privilege';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import { PageScope } from '../../../data_view_manager/constants';
import { EventKind } from './constants/event_kinds';
import { DocumentFlyout } from '.';

const DATA_VIEW_ERROR = i18n.translate(
  'xpack.securitySolution.flyout.document.overviewWrapper.dataViewError',
  {
    defaultMessage: 'Unable to retrieve the data view for analyzer.',
  }
);

const DOCUMENT_NOT_FOUND = i18n.translate(
  'xpack.securitySolution.flyout.document.overviewWrapper.documentNotFound',
  {
    defaultMessage: 'Cannot find document. No documents match that ID.',
  }
);

const FETCH_ERROR = i18n.translate(
  'xpack.securitySolution.flyout.document.overviewWrapper.fetchError',
  {
    defaultMessage: 'Unable to fetch document details.',
  }
);

export interface DocumentFlyoutWrapperProps {
  /**
   * The ID of the document to display. This is required to fetch the document details.
   */
  documentId: string | undefined;
  /**
   * The name of the index that contains the document. This is required to fetch the document details.
   */
  indexName: string | undefined;
  /**
   * A function that renders cell actions for the overview tab.
   */
  renderCellActions: CellActionRenderer;
  /**
   * Callback invoked after alert mutations to refresh parent and current flyouts.
   */
  onAlertUpdated: () => void;
  /**
   * Per-source-instance UUID that identifies which pagination slice in
   * `flyoutPaginationStore` belongs to this flyout session. When provided,
   * the flyout header renders in-flyout pagination controls (prev/next).
   * Omitting it (e.g. when opened from the Analyzer graph) disables
   * pagination for that session.
   */
  paginationInstanceId?: string;
}

/**
 * Wrapper for the DocumentFlyout component that handles fetching the document
 * based on the provided document ID and index name, and manages loading and error states.
 * It is currently used in Analyzer when opening a document from the detail panel.
 */
export const DocumentFlyoutWrapper = memo(
  ({
    documentId,
    indexName,
    renderCellActions,
    onAlertUpdated,
    paginationInstanceId,
  }: DocumentFlyoutWrapperProps) => {
    const { dataView, status } = useDataView(PageScope.default);

    const isDataViewLoading = status === 'loading' || status === 'pristine';
    const isDataViewInvalid =
      status === 'error' || (status === 'ready' && !dataView.hasMatchedIndices());

    const shouldSkipSearch = useMemo(
      () => isDataViewLoading || isDataViewInvalid || !documentId || !indexName || !dataView,
      [dataView, documentId, indexName, isDataViewInvalid, isDataViewLoading]
    );

    const [requestState, hit, refetchDocument] = useEsDocSearch({
      id: documentId ?? '',
      index: indexName,
      dataView,
      skip: shouldSkipSearch,
    });

    const handleAlertUpdated = useCallback(() => {
      onAlertUpdated();
      refetchDocument();
    }, [onAlertUpdated, refetchDocument]);

    const isAlert = useMemo(
      () => hit && (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
      [hit]
    );

    const { hasAlertsRead, loading: isAlertsPrivilegesLoading } = useAlertsPrivileges();
    const missingAlertsPrivilege = isAlert && !isAlertsPrivilegesLoading && !hasAlertsRead;

    if (
      isDataViewLoading ||
      (isAlert && isAlertsPrivilegesLoading) ||
      requestState === ElasticRequestState.Loading
    ) {
      return <FlyoutLoading data-test-subj="document-overview-wrapper-loading" />;
    }

    if (missingAlertsPrivilege) {
      return <FlyoutMissingAlertsPrivilege />;
    }

    if (isDataViewInvalid) {
      return (
        <EuiCallOut
          announceOnMount
          color="danger"
          iconType="warning"
          title={DATA_VIEW_ERROR}
          data-test-subj="document-overview-wrapper-data-view-error"
        />
      );
    }

    if (requestState === ElasticRequestState.Found && hit) {
      return (
        <DocumentFlyout
          hit={hit}
          renderCellActions={renderCellActions}
          onAlertUpdated={handleAlertUpdated}
          paginationInstanceId={paginationInstanceId}
        />
      );
    }

    if (requestState === ElasticRequestState.NotFound) {
      return (
        <EuiCallOut
          announceOnMount
          color="danger"
          iconType="warning"
          title={DOCUMENT_NOT_FOUND}
          data-test-subj="document-overview-wrapper-not-found"
        />
      );
    }

    if (requestState === ElasticRequestState.Error) {
      return (
        <EuiCallOut
          announceOnMount
          color="danger"
          iconType="warning"
          title={FETCH_ERROR}
          data-test-subj="document-overview-fetch-error"
        />
      );
    }

    return null;
  }
);

DocumentFlyoutWrapper.displayName = 'DocumentFlyoutWrapper';
