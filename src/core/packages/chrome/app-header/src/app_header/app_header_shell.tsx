/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import { useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useMemo } from 'react';
import type { AppHeaderPadding } from '../types';
import { APP_HEADER_TEST_SUBJECTS } from './test_subjects';

// Single-row bar height, applied to every header (title, tabbed, or back-button-only) so the bar
// stays a consistent 48px. The symmetric size.s padding leaves a 32px content area, enough for the
// trailing controls (buttons) to fit without pushing the row past 48px.
const APPLICATION_TOP_BAR_MIN_HEIGHT_PX = 48;

export interface AppHeaderShellProps {
  title?: ReactNode;
  badges?: ReactNode;
  titleActions?: ReactNode;
  titleAppend?: ReactNode;
  trailing?: ReactNode;
  metadata?: ReactNode;
  tabs?: ReactNode;
  sticky?: boolean;
  padding?: AppHeaderPadding;
  borderless?: boolean;
}

// Resolves the outer spacing contract: horizontal padding for the scalar values, and the breakout
// margin for the `bleed` variant. The header's internal vertical padding is standardized separately
// (see `useHeaderStyles`) so the header keeps a consistent height regardless of this prop.
const resolvePadding = (
  sticky: boolean,
  padding: AppHeaderPadding | undefined,
  euiTheme: ReturnType<typeof useEuiTheme>['euiTheme']
) => {
  const resolved = padding ?? (sticky ? 'm' : 'none');

  if (resolved === 'none') {
    return { paddingInline: undefined, bleedMargin: undefined };
  }

  if (resolved === 's' || resolved === 'm') {
    return { paddingInline: euiTheme.size[resolved], bleedMargin: undefined };
  }

  // `{ bleed }`: pull the header out to its padded container's top/left/right edges (negative margin)
  // and re-inset the content by the same amount so it stays aligned with the page gutter. The value
  // mirrors the container's symmetric padding, so it applies equally to the sides and the top.
  const value = resolved.bleed === 'l' ? euiTheme.size.l : euiTheme.size.m;
  return { paddingInline: value, bleedMargin: value };
};

const useHeaderStyles = (
  sticky: boolean,
  padding: AppHeaderPadding | undefined,
  hasTabs: boolean,
  hasTitleAppend: boolean,
  hasMetadata: boolean,
  borderless: boolean
) => {
  const { euiTheme } = useEuiTheme();

  return useMemo(() => {
    const { paddingInline, bleedMargin } = resolvePadding(sticky, padding, euiTheme);

    // Vertical padding is internal (independent of the `padding` prop). The primary row floors at a
    // consistent 48px regardless of title size; content is centered within it.
    const paddingBlock = euiTheme.size.s;
    // A row followed by another collapses its bottom gap so the next row sits close (and tabs stay
    // flush with the header's bottom border); otherwise it uses the symmetric vertical padding.
    const bottomPad = (followed: boolean) => (followed ? euiTheme.size.xs : paddingBlock);

    const root = css`
      ${sticky &&
      css`
        position: sticky;
        top: 0;
        z-index: ${euiTheme.levels.mask};
      `}
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      min-width: 0;
      box-sizing: border-box;
      padding: 0;
      ${paddingInline &&
      css`
        padding-inline: ${paddingInline};
      `}
      ${bleedMargin &&
      css`
        margin-inline: -${bleedMargin};
        margin-top: -${bleedMargin};
      `}
      background: ${euiTheme.colors.backgroundBasePlain};
      ${!borderless &&
      css`
        border-bottom: ${euiTheme.border.thin};
        margin-bottom: -${euiTheme.border.width.thin};
      `}

      &:hover .titleActionsReveal,
      &:focus-within .titleActionsReveal {
        opacity: 1;
        pointer-events: auto;
      }
    `;

    const primaryRow = css`
      display: flex;
      align-items: center;
      gap: ${euiTheme.size.m};
      min-width: 0;
      min-height: ${APPLICATION_TOP_BAR_MIN_HEIGHT_PX}px;
      ${!hasTitleAppend &&
      css`
        padding-block-start: ${paddingBlock};
        padding-block-end: ${bottomPad(hasTabs || hasMetadata)};
      `}
    `;

    const titleCluster = css`
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
    `;

    const titleGroup = css`
      display: flex;
      align-items: center;
      gap: ${euiTheme.size.xs};
      flex: 0 1 auto;
      min-width: 0;
      max-width: 100%;
      ${hasTitleAppend &&
      css`
        max-width: min(40%, 360px);
      `}
    `;

    const titleClusterSpacer = css`
      flex: ${hasTitleAppend ? '0 0 auto' : '1 1 auto'};
      min-width: 0;
    `;

    const titleAppend = css`
      display: flex;
      align-items: center;
      flex: 1 1 0;
      min-width: 0;
    `;

    const trailingSlot = css`
      flex-shrink: 0;
    `;

    const tabsRow = css`
      display: flex;
      align-items: stretch;
    `;

    const metadataRow = css`
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      column-gap: ${euiTheme.size.m};
      row-gap: ${euiTheme.size.xs};
      min-width: 0;
      padding-block-end: ${bottomPad(hasTabs)};
    `;

    const titleActionsReveal = css`
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: ${euiTheme.size.xs};
      opacity: 0;
      pointer-events: none;
      transition: opacity ${euiTheme.animation.fast} ease;
    `;

    return {
      root,
      primaryRow,
      titleCluster,
      titleGroup,
      titleClusterSpacer,
      titleAppend,
      trailingSlot,
      titleActionsReveal,
      metadataRow,
      tabsRow,
    };
  }, [sticky, padding, euiTheme, hasTabs, hasTitleAppend, hasMetadata, borderless]);
};

export const AppHeaderShell = React.memo<AppHeaderShellProps>(
  ({
    title,
    badges,
    titleActions,
    titleAppend,
    metadata,
    trailing,
    tabs,
    sticky = true,
    padding,
    borderless = false,
  }) => {
    const hasTitleAppend = titleAppend != null;
    const styles = useHeaderStyles(sticky, padding, !!tabs, hasTitleAppend, !!metadata, borderless);

    return (
      <div css={styles.root} data-test-subj={APP_HEADER_TEST_SUBJECTS.root}>
        <div css={styles.primaryRow}>
          <div css={styles.titleCluster}>
            <div css={styles.titleGroup}>
              {title}
              {badges}
              {titleActions && (
                <div className="titleActionsReveal" css={styles.titleActionsReveal}>
                  {titleActions}
                </div>
              )}
            </div>
            {hasTitleAppend && <div css={styles.titleAppend}>{titleAppend}</div>}
            <div css={styles.titleClusterSpacer} aria-hidden />
          </div>
          {trailing && <div css={styles.trailingSlot}>{trailing}</div>}
        </div>
        {metadata && (
          <div css={styles.metadataRow} data-test-subj={APP_HEADER_TEST_SUBJECTS.metadata}>
            {metadata}
          </div>
        )}
        {tabs && (
          <div css={styles.tabsRow} data-test-subj={APP_HEADER_TEST_SUBJECTS.tabs}>
            {tabs}
          </div>
        )}
      </div>
    );
  }
);

AppHeaderShell.displayName = 'AppHeaderShell';
