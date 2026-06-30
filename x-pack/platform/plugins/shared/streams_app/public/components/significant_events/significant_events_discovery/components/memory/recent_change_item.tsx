/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  transparentize,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/css';
import { FormattedRelative } from '@kbn/i18n-react';
import { changeTypeColors, changeTypeIcons } from './utils';
import type { MemoryVersionRecord } from './types';

export function RecentChangeItem({
  change,
  onClick,
}: {
  change: MemoryVersionRecord;
  onClick: () => void;
}) {
  const { euiTheme } = useEuiTheme();
  const hoverBackground = transparentize(euiTheme.colors.primary, 0.05);

  return (
    <EuiPanel
      paddingSize="s"
      hasBorder
      hasShadow={false}
      onClick={onClick}
      className={css`
        cursor: pointer;
        &:hover {
          background-color: ${hoverBackground};
        }
      `}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge
            color={changeTypeColors[change.change_type] ?? 'default'}
            iconType={changeTypeIcons[change.change_type] ?? 'dot'}
          >
            {change.change_type}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs">
            <strong>{change.title}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <FormattedRelative value={change.created_at} />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem>
          {change.change_summary && (
            <EuiText size="xs" color="subdued">
              {change.change_summary}
            </EuiText>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {change.created_by}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
