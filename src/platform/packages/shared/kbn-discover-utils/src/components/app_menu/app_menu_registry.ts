/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  DiscoverAppMenuConfig,
  DiscoverAppMenuItemType,
  DiscoverAppMenuPopoverItem,
  DiscoverAppMenuPrimaryActionItem,
} from '../../types';

/**
 * Registry for managing AppMenuConfig items with Discover-specific types.
 * All run actions automatically receive DiscoverAppMenuRunActionParams with guaranteed onFinishAction.
 */
export class AppMenuRegistry {
  static CUSTOM_ITEMS_LIMIT = 2;
  private items: Map<string, DiscoverAppMenuItemType & { isCustom?: boolean }> = new Map();
  private primaryActionItem?: DiscoverAppMenuPrimaryActionItem;

  /**
   * Register a custom menu item.
   * @param item The menu item to register
   */
  public registerCustomItem(item: DiscoverAppMenuItemType) {
    this.items.set(item.id, { ...item, isCustom: true });
  }

  /**
   * Register a menu item.
   * @param item The menu item to register
   */
  public registerItem(item: DiscoverAppMenuItemType) {
    this.items.set(item.id, { ...item, isCustom: false });
  }

  /**
   * Register multiple menu items at once.
   * @param items Array of menu items to register
   */
  public registerItems(items: DiscoverAppMenuItemType[]) {
    items.forEach((item) => this.registerItem(item));
  }

  /**
   * Set the primary action item for the app menu.
   * @param item The primary action item
   */
  public setPrimaryActionItem(item: DiscoverAppMenuPrimaryActionItem) {
    this.primaryActionItem = item;
  }

  /**
   * Register a popover item for a specific parent menu item.
   * @param parentId The ID of the parent menu item
   * @param popoverItem The popover item to register
   */
  public registerPopoverItem(parentId: string, popoverItem: DiscoverAppMenuPopoverItem) {
    const parent = this.items.get(parentId);
    if (parent) {
      const { href, render, run, target, ...parentSubmenuItem } = parent;

      this.items.set(parentId, {
        ...parentSubmenuItem,
        items: [...(parent.items || []), popoverItem],
      });
    }
  }

  /**
   * Get popover items registered under a parent menu item.
   * Returns a copy so callers cannot mutate registry state.
   * @param parentId The ID of the parent menu item
   */
  public getPopoverItems(parentId: string): DiscoverAppMenuPopoverItem[] {
    return [...(this.items.get(parentId)?.items ?? [])];
  }

  /**
   * Get a registered menu item by ID.
   * Returns a copy of nested popover items so callers cannot mutate registry state.
   * @param id The ID of the menu item
   */
  public getItem(id: string): DiscoverAppMenuItemType | undefined {
    const item = this.items.get(id);
    if (!item) {
      return undefined;
    }

    const { isCustom, ...menuItem } = item;
    return menuItem.items ? { ...menuItem, items: [...menuItem.items] } : menuItem;
  }

  /**
   * Get the complete AppMenuConfig.
   * Items with registered popover items will have their items property populated.
   */
  public getAppMenuConfig(): DiscoverAppMenuConfig {
    const allItems = Array.from(this.items.values());
    const regularItems = allItems.filter((item) => !item.isCustom);
    const customItems = allItems
      .filter((item) => item.isCustom)
      .slice(0, AppMenuRegistry.CUSTOM_ITEMS_LIMIT);

    const cleanItems = [...regularItems, ...customItems].map(({ isCustom, ...item }) => item);

    return {
      items: cleanItems,
      primaryActionItem: this.primaryActionItem,
    };
  }
}
