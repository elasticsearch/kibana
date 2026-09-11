/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { memo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiHorizontalRule, EuiText, useEuiTheme } from '@elastic/eui';
import type { OperatingSystem } from '@kbn/securitysolution-utils';
import { OS_TITLES } from '../../../../../common/translations';
import { OS_LABEL_COLUMN_WIDTH } from './os_control_layout';

export interface OsRowProps {
  os: OperatingSystem;
  primaryControl: ReactNode;
  /** Rendered immediately after the OS name, for OS-scoped notices such as a restriction warning. */
  labelAppend?: ReactNode;
  inlineControls?: ReactNode;
  children?: ReactNode;
  isLast?: boolean;
  'data-test-subj'?: string;
}

export const OsRow = memo<OsRowProps>(
  ({
    os,
    primaryControl,
    labelAppend,
    inlineControls,
    children,
    isLast = false,
    'data-test-subj': dataTestSubj,
  }) => {
    const { euiTheme } = useEuiTheme();

    const labelColumnCss = {
      flexBasis: OS_LABEL_COLUMN_WIDTH,
      minInlineSize: OS_LABEL_COLUMN_WIDTH,
      [`@media only screen and (max-width: ${euiTheme.breakpoint.s})`]: {
        flexBasis: 'auto',
        minInlineSize: 0,
      },
    };

    return (
      <div data-test-subj={dataTestSubj}>
        <EuiFlexGroup alignItems="center" gutterSize="m">
          <EuiFlexItem
            grow={false}
            data-test-subj={dataTestSubj ? `${dataTestSubj}-osLabel` : undefined}
            css={labelColumnCss}
          >
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <h5>{OS_TITLES[os]}</h5>
                </EuiText>
              </EuiFlexItem>
              {labelAppend && <EuiFlexItem grow={false}>{labelAppend}</EuiFlexItem>}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem css={{ minWidth: 0 }}>
            <EuiFlexGroup alignItems="center" gutterSize="m" wrap={true}>
              <EuiFlexItem grow={false}>{primaryControl}</EuiFlexItem>
              {inlineControls && <EuiFlexItem grow={false}>{inlineControls}</EuiFlexItem>}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        {children && (
          <EuiFlexGroup alignItems="flexStart" gutterSize="m">
            {/* Empty spacer keeps the panel indented to the same column as the controls above. */}
            <EuiFlexItem grow={false} aria-hidden={true} css={labelColumnCss} />
            <EuiFlexItem css={{ minWidth: 0 }}>{children}</EuiFlexItem>
          </EuiFlexGroup>
        )}
        {!isLast && (
          <EuiHorizontalRule
            margin="m"
            data-test-subj={dataTestSubj ? `${dataTestSubj}-separator` : undefined}
          />
        )}
      </div>
    );
  }
);
OsRow.displayName = 'OsRow';
