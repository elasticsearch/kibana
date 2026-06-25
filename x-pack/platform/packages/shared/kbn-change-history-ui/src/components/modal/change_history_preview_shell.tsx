/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type ReactNode, useMemo } from 'react';
import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  euiShadowXSmall,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';

export interface ChangeHistoryPreviewShellProps {
  backLabel: string;
  title?: string;
  onBack: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function ChangeHistoryPreviewShell({
  backLabel,
  title,
  onBack,
  footer,
  children,
}: ChangeHistoryPreviewShellProps): JSX.Element {
  const euiThemeContext = useEuiTheme();
  const { euiTheme } = euiThemeContext;

  const styles = useMemo(
    () => ({
      shell: css`
        flex: 1 1 auto;
        align-self: stretch;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        background: ${euiTheme.colors.backgroundBasePlain};
        border-radius: ${euiTheme.border.radius.small};
        ${euiShadowXSmall(euiThemeContext, { border: 'none' })}
        overflow: hidden;
      `,
      header: css`
        flex-shrink: 0;
        padding: ${euiTheme.size.m} ${euiTheme.size.l};
      `,
      body: css`
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      `,
      footer: css`
        flex-shrink: 0;
        border-top: ${euiTheme.border.thin};
      `,
    }),
    [euiTheme, euiThemeContext]
  );

  return (
    <div css={styles.shell} data-test-subj="changeHistoryPreviewShell">
      <div css={styles.header}>
        <EuiFlexGroup direction="column" gutterSize="xs" alignItems="flexStart" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              iconType="arrowLeft"
              flush="left"
              onClick={onBack}
              data-test-subj="changeHistoryPreviewBack"
            >
              {backLabel}
            </EuiButtonEmpty>
          </EuiFlexItem>
          {title ? (
            <EuiFlexItem grow={false}>
              <EuiTitle size="m">
                <h1>{title}</h1>
              </EuiTitle>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </div>

      <div css={styles.body}>{children}</div>

      {footer ? (
        <div css={styles.footer} data-test-subj="changeHistoryPreviewFooter">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
