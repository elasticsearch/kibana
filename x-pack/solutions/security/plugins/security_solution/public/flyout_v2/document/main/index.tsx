/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { EVENT_KIND } from '@kbn/rule-data-utils';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { defaultToolsFlyoutProperties } from '../../shared/hooks/use_default_flyout_properties';
import type { CellActionRenderer } from '../../shared/components/cell_actions';
import { useAlertsPrivileges } from '../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { useFlyoutPagination } from '../../../common/utils/flyout_pagination/use_flyout_pagination';
import { FlyoutLoading } from '../../shared/components/flyout_loading';
import { FlyoutMissingAlertsPrivilege } from './components/flyout_missing_alerts_privilege';
import { EventKind } from './constants/event_kinds';
import { Footer } from './footer';
import { Header } from './header';
import { OverviewTab } from './tabs/overview_tab';
import { NotesDetails } from '../../shared/tools/notes';
import { useKibana } from '../../../common/lib/kibana';
import { flyoutProviders } from '../../shared/components/flyout_provider';
import { useIsInSecurityApp } from '../../../common/hooks/is_in_security_app';
import { documentFlyoutHistoryKey } from '../../shared/constants/flyout_history';
import { RemoteDocumentCallout } from './components/remote_document_callout';
import { FLYOUT_V2_LOADING_SPINNER_TEST_ID } from './components/test_ids';

const footerStyles = css`
  @media (max-width: 767px) {
    overflow: auto;
  }
`;

const headerStyles = css`
  @media (max-width: 767px) {
    overflow: auto;
  }
`;

export interface DocumentFlyoutProps {
  /**
   * The document to display
   */
  hit: DataTableRecord;
  /**
   * Cell action renderer for the analyzer
   */
  renderCellActions: CellActionRenderer;
  /**
   * Callback invoked after alert mutations to refresh related flyouts.
   */
  onAlertUpdated: () => void;
  /**
   * Per-source-instance UUID forwarded from the V2 paginated wrapper.
   * Passed down to `Header` and used to look up the loading/pagination state
   * from `flyoutPaginationStore`. Absent for non-paginated flyout opens.
   */
  paginationInstanceId?: string;
}

/**
 * Content for the document flyout, combining the header and overview tab.
 */
export const DocumentFlyout = memo(
  ({ hit, onAlertUpdated, renderCellActions, paginationInstanceId }: DocumentFlyoutProps) => {
    const { services } = useKibana();
    const { overlays } = services;
    const store = useStore();
    const history = useHistory();
    const isAlert = useMemo(
      () => (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
      [hit]
    );
    const isSecurityApp = useIsInSecurityApp();
    const historyKey = isSecurityApp ? documentFlyoutHistoryKey : DOC_VIEWER_FLYOUT_HISTORY_KEY;
    const { hasAlertsRead, loading } = useAlertsPrivileges();
    const missingAlertsPrivilege = !loading && !hasAlertsRead && isAlert;
    // While the in-flyout pagination is fetching an alert from a different
    // page than the alerts table is showing, render a centered spinner in the
    // body and keep the previous alert's header (with the new pagination
    // position) visible. Mirrors the V1 `RightPanel` loading branch.
    const { isFlyoutAlertLoading } = useFlyoutPagination(paginationInstanceId);

    const onShowNotes = useCallback(() => {
      overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: <NotesDetails hit={hit} />,
        }),
        {
          ...defaultToolsFlyoutProperties,
          historyKey,
        }
      );
    }, [history, historyKey, hit, overlays, services, store]);

    if (isAlert && loading) {
      return <FlyoutLoading data-test-subj="document-overview-loading" />;
    }

    if (missingAlertsPrivilege) {
      return <FlyoutMissingAlertsPrivilege />;
    }

    if (isFlyoutAlertLoading) {
      return (
        <>
          <RemoteDocumentCallout hit={hit} />
          <EuiFlyoutHeader>
            <Header
              hit={hit}
              renderCellActions={renderCellActions}
              onAlertUpdated={onAlertUpdated}
              onShowNotes={onShowNotes}
              paginationInstanceId={paginationInstanceId}
            />
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiFlexGroup
              alignItems="center"
              justifyContent="center"
              css={{ height: '100%' }}
              data-test-subj={FLYOUT_V2_LOADING_SPINNER_TEST_ID}
            >
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="xl" />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutBody>
        </>
      );
    }

    return (
      <>
        <RemoteDocumentCallout hit={hit} />
        <EuiFlyoutHeader css={headerStyles}>
          <Header
            hit={hit}
            renderCellActions={renderCellActions}
            onAlertUpdated={onAlertUpdated}
            onShowNotes={onShowNotes}
            paginationInstanceId={paginationInstanceId}
          />
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <OverviewTab
            hit={hit}
            renderCellActions={renderCellActions}
            onAlertUpdated={onAlertUpdated}
          />
        </EuiFlyoutBody>
        <EuiFlyoutFooter css={footerStyles}>
          <Footer hit={hit} onAlertUpdated={onAlertUpdated} onShowNotes={onShowNotes} />
        </EuiFlyoutFooter>
      </>
    );
  }
);

DocumentFlyout.displayName = 'DocumentFlyout';
