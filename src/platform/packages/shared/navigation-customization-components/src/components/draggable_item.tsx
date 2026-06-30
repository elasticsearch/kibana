/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import {
  EuiDraggable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSwitch,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { NavigationItemInfo } from '../types';

interface Props {
  item: NavigationItemInfo;
  index: number;
  toggleItemVisibility: (id: string) => void;
}

const i18nTexts = {
  showItem: i18n.translate('navigationCustomizationComponents.toggleVisibilityShow', {
    defaultMessage: 'Show this item',
  }),
  hideItem: i18n.translate('navigationCustomizationComponents.toggleVisibilityHide', {
    defaultMessage: 'Hide this item',
  }),
};

export const DraggableItem = ({ item, index, toggleItemVisibility }: Props) => (
  <EuiDraggable
    index={index}
    draggableId={item.id}
    customDragHandle
    hasInteractiveChildren
    usePortal
  >
    {(provided) => (
      <EuiPanel
        paddingSize="s"
        hasShadow={false}
        data-test-subj={`customizeNavigationItem-${item.id}`}
      >
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <div
              {...provided.dragHandleProps}
              aria-label={i18n.translate('navigationCustomizationComponents.dragHandleAriaLabel', {
                defaultMessage: 'Drag handle for {itemTitle}',
                values: { itemTitle: item.title },
              })}
            >
              <EuiIcon type="grabHorizontal" color="subdued" aria-hidden={true} />
            </div>
          </EuiFlexItem>
          {item.icon && (
            <EuiFlexItem grow={false}>
              <EuiIcon type={item.icon} aria-hidden={true} />
            </EuiFlexItem>
          )}
          <EuiFlexItem>
            <EuiText size="s">{item.title}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              position="right"
              content={item.hidden ? i18nTexts.showItem : i18nTexts.hideItem}
            >
              <EuiSwitch
                compressed
                label={item.hidden ? i18nTexts.showItem : i18nTexts.hideItem}
                showLabel={false}
                checked={!item.hidden}
                onChange={() => toggleItemVisibility(item.id)}
                data-test-subj={`customizeNavigationItemToggle-${item.id}`}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    )}
  </EuiDraggable>
);
