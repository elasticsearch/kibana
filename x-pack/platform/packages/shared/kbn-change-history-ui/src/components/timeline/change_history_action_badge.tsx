/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import type { ChangeHistoryListItem } from '../../types/change_history_list_item';
import * as i18n from './translations';

interface ChangeHistoryActionBadgeProps {
  item: ChangeHistoryListItem;
}

export const ChangeHistoryActionBadge = memo(function ChangeHistoryActionBadge({
  item,
}: ChangeHistoryActionBadgeProps): JSX.Element {
  return (
    <EuiFlexGroup gutterSize="xs" responsive={false}>
      {item.isCurrent && (
        <EuiFlexItem grow={false}>
          <EuiBadge color="success">{i18n.CURRENT_CHANGE_BADGE}</EuiBadge>
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <EuiBadge color="hollow">
          <EuiText size="xs">{item.action}</EuiText>
        </EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});
