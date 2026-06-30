/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { AppMenuComponent } from './components';
export { AppMenuItem } from './components';
export { AppMenuActionButton } from './components';
export { AppMenuOverflowButton } from './components';
export { AppMenuPopover } from './components';
export { AppMenuPopoverActionButtons } from './components';
export { AppMenuSwitchComponent } from './components';

export type {
  AppMenuRunAction,
  AppMenuRunActionParams,
  AppMenuConfig,
  AppMenuItemType,
  AppMenuPrimaryActionItem,
  AppMenuPopoverItem,
  AppMenuSplitButtonProps,
  AppMenuStaticItem,
  AppMenuSwitch,
} from './types';

export { APP_MENU_ITEM_LIMIT, APP_MENU_SHARE_ID, DEFAULT_POPOVER_WIDTH } from './constants';

export {
  APP_MENU_TEST_SUBJECTS,
  getAppMenuItemTestSubj,
  getAppMenuActionButtonTestSubj,
} from './test_subjects';

export {
  getDisplayedItemsAllowedAmount,
  getShouldOverflow,
  isDisabled,
  getTooltip,
  mapAppMenuItemToPanelItem,
  getAppMenuItems,
  getPopoverPanels,
  getPopoverActionItems,
  getPopoverSwitchItems,
  getIsSelectedColor,
  hasNonGlobalStaticItems,
} from './utils';
