/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type ReactNode, useMemo } from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import * as i18n from '../timeline/translations';

export interface ChangeHistorySidebarPanelProps {
  title: string;
  onClose: () => void;
  /** Optional toolbar icons rendered before the close separator (e.g. filter, calendar). */
  headerActions?: ReactNode;
  children: ReactNode;
}

export function ChangeHistorySidebarPanel({
  title,
  onClose,
  headerActions,
  children,
}: ChangeHistorySidebarPanelProps): JSX.Element {
  const { euiTheme } = useEuiTheme();

  const styles = useMemo(
    () => ({
      panel: css`
        flex: 0 0 380px;
        width: 380px;
        align-self: stretch;
        min-height: 0;
        display: flex;
        flex-direction: column;
        background: ${euiTheme.colors.backgroundBasePlain};
        border: ${euiTheme.border.thin};
        border-radius: ${euiTheme.border.radius.small};
        overflow: hidden;
      `,
      header: css`
        flex-shrink: 0;
        padding: ${euiTheme.size.base};
        border-bottom: ${euiTheme.border.thin};
      `,
      headerSeparator: css`
        width: 1px;
        align-self: stretch;
        min-height: ${euiTheme.size.l};
        background-color: ${euiTheme.colors.borderBasePlain};
      `,
      body: css`
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      `,
    }),
    [euiTheme]
  );

  return (
    <div css={styles.panel} data-test-subj="changeHistorySidebarPanel">
      <div css={styles.header}>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={true}>
            <EuiTitle size="xxs">
              <h2>{title}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              {headerActions ? <EuiFlexItem grow={false}>{headerActions}</EuiFlexItem> : null}
              <EuiFlexItem grow={false}>
                <div css={styles.headerSeparator} aria-hidden={true} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiToolTip content={i18n.CLOSE_MODAL} disableScreenReaderOutput>
                  <EuiButtonIcon
                    iconType="cross"
                    size="s"
                    aria-label={i18n.CLOSE_MODAL}
                    color="text"
                    onClick={onClose}
                    data-test-subj="changeHistoryModalClose"
                  />
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>

      <div css={styles.body}>{children}</div>
    </div>
  );
}
