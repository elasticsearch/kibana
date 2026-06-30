/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { AppMenuComponent } from './src';
export { AppMenuItem } from './src';
export { AppMenuActionButton } from './src';
export { AppMenuOverflowButton } from './src';
export { AppMenuPopover } from './src';
export { AppMenuPopoverActionButtons } from './src';

export type {
  AppMenuRunAction,
  AppMenuRunActionParams,
  AppMenuConfig,
  AppMenuItemType,
  AppMenuPrimaryActionItem,
  AppMenuPopoverItem,
  AppMenuSplitButtonProps,
  AppMenuStaticItem,
} from './src';

export { APP_MENU_ITEM_LIMIT, APP_MENU_SHARE_ID } from './src';

export {
  APP_MENU_TEST_SUBJECTS,
  getAppMenuItemTestSubj,
  getAppMenuActionButtonTestSubj,
} from './src';

export {
  getDisplayedItemsAllowedAmount,
  getShouldOverflow,
  isDisabled,
  getTooltip,
  mapAppMenuItemToPanelItem,
  getAppMenuItems,
  getPopoverPanels,
  getPopoverActionItems,
  getIsSelectedColor,
  hasNonGlobalStaticItems,
} from './src';
