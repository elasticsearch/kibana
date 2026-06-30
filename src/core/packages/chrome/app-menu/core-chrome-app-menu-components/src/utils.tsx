/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type MouseEvent, type ReactNode } from 'react';
import { isArray, isFunction, upperFirst } from 'lodash';
import {
  type EuiButtonColor,
  type EuiThemeComputed,
  type EuiContextMenuPanelDescriptor,
  type EuiContextMenuPanelItemDescriptor,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSwitch,
} from '@elastic/eui';
import { getRouterLinkProps } from '@kbn/router-utils';
import { AppMenuBadge } from './components/app_menu_badge';
import { AppMenuPopoverActionButtons } from './components/app_menu_popover_action_buttons';
import type {
  AppMenuConfig,
  AppMenuItemCommon,
  AppMenuItemType,
  AppMenuPopoverItem,
  AppMenuPrimaryActionItem,
  AppMenuSwitch,
} from './types';
import { APP_MENU_ITEM_LIMIT, DEFAULT_POPOVER_WIDTH } from './constants';
import { APP_MENU_TEST_SUBJECTS, getAppMenuItemTestSubj } from './test_subjects';

const sortByOrder = <T extends { order: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.order - b.order);

/**
 * Calculate how many items can be displayed.
 * When overflow is needed, one slot is reserved for the overflow button.
 *
 * @param hasStaticItems - Whether there are static items that will be appended to the overflow menu.
 *   When true, the overflow button is always shown, so a slot must be reserved for it.
 */
export const getDisplayedItemsAllowedAmount = (
  config: AppMenuConfig,
  hasStaticItems: boolean = false
) => {
  const totalItems = config.items?.length ?? 0;
  const hasForcedOverflowItems = config.items?.some((item) => item.overflow) ?? false;

  if (!hasForcedOverflowItems && !hasStaticItems && totalItems <= APP_MENU_ITEM_LIMIT) {
    return APP_MENU_ITEM_LIMIT;
  }
  // Reserve one slot for the overflow button
  return APP_MENU_ITEM_LIMIT - 1;
};

/**
 * Determine if the menu should overflow into a "more" menu.
 */
export const getShouldOverflow = ({
  config,
  displayedItemsAllowedAmount,
}: {
  config: AppMenuConfig;
  displayedItemsAllowedAmount: number;
}) => {
  if (!config.items) {
    return false;
  }

  if (config.items.some((item) => item.overflow)) {
    return true;
  }

  return config.items.length > displayedItemsAllowedAmount;
};

/**
 * Split the items into displayed and overflow based on the configuration.
 */
export const getAppMenuItems = ({
  config,
  hasStaticItems = false,
}: {
  config?: AppMenuConfig;
  hasStaticItems?: boolean;
}) => {
  if (!config || !config.items) {
    return {
      displayedItems: [],
      overflowItems: [],
      shouldOverflow: false,
    };
  }

  const displayedItemsAllowedAmount = getDisplayedItemsAllowedAmount(config, hasStaticItems);
  const shouldOverflow =
    getShouldOverflow({ config, displayedItemsAllowedAmount }) || hasStaticItems;

  const sortedItems = sortByOrder(config.items);
  const nonOverflowItems = sortedItems.filter((item) => !item.overflow);

  if (!shouldOverflow) {
    return {
      displayedItems: sortedItems,
      overflowItems: [],
      shouldOverflow: false,
    };
  }

  const displayedItems = nonOverflowItems.slice(0, displayedItemsAllowedAmount);
  const displayedItemsIdSet = new Set(displayedItems.map((item) => item.id));
  const overflowItems = sortedItems.filter((item) => !displayedItemsIdSet.has(item.id));

  return {
    displayedItems,
    overflowItems,
    shouldOverflow: overflowItems.length > 0,
  };
};

export const processStaticItems = (staticItems?: AppMenuItemType[]): AppMenuItemType[] =>
  sortByOrder(staticItems ?? []).map(({ separator, ...item }) => ({
    ...item,
    overflow: true,
  }));

export const hasNonGlobalStaticItems = (staticItems?: Array<{ global?: boolean }>): boolean =>
  !!staticItems?.some((item) => !item.global);

export const isDisabled = (disableButton: AppMenuItemCommon['disableButton']) =>
  Boolean(isFunction(disableButton) ? disableButton() : disableButton);

export const getTooltip = ({
  tooltipContent,
  tooltipTitle,
}: {
  tooltipContent?: AppMenuItemCommon['tooltipContent'];
  tooltipTitle?: AppMenuItemCommon['tooltipTitle'];
}) => {
  const content = isFunction(tooltipContent) ? tooltipContent() : tooltipContent;
  const title = isFunction(tooltipTitle) ? tooltipTitle() : tooltipTitle;

  return {
    title,
    content,
  };
};

export const createReturnFocus =
  (triggerElement: HTMLElement, parentElement?: HTMLElement) => () => {
    if (document.body.contains(triggerElement)) {
      triggerElement.focus();
      return;
    }
    // triggerElement is no longer in the DOM (e.g. it was inside a popover that closed).
    // Try the parent button that opened the popover first, then fall back to the overflow button.
    if (parentElement && document.body.contains(parentElement)) {
      parentElement.focus();
      return;
    }
    document
      .querySelector<HTMLElement>(`[data-test-subj="${APP_MENU_TEST_SUBJECTS.overflowButton}"]`)
      ?.focus();
  };

export const mapAppMenuItemToPanelItem = (
  item: AppMenuPopoverItem,
  childPanelId?: number,
  onClose?: () => void,
  onCloseOverflowButton?: () => void,
  anchorDomElement?: HTMLElement
): EuiContextMenuPanelItemDescriptor => {
  const { content, title } = getTooltip({
    tooltipContent: item?.tooltipContent,
    tooltipTitle: item?.tooltipTitle,
  });

  const handleClick = (event: MouseEvent) => {
    if (isDisabled(item?.disableButton)) {
      return;
    }

    const shouldClosePopover = childPanelId === undefined && onClose;

    const triggerElement = event.currentTarget as HTMLElement;
    item.run?.({
      triggerElement,
      returnFocus: createReturnFocus(triggerElement, anchorDomElement),
    });

    if (shouldClosePopover) {
      onClose();
      onCloseOverflowButton?.();
    }
  };

  const hasClickHandler = childPanelId === undefined;
  const routerLinkProps =
    item?.href && item?.run && hasClickHandler
      ? getRouterLinkProps({ href: item.href, onClick: handleClick })
      : { onClick: hasClickHandler ? handleClick : undefined };

  const itemTestSubj = item.testId ?? getAppMenuItemTestSubj(item.id);

  const itemName: ReactNode = item.labelBadgeText ? (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>{upperFirst(item.label)}</EuiFlexItem>
      <EuiFlexItem grow={false}>
        <AppMenuBadge text={item.labelBadgeText} data-test-subj={`${itemTestSubj}-badge`} />
      </EuiFlexItem>
    </EuiFlexGroup>
  ) : (
    upperFirst(item.label)
  );

  return {
    key: item.id,
    name: itemName,
    icon: item?.iconType,
    ...routerLinkProps,
    href: item?.href,
    target: item?.href ? item?.target : undefined,
    disabled: isDisabled(item?.disableButton),
    'data-test-subj': itemTestSubj,
    toolTipContent: content,
    toolTipProps: {
      title,
    },
    ...(childPanelId !== undefined && { panel: childPanelId }),
  };
};

const createSeparatorItem = (key: string): EuiContextMenuPanelItemDescriptor => ({
  isSeparator: true,
  key,
});

/**
 * Generate action items for the popover menu. This is only used below "m" breakpoint.
 */
export const getPopoverActionItems = ({
  primaryActionItem,
  onCloseOverflowButton,
}: {
  primaryActionItem?: AppMenuPrimaryActionItem;
  onCloseOverflowButton?: () => void;
}): EuiContextMenuPanelItemDescriptor[] => {
  if (!primaryActionItem) {
    return [];
  }

  const isHidden = (item: AppMenuPrimaryActionItem | undefined) => {
    if (!item) return true;

    const isHiddenInMobile =
      isArray(item?.hidden) &&
      // Check if any of the hidden values match mobile breakpoints
      (item.hidden.includes('m') || item.hidden.includes('s') || item.hidden.includes('xs'));

    return item?.hidden === 'all' || isHiddenInMobile;
  };

  if (isHidden(primaryActionItem)) {
    return [];
  }

  const separator = createSeparatorItem('action-items-separator');

  return [
    separator,
    {
      key: 'action-items',
      renderItem: () => (
        <AppMenuPopoverActionButtons
          primaryActionItem={primaryActionItem}
          onCloseOverflowButton={onCloseOverflowButton}
        />
      ),
    },
  ];
};

/**
 * Generate switch items for the popover menu. The switch is rendered as the very last item
 * with a separator above it.
 */
export const getPopoverSwitchItems = ({
  switchConfig,
}: {
  switchConfig: AppMenuSwitch;
}): EuiContextMenuPanelItemDescriptor[] => {
  const separator = createSeparatorItem('switch-separator');

  return [
    separator,
    {
      key: `switch-${switchConfig.id}`,
      renderItem: () => (
        <EuiSwitch
          id={switchConfig.id}
          label={switchConfig.label}
          labelProps={switchConfig.labelProps}
          checked={switchConfig.checked}
          onChange={(e) => switchConfig.onChange(e.target.checked)}
          compressed
          data-test-subj={switchConfig['data-test-subj'] ?? APP_MENU_TEST_SUBJECTS.switch}
        />
      ),
    },
  ];
};

/**
 * Recursively generate EUI context menu panels from the provided menu items.
 */
export const getPopoverPanels = ({
  items,
  staticItems,
  primaryActionItem,
  switchConfig,
  startPanelId = 0,
  rootPanelWidth = DEFAULT_POPOVER_WIDTH,
  rootPopoverTestId,
  onClose,
  onCloseOverflowButton,
  anchorDomElement,
}: {
  items: AppMenuPopoverItem[];
  staticItems?: AppMenuPopoverItem[];
  primaryActionItem?: AppMenuPrimaryActionItem;
  switchConfig?: AppMenuSwitch;
  startPanelId?: number;
  rootPanelWidth?: number;
  rootPopoverTestId?: string;
  onClose?: () => void;
  onCloseOverflowButton?: () => void;
  anchorDomElement?: HTMLElement;
}): EuiContextMenuPanelDescriptor[] => {
  const panels: EuiContextMenuPanelDescriptor[] = [];
  const hasActionItems = Boolean(primaryActionItem);
  const hasSwitchItem = Boolean(switchConfig);
  let currentPanelId = startPanelId;

  const processItems = ({
    itemsToProcess,
    panelId,
    parentTitle,
    parentPopoverTestId,
    parentPopoverWidth,
  }: {
    itemsToProcess: AppMenuPopoverItem[];
    panelId: number;
    parentTitle?: string;
    parentPopoverTestId?: string;
    parentPopoverWidth?: number;
  }) => {
    const panelItems: EuiContextMenuPanelItemDescriptor[] = [];

    const sortedItems = [...itemsToProcess].sort((a, b) => a.order - b.order);

    sortedItems.forEach((item) => {
      if (item.separator === 'above') {
        panelItems.push(createSeparatorItem(`separator-${item.id}`));
      }

      if (item.items && item.items.length > 0) {
        currentPanelId++;
        const childPanelId = currentPanelId;

        // popoverWidth may exist on items that are AppMenuItemType (e.g., overflow items)
        const itemPopoverWidth =
          'popoverWidth' in item ? (item as { popoverWidth?: number }).popoverWidth : undefined;
        processItems({
          itemsToProcess: item.items,
          panelId: childPanelId,
          parentTitle: item.label,
          parentPopoverTestId: item.popoverTestId,
          parentPopoverWidth: itemPopoverWidth ?? DEFAULT_POPOVER_WIDTH,
        });
        panelItems.push(
          mapAppMenuItemToPanelItem(
            item,
            childPanelId,
            onClose,
            onCloseOverflowButton,
            anchorDomElement
          )
        );
      } else {
        panelItems.push(
          mapAppMenuItemToPanelItem(
            item,
            undefined,
            onClose,
            onCloseOverflowButton,
            anchorDomElement
          )
        );
      }

      if (item.separator === 'below') {
        panelItems.push(createSeparatorItem(`separator-${item.id}`));
      }
    });

    panels.push({
      id: panelId,
      ...(parentTitle && { title: upperFirst(parentTitle) }),
      ...(parentPopoverTestId && { 'data-test-subj': parentPopoverTestId }),
      ...(parentPopoverWidth && { width: parentPopoverWidth }),
      items: panelItems,
    });
  };

  processItems({
    itemsToProcess: items,
    panelId: startPanelId,
    parentPopoverTestId: rootPopoverTestId,
    parentPopoverWidth: rootPanelWidth,
  });

  /**
   * Static items are appended to the main panel after the sorted regular items,
   * preserving their own order without being re-sorted with regular items.
   */
  if (staticItems && staticItems.length > 0) {
    const staticPanelId = -1;
    processItems({
      itemsToProcess: staticItems,
      panelId: staticPanelId,
    });

    const staticPanel = panels.find((panel) => panel.id === staticPanelId);
    const mainPanel = panels.find((panel) => panel.id === startPanelId);

    if (staticPanel && mainPanel) {
      const mainItems = mainPanel.items as EuiContextMenuPanelItemDescriptor[];
      const staticPanelItems = staticPanel.items as EuiContextMenuPanelItemDescriptor[];

      // Only add a separator between regular and static items
      const separator = mainItems.length > 0 ? [createSeparatorItem('static-items-separator')] : [];

      mainPanel.items = [...mainItems, ...separator, ...staticPanelItems];
      panels.splice(panels.indexOf(staticPanel), 1);
    }
  }

  /**
   * Action items are only added to the main panel and only in lower breakpoints (below "m").
   * They should not be available to be added via config.
   */
  const mainPanel = panels.find((panel) => panel.id === startPanelId);

  if (!mainPanel) return panels;

  if (hasActionItems) {
    const actionItems: EuiContextMenuPanelItemDescriptor[] = getPopoverActionItems({
      primaryActionItem,
      onCloseOverflowButton: onClose,
    });

    mainPanel.items = [...(mainPanel.items as EuiContextMenuPanelItemDescriptor[]), ...actionItems];
  }

  if (hasSwitchItem && switchConfig) {
    const switchItems = getPopoverSwitchItems({ switchConfig });

    mainPanel.items = [...(mainPanel.items as EuiContextMenuPanelItemDescriptor[]), ...switchItems];
  }

  return panels;
};

/**
 * Get the background color for a button associated when popover is open.
 */
export const getIsSelectedColor = ({
  color,
  euiTheme,
  isFilled,
}: {
  color: EuiButtonColor;
  euiTheme: EuiThemeComputed;
  isFilled: boolean;
}) => {
  /**
   * Construct the color key based on whether the button is filled or empty e.g. backgroundFilledPrimaryHover.
   */
  const colorKey = `background${isFilled ? 'Filled' : 'Empty'}${upperFirst(
    color
  )}Hover` as keyof typeof euiTheme.components.buttons;

  return euiTheme.components.buttons[colorKey] || euiTheme.colors.backgroundBaseInteractiveHover;
};
