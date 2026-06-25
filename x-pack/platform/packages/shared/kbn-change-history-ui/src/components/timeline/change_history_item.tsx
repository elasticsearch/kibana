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
  EuiPanel,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { ChangeHistoryBadgeRenderFn } from '../../types/change_history_badge';
import type { ChangeHistoryListItem } from '../../types/change_history_list_item';
import { ChangeHistoryActionBadge } from './change_history_action_badge';
import { ChangeHistoryItemComment } from './change_history_item_comment';
import { ChangeHistoryListTimestamp } from './change_history_list_timestamp';
import * as i18n from './translations';

export interface ChangeHistoryItemProps {
  item: ChangeHistoryListItem;
  selected?: boolean;
  onClick: () => void;
  renderBadge?: ChangeHistoryBadgeRenderFn;
}

export const ChangeHistoryItem = memo(function ChangeHistoryItem({
  item,
  selected,
  onClick,
  renderBadge,
}: ChangeHistoryItemProps): JSX.Element {
  const { euiTheme } = useEuiTheme();
  const timestamp = useMemo(() => new Date(item.timestamp), [item.timestamp]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    },
    [onClick]
  );

  const badge = useMemo(
    () => (renderBadge ? renderBadge({ item }) : <ChangeHistoryActionBadge item={item} />),
    [item, renderBadge]
  );

  return (
    <EuiPanel
      hasBorder
      grow={false}
      paddingSize="s"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      data-test-subj={`changeHistoryItem-${item.id}`}
      css={css`
        margin: 0;
        ${selected ? `background-color: ${euiTheme.colors.backgroundLightPrimary};` : ''}

        &:hover,
        &:focus {
          box-shadow: none;
          transform: none;
        }
      `}
    >
      <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup
            gutterSize="s"
            alignItems="flexStart"
            justifyContent="spaceBetween"
            responsive={false}
          >
            <EuiFlexItem
              css={css`
                min-width: 0;
                overflow: hidden;
              `}
            >
              <EuiToolTip
                position="top"
                content={<ChangeHistoryListTimestamp value={timestamp} withSeconds />}
              >
                <EuiText
                  size="xs"
                  css={css`
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    font-weight: var(--Font-weight-Semi-Bold, 600);
                  `}
                >
                  <ChangeHistoryListTimestamp value={timestamp} />
                </EuiText>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem
              grow={false}
              css={css`
                flex-shrink: 0;

                .euiBadge {
                  font-weight: ${euiTheme.font.weight.regular};
                }
              `}
            >
              {badge}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiText
            size="xs"
            css={css`
              font-weight: ${euiTheme.font.weight.regular};
            `}
          >
            {item.actor.name}
            {item.changeCount != null && item.changeCount > 0
              ? ` • ${i18n.N_CHANGES(item.changeCount)}`
              : ''}
          </EuiText>
        </EuiFlexItem>

        {item.comment && (
          <EuiFlexItem
            grow={false}
            css={css`
              min-width: 0;
            `}
          >
            <ChangeHistoryItemComment comment={item.comment} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
});
