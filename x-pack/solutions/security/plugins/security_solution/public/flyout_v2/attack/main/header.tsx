/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { flyoutHeaderBlockStyles } from '../../shared/components/flyout_header_block';
import { Notes } from '../../shared/components/notes';
import { HeaderTitle } from './components/header_title';
import { Status } from './components/status';
import { AlertsCount } from './components/alerts_count';
import { Assignees } from './components/assignees';
import { HEADER_SHARE_BUTTON_TEST_ID, HEADER_SUMMARY_PANEL_TEST_ID } from './constants/test_ids';
import { ShareUrlIconButton } from '../../shared/components/share_url_icon_button';
import { useGetAttackFlyoutLink } from '../../../flyout/attack_details/hooks/use_get_attack_flyout_link';

const SHARE_ATTACK_LABEL = i18n.translate(
  'xpack.securitySolution.flyoutV2.attack.header.shareAttackLabel',
  {
    defaultMessage: 'Copy link to attack',
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
   * The attack document to display.
   */
  hit: DataTableRecord;
  /**
   * Called after attack mutations (status change, assignee update, etc.) to refresh related views.
   */
  onAttackUpdated: () => void;
  /**
   * Called when the user clicks the notes button to open the notes tool flyout.
   */
  onShowNotes: () => void;
}

/**
 * Assembled header for the attack flyout. Renders the title, status,
 * alerts count, assignees, and notes. All four summary blocks share a single
 * 2-column flex layout so they wrap together on narrow widths. Padding is
 * provided by the parent `EuiFlyoutHeader`; the header itself adds no extra
 * panel padding.
 */
export const Header: FC<HeaderProps> = memo(({ hit, onAttackUpdated, onShowNotes }) => {
  const documentId = useMemo(() => hit.raw._id ?? '', [hit]);

  const attackDetailsLink = useGetAttackFlyoutLink({
    attackId: hit.raw._id ?? '',
    indexName: hit.raw._index ?? '',
    timestamp: hit.flattened?.['@timestamp'] ? String(hit.flattened['@timestamp']) : undefined,
  });

  return (
    <>
      <div css={shareButtonStyles}>
        <ShareUrlIconButton
          url={attackDetailsLink}
          tooltip={SHARE_ATTACK_LABEL}
          ariaLabel={SHARE_ATTACK_LABEL}
          dataTestSubj={HEADER_SHARE_BUTTON_TEST_ID}
        />
      </div>
      <HeaderTitle hit={hit} />
      <EuiSpacer size="m" />
      <EuiFlexGroup
        direction="row"
        gutterSize="s"
        responsive={false}
        wrap
        data-test-subj={HEADER_SUMMARY_PANEL_TEST_ID}
      >
        <EuiFlexItem css={flyoutHeaderBlockStyles}>
          <EuiFlexGroup direction="row" gutterSize="s" responsive={false}>
            <EuiFlexItem>
              <Status hit={hit} onAttackUpdated={onAttackUpdated} />
            </EuiFlexItem>
            <EuiFlexItem>
              <AlertsCount hit={hit} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem css={flyoutHeaderBlockStyles}>
          <EuiFlexGroup direction="row" gutterSize="s" responsive={false} alignItems="center">
            <EuiFlexItem>
              <Assignees hit={hit} onAttackUpdated={onAttackUpdated} />
            </EuiFlexItem>
            <EuiFlexItem>
              <Notes documentId={documentId} onShowNotes={onShowNotes} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
});

Header.displayName = 'Header';
