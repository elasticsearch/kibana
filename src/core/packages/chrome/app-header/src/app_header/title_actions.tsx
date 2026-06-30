/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButtonIcon, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import React, { useMemo } from 'react';
import type { ShareAction } from './hooks';
import { APP_HEADER_TEST_SUBJECTS } from './test_subjects';

const SHARE_ARIA_LABEL = i18n.translate('core.ui.chrome.appHeader.shareAriaLabel', {
  defaultMessage: 'Share',
});

const useTitleActionsStyles = () => {
  const { euiTheme } = useEuiTheme();

  return useMemo(() => {
    const root = css`
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: ${euiTheme.size.xs};
    `;

    const iconButton = css`
      color: ${euiTheme.colors.textSubdued};
    `;

    const favoriteSlot = css`
      display: flex;
      flex-shrink: 0;
      align-items: center;

      .euiButtonIcon {
        color: ${euiTheme.colors.textSubdued};
        block-size: 24px;
        inline-size: 24px;
      }
    `;

    return { root, iconButton, favoriteSlot };
  }, [euiTheme]);
};

export interface TitleActionsProps {
  shareAction?: ShareAction;
  favorite?: ReactNode;
}

export const TitleActions = React.memo<TitleActionsProps>(({ shareAction, favorite }) => {
  const styles = useTitleActionsStyles();

  if (!shareAction && !favorite) {
    return null;
  }

  const shareTooltipContent = shareAction?.tooltipContent ?? SHARE_ARIA_LABEL;
  const hasCustomTooltip = !!shareAction?.tooltipContent || !!shareAction?.tooltipTitle;

  return (
    <div css={styles.root} data-test-subj={APP_HEADER_TEST_SUBJECTS.titleActions}>
      {shareAction ? (
        <EuiToolTip
          content={shareTooltipContent}
          title={shareAction.tooltipTitle}
          {...(!hasCustomTooltip && { disableScreenReaderOutput: true })}
        >
          <EuiButtonIcon
            iconType="share"
            color="text"
            display="empty"
            size="xs"
            css={styles.iconButton}
            aria-label={SHARE_ARIA_LABEL}
            isDisabled={shareAction.isDisabled}
            data-test-subj={`${APP_HEADER_TEST_SUBJECTS.sharePrefix} ${
              shareAction.testId ?? ''
            }`.trim()}
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
              shareAction.onClick(event.currentTarget)
            }
          />
        </EuiToolTip>
      ) : null}
      {favorite ? (
        // Temporary slot: favorite is still a caller-owned React node.
        // Replace with a typed app-header action before treating it as a stable API.
        // https://github.com/elastic/kibana/issues/271402
        <div css={styles.favoriteSlot} data-test-subj={APP_HEADER_TEST_SUBJECTS.favorite}>
          {favorite}
        </div>
      ) : null}
    </div>
  );
});

TitleActions.displayName = 'TitleActions';
