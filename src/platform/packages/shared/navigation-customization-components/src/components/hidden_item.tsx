/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiPanel, EuiSwitch, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { NavigationItemInfo } from '../types';

interface Props {
  item: NavigationItemInfo;
  toggleItemVisibility: (id: string) => void;
}

export const HiddenItem = ({ item, toggleItemVisibility }: Props) => (
  <EuiPanel paddingSize="s" hasShadow={false}>
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      {item.icon && (
        <EuiFlexItem grow={false}>
          <EuiIcon type={item.icon} aria-hidden={true} />
        </EuiFlexItem>
      )}
      <EuiFlexItem>
        <EuiText size="s">{item.title}</EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiSwitch
          compressed
          label={i18n.translate('navigationCustomizationComponents.hiddenItemAriaLabel', {
            defaultMessage: 'Show {itemTitle}',
            values: { itemTitle: item.title },
          })}
          showLabel={false}
          checked={!item.hidden}
          onChange={() => toggleItemVisibility(item.id)}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiPanel>
);
