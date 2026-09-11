/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiCallOut } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { CellActionRenderer } from '../../shared/components/cell_actions';
import { DocumentFlyoutWrapper } from '../main/document_flyout_wrapper';
import { FLYOUT_V2_PAGINATION_QUERY_ERROR_TEST_ID } from '../main/components/test_ids';
import { useFlyoutPagination } from './use_flyout_pagination';

const QUERY_ERROR = i18n.translate(
  'xpack.securitySolution.flyoutV2.document.pagination.queryError',
  {
    defaultMessage: 'Unable to fetch the requested document.',
  }
);

export interface PaginatedDocumentFlyoutProps {
  /**
   * Cell action renderer injected by the source that opened the flyout.
   */
  renderCellActions: CellActionRenderer;
  /**
   * Callback invoked after alert mutations, so the source (e.g. the alerts table) can refresh.
   */
  onAlertUpdated: () => void;
}

/**
 * Document flyout body for paginated sources (alerts table, Timeline).
 *
 * The pagination slice only carries the *identity* of the document at the current index; resolving
 * it is left to `DocumentFlyoutWrapper`, which fetches the whole document by `_id`/`_index` and
 * refetches it after a mutation. Keeping the source's row data out of the flyout matters for two
 * reasons: a table row only holds the fields backing its columns (so a row-derived document has an
 * empty `fields` entry and renders empty highlighted fields / Table tab), and a row's position is
 * not a stable identity (closing an alert drops it out of a table filtered on open alerts, which
 * would otherwise silently repoint the flyout at whichever document took its place).
 */
export const PaginatedDocumentFlyout = memo(
  ({ renderCellActions, onAlertUpdated }: PaginatedDocumentFlyoutProps) => {
    const {
      flyoutDocumentId,
      flyoutDocumentIndexName,
      isFlyoutDocumentLoading,
      hasFlyoutQueryError,
    } = useFlyoutPagination();

    if (hasFlyoutQueryError) {
      return (
        <EuiCallOut
          announceOnMount
          color="danger"
          iconType="warning"
          title={QUERY_ERROR}
          data-test-subj={FLYOUT_V2_PAGINATION_QUERY_ERROR_TEST_ID}
        />
      );
    }

    return (
      <DocumentFlyoutWrapper
        documentId={flyoutDocumentId ?? undefined}
        indexName={flyoutDocumentIndexName ?? undefined}
        renderCellActions={renderCellActions}
        onAlertUpdated={onAlertUpdated}
        isPaginationLoading={isFlyoutDocumentLoading}
      />
    );
  }
);

PaginatedDocumentFlyout.displayName = 'PaginatedDocumentFlyout';
