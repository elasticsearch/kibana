/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPagination, EuiSpacer } from '@elastic/eui';
import { css } from '@emotion/react';
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
import {
  ALERT_SUMMARY_PANEL_TEST_ID,
  DOCUMENT_FLYOUT_HEADER_SHARE_BUTTON_TEST_ID,
} from '../../shared/components/test_ids';
import type { CellActionRenderer } from '../../shared/components/cell_actions';
import { noopCellActionRenderer } from '../../shared/components/cell_actions';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import { ShareUrlIconButton } from '../../shared/components/share_url_icon_button';
import { useGetFlyoutLink } from '../../../flyout/document_details/right/hooks/use_get_flyout_link';
import { isRulePreviewDocument } from '../../shared/utils/is_rule_preview_document';
import { useFlyoutPagination } from '../pagination/use_flyout_pagination';
import { FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID } from './components/test_ids';

const SHARE_ALERT_LABEL = i18n.translate(
  'xpack.securitySolution.flyoutV2.document.header.shareAlertLabel',
  {
    defaultMessage: 'Share alert',
  }
);

const PAGINATION_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.flyoutV2.document.header.paginationAriaLabel',
  {
    defaultMessage: 'Navigate between documents',
  }
);

// Positioned relative to the flyout itself (the nearest positioned ancestor), matching where EUI
// places its own close button (`right: euiTheme.size.s` / `top: euiTheme.size.s`). The larger
// inline-end offset makes room for the close button so the two sit side by side.
const shareButtonStyles = css`
  position: absolute;
  inset-inline-end: 36px;
  inset-block-start: 8px;
`;

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
   * `true` when the rendered hit is no longer the document the flyout is showing — pagination is
   * still fetching the next one, or the requested one could not be resolved. The hit is kept around
   * only to preserve non-mutating header context, so alert actions that would mutate it are hidden.
   */
  isDocumentStale?: boolean;
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
    isDocumentStale = false,
  }) => {
    const canReadRules = useUserPrivileges().rulesPrivileges.rules.read;
    const isAlert = useMemo(
      () => (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
      [hit]
    );
    const isRulePreview = useMemo(() => isRulePreviewDocument(hit), [hit]);

    const alertDetailsLink = useGetFlyoutLink({
      eventId: hit.raw._id ?? '',
      indexName: hit.raw._index ?? '',
      timestamp: String(hit.flattened?.['@timestamp'] ?? ''),
    });

    const { flyoutDocumentIndex, totalDocumentCount, openDocumentFlyout } = useFlyoutPagination();
    const showPagination =
      totalDocumentCount > 1 && flyoutDocumentIndex != null && flyoutDocumentIndex >= 0;

    return (
      <>
        <div css={shareButtonStyles}>
          <ShareUrlIconButton
            url={isAlert ? alertDetailsLink : null}
            tooltip={SHARE_ALERT_LABEL}
            ariaLabel={SHARE_ALERT_LABEL}
            dataTestSubj={DOCUMENT_FLYOUT_HEADER_SHARE_BUTTON_TEST_ID}
          />
        </div>
        <EuiFlexGroup
          gutterSize="s"
          justifyContent="spaceBetween"
          alignItems="center"
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <DocumentSeverity hit={hit} />
          </EuiFlexItem>
          {showPagination && (
            <EuiFlexItem grow={false}>
              <EuiPagination
                aria-label={PAGINATION_ARIA_LABEL}
                pageCount={totalDocumentCount}
                activePage={flyoutDocumentIndex}
                onPageClick={openDocumentFlyout}
                compressed
                data-test-subj={FLYOUT_V2_DOCUMENT_PAGINATION_TEST_ID}
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <Timestamp hit={hit}>
          <EuiSpacer size="xs" />
        </Timestamp>
        <Title hit={hit} hideLink={!canReadRules || isRulePreview} />
        {isAlert && !isDocumentStale && (
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
                <EuiFlexGroup direction="row" gutterSize="s" responsive={false} alignItems="center">
                  <EuiFlexItem>
                    <Assignees
                      hit={hit}
                      onAlertUpdated={onAlertUpdated}
                      showAssignees={!isRulePreview}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <Notes
                      documentId={hit.raw._id ?? ''}
                      onShowNotes={onShowNotes}
                      disabled={isRulePreview}
                    />
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
