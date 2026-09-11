/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiIcon } from '@elastic/eui';
import type { EuiContextMenuPanelItemDescriptor, EuiIconProps } from '@elastic/eui';
import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import type { ReactNode } from 'react';
import React from 'react';

export const ACTION_MENU_GROUP_SEPARATOR_TEST_ID = 'securityActionMenuGroupSeparator';

interface ActionMenuGroupSeparator {
  key: string;
  isSeparator: true;
  'data-test-subj': typeof ACTION_MENU_GROUP_SEPARATOR_TEST_ID;
}

export const isActionMenuItem = (
  item: EuiContextMenuPanelItemDescriptor
): item is Extract<EuiContextMenuPanelItemDescriptor, { name: ReactNode }> => 'name' in item;

/** Applies a single icon to all action-menu items in `items`. */
export const withActionIcon = (
  items: readonly EuiContextMenuPanelItemDescriptor[],
  icon: EuiIconType
): EuiContextMenuPanelItemDescriptor[] =>
  items.map((item) => (isActionMenuItem(item) ? { ...item, icon } : item));

/**
 * Gap-fills icons for action-menu items that don't already have one.
 * Items that carry a producer-set `icon` are left unchanged so that the icon map
 * never clobbers an intentional override.
 */
export const withActionIcons = (
  items: readonly EuiContextMenuPanelItemDescriptor[],
  iconsByActionId: Readonly<Record<string, EuiIconType>>
): EuiContextMenuPanelItemDescriptor[] =>
  items.map((item) => {
    if (!isActionMenuItem(item) || typeof item.key !== 'string' || item.icon) {
      return item;
    }

    const icon = iconsByActionId[item.key];

    return icon ? { ...item, icon } : item;
  });

/**
 * Adds coloured status-dot icons to action-menu items based on their `key`.
 * Items whose key is not in `colorsByActionId` are returned unchanged — callers
 * must add explicit entries for every item they want decorated.
 */
export const withStatusDotIcons = (
  items: readonly EuiContextMenuPanelItemDescriptor[],
  colorsByActionId: Readonly<Record<string, EuiIconProps['color']>>
): EuiContextMenuPanelItemDescriptor[] =>
  items.map((item) => {
    if (!isActionMenuItem(item)) {
      return item;
    }

    const color = typeof item.key === 'string' ? colorsByActionId[item.key] : undefined;

    if (color === undefined) {
      return item;
    }

    return {
      ...item,
      icon: <EuiIcon type="dot" color={color} aria-hidden />,
    };
  });

export const getActionMenuGroupSeparator = (key: string): ActionMenuGroupSeparator => ({
  key,
  isSeparator: true,
  'data-test-subj': ACTION_MENU_GROUP_SEPARATOR_TEST_ID,
});

/**
 * Combines multiple groups of action-menu items into a single flat array, inserting a
 * group-separator item between consecutive non-empty groups. Empty groups are filtered
 * out, so no orphan separators appear when a group has no items for the current context.
 */
export const withGroupSeparators = (
  groups: readonly (readonly EuiContextMenuPanelItemDescriptor[])[],
  separatorKeyPrefix = 'separator'
): EuiContextMenuPanelItemDescriptor[] => {
  const visibleGroups = groups.filter((group) => group.length > 0);
  return visibleGroups.flatMap((group, index) => [
    ...group,
    ...(index < visibleGroups.length - 1
      ? [getActionMenuGroupSeparator(`${separatorKeyPrefix}-${index}`)]
      : []),
  ]);
};
