/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import moment from 'moment';
import { css } from '@emotion/react';
import { PreferenceFormattedDate } from '../../../../common/components/formatted_date';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import { extractChangedFieldNames } from '../../utils/extract_changed_field_names';
import {
  DATE_DISPLAY_FORMAT,
  DATE_DISPLAY_FORMAT_WITH_SECONDS,
  DIFFABLE_CHANGE_ACTIONS,
} from './constants';
import { RuleChangeActionBadge } from './rule_change_action_badge';
import * as i18n from './translations';
import { ChangeHistoryItemPopover } from './change_history_item_popover';

interface ChangeHistoryItemProps {
  item: RuleHistoryItem;
  selected?: boolean;
  restoringItemId?: string;
  onClick?: (item: RuleHistoryItem) => void;
  onRestore?: (item: RuleHistoryItem) => void;
}

export const ChangeHistoryItem = memo(function ChangeHistoryItem({
  item,
  selected,
  restoringItemId,
  onClick,
  onRestore,
}: ChangeHistoryItemProps): JSX.Element {
  const { euiTheme } = useEuiTheme();
  const username = item.user?.name ?? i18n.SYSTEM_USER_LABEL;
  const changedFields = useMemo(() => extractChangedFieldNames(item), [item]);
  const isActive = useMemo(() => DIFFABLE_CHANGE_ACTIONS.includes(item.action), [item.action]);
  const isRestoring = restoringItemId === item.id;
  const isRestoringAny = restoringItemId !== undefined;
  const handleClick = useCallback(() => onClick?.(item), [onClick, item]);
  const handleRestore = useCallback(() => onRestore?.(item), [onRestore, item]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  const date = useMemo(
    () => (
      <EuiToolTip
        position="top"
        content={moment(item.timestamp).format(DATE_DISPLAY_FORMAT_WITH_SECONDS)}
      >
        <PreferenceFormattedDate
          value={new Date(item.timestamp)}
          dateFormat={DATE_DISPLAY_FORMAT}
        />
      </EuiToolTip>
    ),
    [item.timestamp]
  );

  return (
    <EuiPanel
      hasBorder
      color={selected ? 'primary' : isActive ? undefined : 'subdued'}
      role={isActive && !isRestoringAny ? 'button' : undefined}
      tabIndex={isActive ? 0 : undefined}
      onClick={isActive && !isRestoringAny ? handleClick : undefined}
      onKeyDown={isActive && !isRestoringAny ? handleKeyDown : undefined}
      data-test-subj={`ruleChangeHistoryItem-${item.id}`}
      css={css`
        margin-bottom: ${euiTheme.size.m};

        &:hover,
        &:focus {
          box-shadow: none;
          transform: none;
        }
      `}
    >
      <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center">
        <EuiFlexGroup direction="column" gutterSize="xs">
          <EuiFlexItem>
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs">
                  <strong>{date}</strong>
                </EuiText>
              </EuiFlexItem>

              {isRestoring && (
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">
                    <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                      <EuiFlexItem grow={false}>
                        <EuiLoadingSpinner size="s" />
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>{i18n.RESTORING_LABEL}</EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiBadge>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="xs">
              <EuiFlexItem grow={false}>
                <EuiIcon
                  type={item.user ? 'user' : 'logoElastic'}
                  size="s"
                  color={item.user ? 'subdued' : 'success'}
                  aria-hidden={true}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs">{username}</EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs">
                  {changedFields.length > 0 && ` • ${i18n.N_CHANGES(changedFields.length)}`}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiFlexItem grow={false}>
          <RuleChangeActionBadge item={item} />
        </EuiFlexItem>

        <ChangeHistoryItemPopover
          onRestore={onRestore ? handleRestore : undefined}
          onClick={isActive ? handleClick : undefined}
          isRestoring={isRestoring}
        />
      </EuiFlexGroup>
    </EuiPanel>
  );
});
