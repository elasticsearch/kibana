/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { KbnDangerCallout } from '@kbn/ui-callout';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ElasticRequestState } from '@kbn/unified-doc-viewer';
import { getFieldValue } from '@kbn/discover-utils';
import { EVENT_KIND } from '@kbn/rule-data-utils';
import type { CellActionRenderer } from '../../shared/components/cell_actions';
import { useAlertsPrivileges } from '../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { FlyoutLoading } from '../../shared/components/flyout_loading';
import { FlyoutMissingAlertsPrivilege } from './components/flyout_missing_alerts_privilege';
import { DocumentUnavailableCallout } from './components/document_unavailable_callout';
import { DataViewDegradedCallout } from '../../../data_view_manager/components/data_view_degraded_callout';
import { PageScope } from '../../../data_view_manager/constants';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import { useResolvedDocument } from './hooks/use_resolved_document';
import { EventKind } from './constants/event_kinds';
import { DocumentFlyout } from '.';

const DATA_VIEW_ERROR = i18n.translate(
  'xpack.securitySolution.flyout.document.overviewWrapper.dataViewError',
  {
    defaultMessage: 'Unable to retrieve the data view for analyzer.',
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
   * Optional test subject forwarded to the document flyout header without adding a layout wrapper.
   */
  dataTestSubj?: string;
  /**
   * `true` while in-flyout pagination is still resolving which document to show (e.g. it navigated
   * to a page the source hasn't loaded yet). Forwarded to `DocumentFlyout` so the previously
   * displayed document stays mounted behind a spinner instead of unmounting the whole flyout.
   */
  isPaginationLoading?: boolean;
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
    dataTestSubj,
    isPaginationLoading,
  }: DocumentFlyoutWrapperProps) => {
    const { dataView, status } = useDataView(PageScope.default);

    const isDataViewLoading = status === 'loading' || status === 'pristine';
    const isDataViewInvalid = status === 'error';
    const isDataViewDegraded = status === 'ready' && !dataView.hasMatchedIndices();

    const shouldSkipSearch = useMemo(
      () => isDataViewLoading || isDataViewInvalid || !documentId || !indexName || !dataView,
      [dataView, documentId, indexName, isDataViewInvalid, isDataViewLoading]
    );

    const { requestState, displayedHit, isResolving, isReloading, refetchDocument } =
      useResolvedDocument({
        documentId,
        indexName,
        dataView,
        skip: shouldSkipSearch,
      });

    const handleAlertUpdated = useCallback(() => {
      onAlertUpdated();
      refetchDocument();
    }, [onAlertUpdated, refetchDocument]);

    const isAlert = useMemo(
      () =>
        displayedHit && (getFieldValue(displayedHit, EVENT_KIND) as string) === EventKind.signal,
      [displayedHit]
    );

    const { hasAlertsRead, loading: isAlertsPrivilegesLoading } = useAlertsPrivileges();
    const missingAlertsPrivilege = isAlert && !isAlertsPrivilegesLoading && !hasAlertsRead;

    // Only drop to the bare loading state on a cold load. Once a document has been
    // resolved, `isReloading` keeps the flyout mounted and lets the body render its own
    // spinner, so paginating doesn't tear down the header.
    if (
      isDataViewLoading ||
      (isAlert && isAlertsPrivilegesLoading) ||
      (isResolving && !isReloading)
    ) {
      return <FlyoutLoading data-test-subj="document-overview-wrapper-loading" />;
    }

    if (missingAlertsPrivilege) {
      return <FlyoutMissingAlertsPrivilege />;
    }

    if (isDataViewInvalid) {
      return (
        <KbnDangerCallout
          announceOnMount
          title={DATA_VIEW_ERROR}
          data-test-subj="document-overview-wrapper-data-view-error"
        />
      );
    }

    if ((requestState === ElasticRequestState.Found || isReloading) && displayedHit) {
      return (
        <>
          {isDataViewDegraded && (
            <DataViewDegradedCallout
              compact
              dataView={dataView}
              data-test-subj="document-overview-wrapper-data-view-degraded"
            >
              <FormattedMessage
                id="xpack.securitySolution.flyout.document.overviewWrapper.dataViewDegradedDetailsDescription"
                defaultMessage="The document is still shown below, but field-dependent features may be limited."
              />
            </DataViewDegradedCallout>
          )}
          <DocumentFlyout
            hit={displayedHit}
            renderCellActions={renderCellActions}
            onAlertUpdated={handleAlertUpdated}
            dataTestSubj={dataTestSubj}
            isPaginationLoading={isPaginationLoading || isReloading}
          />
        </>
      );
    }

    const isDocumentUnavailable =
      requestState === ElasticRequestState.NotFound || requestState === ElasticRequestState.Error;

    if (isDocumentUnavailable) {
      // Paginating onto a document that no longer resolves (deleted, or moved out of its index)
      // must not take the whole panel down with it: keep the last document that did resolve
      // mounted so the header's pagination controls survive, and surface the failure in the body
      // instead. Without a previous document there is nothing to keep mounted, so the callout
      // stands alone.
      if (!displayedHit) {
        return <DocumentUnavailableCallout requestState={requestState} />;
      }

      return (
        <DocumentFlyout
          hit={displayedHit}
          renderCellActions={renderCellActions}
          onAlertUpdated={handleAlertUpdated}
          dataTestSubj={dataTestSubj}
          unavailableDocumentCallout={<DocumentUnavailableCallout requestState={requestState} />}
        />
      );
    }

    return null;
  }
);

DocumentFlyoutWrapper.displayName = 'DocumentFlyoutWrapper';
