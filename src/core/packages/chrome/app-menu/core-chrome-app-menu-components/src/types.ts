/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiHideForProps, EuiSwitchProps, IconType } from '@elastic/eui';
import type { SplitButtonWithNotificationProps } from './components/split_button_with_notification';

/**
 * Parameters passed to AppMenuRunAction
 */
export interface AppMenuRunActionParams {
  /**
   * The HTML element that triggered the action. Do not use this to open popovers. Use `items` property to define popover items instead.
   */
  triggerElement: HTMLElement;
  /**
   * Returns focus to the originating app menu control (or an internal fallback such as
   * the overflow button). This is useful when a run action opens and later closes a
   * modal/flyout/dialog that should restore keyboard focus.
   */
  returnFocus: () => void;
  /**
   * Generic context object that can be used to pass additional data to the run action.
   * Consumers can extend this to add custom properties as needed.
   */
  context?: Record<string, unknown>;
}

/**
 * Type for the function that runs when an app menu item is clicked
 * @param params - Optional parameters object
 */
export type AppMenuRunAction = (params?: AppMenuRunActionParams) => void;

/**
 * Subset of SplitButtonWithNotificationProps.
 */
type BaseSplitProps = Pick<
  SplitButtonWithNotificationProps,
  | 'isMainButtonLoading'
  | 'isSecondaryButtonDisabled'
  | 'secondaryButtonAriaLabel'
  | 'iconType'
  | 'showNotificationIndicator'
  | 'notificationIndicatorTooltipContent'
>;

type AppMenuSecondarySplitButton = BaseSplitProps & {
  /**
   * Sub-items to show in a popover when the item is clicked. Only used if `run` is not provided.
   */
  items?: never;
  /**
   * Function to run when the item is clicked. Only used if `items` is not provided.
   */
  run: AppMenuRunAction;
};

type AppMenuSecondarySplitButtonWithPopover = BaseSplitProps & {
  /**
   * Sub-items to show in a popover when the item is clicked. Only used if `run` is not provided.
   */
  items: AppMenuPopoverItem[];
  /**
   * Function to run when the item is clicked. Only used if `items` is not provided.
   */
  run?: never;
};

/**
 * Subset of SplitButtonWithNotificationProps.
 */
export type AppMenuSplitButtonProps =
  | AppMenuSecondarySplitButton
  | AppMenuSecondarySplitButtonWithPopover;

interface AppMenuItemBase {
  /**
   * A unique, internal identifier for the item.
   */
  id: string;
  /**
   * A unique identifier for the item, used for HTML `id` attribute.
   */
  htmlId?: string;
  /**
   * The text label for the item.
   */
  label: string;
  /**
   * The icon type for the item.
   */
  iconType: IconType;
  /**
   * Sets the `data-test-subj` attribute for the item, used for testing purposes.
   *
   * When provided, it fully replaces the element's default subject. When omitted, the element falls
   * back to a structural subject derived from `id` (`app-menu-item-<id>` for menu items,
   * `app-menu-action-button-<id>` for primary action buttons). Either way, derived sub-elements use
   * the resolved value as a prefix (e.g. the label badge is `<resolved>-badge`).
   */
  testId?: string;
  /**
   * Disables the button if set to `true` or a function that returns `true`.
   */
  disableButton?: boolean | (() => boolean);
  /**
   * Displays a loading indicator on the button if set to `true`.
   */
  isLoading?: boolean;
  /**
   * Tooltip content to show when hovering over the item.
   */
  tooltipContent?: string | (() => string | undefined);
  /**
   * Tooltip title to show when hovering over the item.
   */
  tooltipTitle?: string | (() => string | undefined);
  /**
   * Hides the item at the specified responsive breakpoints.
   * */
  hidden?: EuiHideForProps['sizes'];
}

type AppMenuLinkItem = AppMenuItemBase & {
  /**
   * The HTML href attribute for the item. Only used if `items` is not provided.
   */
  href: string;
  /**
   * The HTML target attribute for the item. Only used if `items` is not provided.
   */
  target?: string;
  /**
   * Function to run when the item is clicked. Only used if `items` is not provided.
   */
  run?: AppMenuRunAction;
  /**
   * Sub-items to show in a popover when the item is clicked. Only used if `run` and `href` is not provided.
   */
  items?: never;
  /**
   * Width of the popover in pixels.
   * Only used if `run` and `href` is not provided.
   */
  popoverWidth?: never;
  /**
   * A unique identifier for the popover, used for testing purposes. Maps to `data-test-subj` attribute.
   * Only used if `run` and `href` is not provided.
   */
  popoverTestId?: never;
};

type AppMenuButtonItem = AppMenuItemBase & {
  /**
   * The HTML href attribute for the item. Only used if `items` is not provided.
   */
  href?: string;
  /**
   * The HTML target attribute for the item. Only used if `items` is not provided.
   */
  target?: string;
  /**
   * Function to run when the item is clicked. Only used if `items` is not provided.
   */
  run: AppMenuRunAction;
  /**
   * Sub-items to show in a popover when the item is clicked. Only used if `run` and `href` is not provided.
   */
  items?: never;
  /**
   * Width of the popover in pixels.
   * Only used if `run` and `href` is not provided.
   */
  popoverWidth?: never;
  /**
   * A unique identifier for the popover, used for testing purposes. Maps to `data-test-subj` attribute.
   * Only used if `run` and `href` is not provided.
   */
  popoverTestId?: never;
};

type AppMenuItemWithPopover = AppMenuItemBase & {
  /**
   * The HTML href attribute for the item. Only used if `items` is not provided.
   */
  href?: never;
  /**
   * The HTML target attribute for the item. Only used if `items` is not provided.
   */
  target?: never;
  /**
   * Function to run when the item is clicked. Only used if `items` is not provided.
   */
  run?: never;
  /**
   * Sub-items to show in a popover when the item is clicked. Only used if `run` and `href` is not provided.
   */
  items: AppMenuPopoverItem[];
  /**
   * Width of the popover in pixels.
   */
  popoverWidth?: number;
  /**
   * A unique identifier for the popover, used for testing purposes. Maps to `data-test-subj` attribute.
   * Only used if `run` and `href` is not provided.
   */
  popoverTestId?: string;
};

export type AppMenuItemCommon = AppMenuButtonItem | AppMenuItemWithPopover | AppMenuLinkItem;

/**
 * Full item type for use in `config.items` arrays.
 */
export type AppMenuItemType = AppMenuItemCommon & {
  /**
   * Order of the item in the menu. Lower numbers appear first.
   */
  order: number;
  /**
   * If `true`, the item will be moved to the "More" menu. Only used in top-level items, not in popover items.
   */
  overflow?: boolean;
  /**
   * Adds a separator line above or below the item when rendered inside a popover menu.
   * Ignored for top-level, non-popover items.
   */
  separator?: 'above' | 'below';
};

export type AppMenuStaticItem = AppMenuItemType & {
  /**
   * Global static items are singleton items that are registered once
   * and are shared across all app menus.
   */
  global?: boolean;
};

/**
 * Popover item type for use in `items` arrays.
 */
export type AppMenuPopoverItem = Omit<
  AppMenuItemType,
  'iconType' | 'hidden' | 'popoverWidth' | 'overflow'
> & {
  /**
   * The icon type for the item.
   */
  iconType?: IconType;
  /**
   * Optional badge text displayed after the label (e.g. "New").
   * Rendered as an inline EuiBadge next to the item name.
   */
  labelBadgeText?: string;
};

export interface AppMenuSwitch {
  id: string;
  label: string;
  labelProps: EuiSwitchProps['labelProps'];
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'data-test-subj'?: string;
}

interface AppMenuPrimaryActionBase extends AppMenuItemBase {
  /**
   * Width of the popover in pixels. Used when `items` or `splitButtonProps.items` is provided.
   */
  popoverWidth?: number;
  /**
   * A unique identifier for the popover, used for testing purposes. Maps to `data-test-subj` attribute.
   */
  popoverTestId?: string;
  /**
   * Subset of SplitButtonWithNotificationProps.
   */
  splitButtonProps?: AppMenuSplitButtonProps;
}

type AppMenuPrimaryActionButton = AppMenuPrimaryActionBase & {
  href?: string;
  target?: string;
  run: AppMenuRunAction;
  items?: never;
};

type AppMenuPrimaryActionLink = AppMenuPrimaryActionBase & {
  href: string;
  target?: string;
  run?: AppMenuRunAction;
  items?: never;
};

type AppMenuPrimaryActionPopover = AppMenuPrimaryActionBase & {
  href?: never;
  target?: never;
  run?: never;
  items: AppMenuPopoverItem[];
};

/**
 * Primary action button type. Can be a simple button, a button with a popover, or a split button.
 *
 * - Simple button: provide `run` to execute an action on click.
 * - Button with popover: provide `items` to open a popover menu on click.
 * - Split button: provide `run` together with `splitButtonProps` to combine a primary action
 *   with a secondary dropdown.
 */
export type AppMenuPrimaryActionItem =
  | AppMenuPrimaryActionButton
  | AppMenuPrimaryActionLink
  | AppMenuPrimaryActionPopover;

/**
 * Configuration object for the AppMenu component.
 * The maximum number of items that can be visible at once before overflowing into the "More"
 * popover is determined by the APP_MENU_ITEM_LIMIT constant - currently 5 but it will
 * be reduced to 3 in a future release.
 */
export interface AppMenuConfig {
  /**
   * List of menu items to display in the app menu.

   */
  items?: AppMenuItemType[];
  /**
   * Primary action button to display in the app menu.
   * Can be a simple button, a button with a popover, or a split button.
   */
  primaryActionItem?: AppMenuPrimaryActionItem;
  /**
   * App menu switch. Only one switch is available per app menu
   * and it is rendered to the left of the menu items.
   */
  switch?: AppMenuSwitch;
}
