/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPagination, EuiSpacer, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { EVENT_KIND } from '@kbn/rule-data-utils';
import { flyoutHeaderBlockStyles } from '../../shared/components/flyout_header_block';
import { EventKind } from './constants/event_kinds';
import { Assignees } from './components/assignees';
import { Title } from './components/title';
import { Status } from './components/status';
import { Notes } from '../../shared/components/notes';
import { DocumentSeverity } from './components/severity';
import { Timestamp } from '../../shared/components/timestamp';
import { RiskScore } from './components/risk_score';
import { ALERT_SUMMARY_PANEL_TEST_ID } from '../../shared/components/test_ids';
import type { CellActionRenderer } from '../../shared/components/cell_actions';
import { noopCellActionRenderer } from '../../shared/components/cell_actions';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import { useFlyoutPagination } from '../../../common/utils/flyout_pagination/use_flyout_pagination';
import { FLYOUT_V2_ALERT_PAGINATION_TEST_ID } from './components/test_ids';

const PAGINATION_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.flyoutV2.document.header.paginationAriaLabel',
  {
    defaultMessage: 'Navigate between alerts',
  }
);

export interface HeaderProps {
  /**
   * The document to display
   */
  hit: DataTableRecord;
  /**
   * Optional cell action renderer for status interactions.
   */
  renderCellActions?: CellActionRenderer;
  /**
   * Optional callback invoked after alert mutations to refresh flyout data.
   */
  onAlertUpdated: () => void;
  /**
   * Callback that opens the notes details view.
   */
  onShowNotes: () => void;
  /**
   * Per-source-instance UUID passed in from the V2 paginated wrapper
   * (`PaginatedDocumentFlyout` / `PaginatedTimelineDocumentFlyout`). When
   * present the header renders in-flyout `EuiPagination` chevrons keyed to
   * the caller's slice. Absent for non-paginated flyout opens.
   */
  paginationInstanceId?: string;
}

/**
 * Document header for the flyout_v2 document flyout.
 * Renders severity, timestamp, title (as a rule-details link for alerts),
 * and alert-only summary blocks (status, risk score assignees, and notes).
 */
export const Header: FC<HeaderProps> = memo(
  ({
    hit,
    renderCellActions = noopCellActionRenderer,
    onAlertUpdated,
    onShowNotes,
    paginationInstanceId,
  }) => {
    const { euiTheme } = useEuiTheme();
    const canReadRules = useUserPrivileges().rulesPrivileges.rules.read;
    const isAlert = useMemo(
      () => (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
      [hit]
    );

    const { flyoutAlertIndex, totalAlertCount, openAlertFlyout } =
      useFlyoutPagination(paginationInstanceId);
    // Show pagination only when the flyout was opened from a paginated source
    // (paginationInstanceId set) and there is more than one document to walk.
    const showPagination =
      paginationInstanceId != null &&
      totalAlertCount > 1 &&
      flyoutAlertIndex != null &&
      flyoutAlertIndex >= 0;

    // When pagination is rendered on the right side of the row it would sit
    // underneath the absolutely-positioned EuiFlyout close button (top: 8px,
    // ~32px tall). Pushing the whole row down by size.l (24px) tucks the
    // pagination just below the close button while keeping the severity
    // badge vertically aligned with it.
    const headerRowCss = useMemo(
      () => (showPagination ? { marginTop: euiTheme.size.l } : undefined),
      [showPagination, euiTheme.size.l]
    );

    return (
      <>
        <EuiFlexGroup
          gutterSize="s"
          justifyContent="spaceBetween"
          alignItems="center"
          responsive={false}
          css={headerRowCss}
        >
          <EuiFlexItem grow={false}>
            <DocumentSeverity hit={hit} />
          </EuiFlexItem>
          {showPagination && (
            <EuiFlexItem grow={false}>
              <EuiPagination
                aria-label={PAGINATION_ARIA_LABEL}
                pageCount={totalAlertCount}
                activePage={flyoutAlertIndex}
                onPageClick={openAlertFlyout}
                compressed
                data-test-subj={FLYOUT_V2_ALERT_PAGINATION_TEST_ID}
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <Timestamp hit={hit}>
          <EuiSpacer size="xs" />
        </Timestamp>
        <Title hit={hit} hideLink={!canReadRules} />
        {isAlert && (
          <>
            <EuiSpacer size="m" />
            <EuiFlexGroup
              direction="row"
              gutterSize="s"
              responsive={false}
              wrap
              data-test-subj={ALERT_SUMMARY_PANEL_TEST_ID}
            >
              <EuiFlexItem css={flyoutHeaderBlockStyles}>
                <EuiFlexGroup direction="row" gutterSize="s" responsive={false}>
                  <EuiFlexItem>
                    <Status
                      hit={hit}
                      renderCellActions={renderCellActions}
                      onAlertUpdated={onAlertUpdated}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <RiskScore hit={hit} />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem css={flyoutHeaderBlockStyles}>
                <EuiFlexGroup direction="row" gutterSize="s" responsive={false}>
                  <EuiFlexItem>
                    <Assignees hit={hit} onAlertUpdated={onAlertUpdated} />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <Notes documentId={hit.raw._id ?? ''} onShowNotes={onShowNotes} />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}
      </>
    );
  }
);

Header.displayName = 'Header';
