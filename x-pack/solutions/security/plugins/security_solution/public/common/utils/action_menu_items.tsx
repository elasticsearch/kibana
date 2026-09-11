/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiIcon } from '@elastic/eui';
import type { EuiContextMenuPanelItemDescriptor, EuiIconProps, IconType } from '@elastic/eui';
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

export const withActionIcon = (
  items: readonly EuiContextMenuPanelItemDescriptor[],
  icon: IconType
): EuiContextMenuPanelItemDescriptor[] =>
  items.map((item) => (isActionMenuItem(item) ? { ...item, icon } : item));

export const withActionIcons = (
  items: readonly EuiContextMenuPanelItemDescriptor[],
  iconsByActionId: Readonly<Record<string, IconType>>
): EuiContextMenuPanelItemDescriptor[] =>
  items.map((item) => {
    if (!isActionMenuItem(item) || typeof item.key !== 'string') {
      return item;
    }

    const icon = iconsByActionId[item.key];

    return icon ? { ...item, icon } : item;
  });

export const withStatusDotIcons = (
  items: readonly EuiContextMenuPanelItemDescriptor[],
  colorsByActionId: Readonly<Record<string, EuiIconProps['color']>>,
  defaultColor: EuiIconProps['color'] = 'subdued'
): EuiContextMenuPanelItemDescriptor[] =>
  items.map((item) => {
    if (!isActionMenuItem(item)) {
      return item;
    }

    const color =
      (typeof item.key === 'string' ? colorsByActionId[item.key] : undefined) ?? defaultColor;

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
