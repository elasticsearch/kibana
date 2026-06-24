/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AppMenuRegistry } from './app_menu_registry';
import type { DiscoverAppMenuItemType, DiscoverAppMenuPopoverItem } from '../../types';

describe('AppMenuRegistry', () => {
  let registry: AppMenuRegistry;

  beforeEach(() => {
    registry = new AppMenuRegistry();
  });

  describe('registerItem', () => {
    it('should register a single menu item', () => {
      const item: DiscoverAppMenuItemType = {
        id: 'test-item',
        order: 1,
        label: 'Test Item',
        iconType: 'magnify',
        testId: 'testItem',
        run: jest.fn(),
      };

      registry.registerItem(item);

      const config = registry.getAppMenuConfig();
      expect(config.items).toHaveLength(1);
      expect(config.items?.[0]).toEqual(item);
    });

    it('should update an existing item with the same ID', () => {
      const item1: DiscoverAppMenuItemType = {
        id: 'test-item',
        order: 1,
        label: 'Test Item 1',
        iconType: 'magnify',
        run: jest.fn(),
      };

      const item2: DiscoverAppMenuItemType = {
        id: 'test-item',
        order: 2,
        label: 'Test Item 2',
        iconType: 'bell',
        run: jest.fn(),
      };

      registry.registerItem(item1);
      registry.registerItem(item2);

      const config = registry.getAppMenuConfig();
      expect(config.items).toHaveLength(1);
      expect(config.items?.[0]).toEqual(item2);
    });
  });

  describe('registerItems', () => {
    it('should register multiple items at once', () => {
      const items: DiscoverAppMenuItemType[] = [
        {
          id: 'item-1',
          order: 1,
          label: 'Item 1',
          iconType: 'magnify',
          run: jest.fn(),
        },
        {
          id: 'item-2',
          order: 2,
          label: 'Item 2',
          iconType: 'warning',
          run: jest.fn(),
        },
        {
          id: 'item-3',
          order: 3,
          label: 'Item 3',
          iconType: 'bell',
          run: jest.fn(),
        },
      ];

      registry.registerItems(items);

      const config = registry.getAppMenuConfig();
      expect(config.items).toHaveLength(3);
    });
  });

  describe('setPrimaryActionItem', () => {
    it('should set the primary action item', () => {
      const primaryItem = {
        id: 'primary',
        label: 'Primary',
        iconType: 'save',
        run: jest.fn(),
        testId: 'primaryButton',
      };

      registry.setPrimaryActionItem(primaryItem);

      const config = registry.getAppMenuConfig();
      expect(config.primaryActionItem).toEqual(primaryItem);
    });

    it('should allow updating the primary action item', () => {
      const primaryItem1 = {
        id: 'primary',
        label: 'Primary 1',
        iconType: 'save',
        run: jest.fn(),
      };

      const primaryItem2 = {
        id: 'primary',
        label: 'Primary 2',
        iconType: 'save',
        run: jest.fn(),
      };

      registry.setPrimaryActionItem(primaryItem1);
      registry.setPrimaryActionItem(primaryItem2);

      const config = registry.getAppMenuConfig();
      expect(config.primaryActionItem).toEqual(primaryItem2);
    });
  });

  describe('registerPopoverItem', () => {
    it('should register a popover item under a parent menu item', () => {
      const parentItem: DiscoverAppMenuItemType = {
        id: 'parent',
        order: 1,
        label: 'Parent',
        iconType: 'warning',
        items: [],
      };

      const popoverItem: DiscoverAppMenuPopoverItem = {
        id: 'child-1',
        order: 1,
        label: 'Child 1',
        iconType: 'bell',
        run: jest.fn(),
      };

      registry.registerItem(parentItem);
      registry.registerPopoverItem('parent', popoverItem);

      const config = registry.getAppMenuConfig();
      const parent = config.items?.find((item) => item.id === 'parent');

      expect(parent?.items).toBeDefined();
      expect(parent?.items).toHaveLength(1);
      expect(parent?.items?.[0]).toEqual(popoverItem);
    });

    it('should convert an action parent into a submenu item', () => {
      const parentItem: DiscoverAppMenuItemType = {
        id: 'parent',
        order: 1,
        label: 'Parent',
        iconType: 'warning',
        href: '/parent',
        run: jest.fn(),
      };

      const popoverItem: DiscoverAppMenuPopoverItem = {
        id: 'child-1',
        order: 1,
        label: 'Child 1',
        iconType: 'bell',
        run: jest.fn(),
      };

      registry.registerItem(parentItem);
      registry.registerPopoverItem('parent', popoverItem);

      const config = registry.getAppMenuConfig();
      const parent = config.items?.find((item) => item.id === 'parent');

      expect(parent).toEqual({
        id: 'parent',
        order: 1,
        label: 'Parent',
        iconType: 'warning',
        items: [popoverItem],
      });
    });
  });

  describe('getPopoverItems', () => {
    it('should return popover items registered under a parent menu item', () => {
      const parentItem: DiscoverAppMenuItemType = {
        id: 'parent',
        order: 1,
        label: 'Parent',
        iconType: 'warning',
        items: [],
      };

      const popoverItem: DiscoverAppMenuPopoverItem = {
        id: 'child-1',
        order: 1,
        label: 'Child 1',
        iconType: 'bell',
        run: jest.fn(),
      };

      registry.registerItem(parentItem);
      registry.registerPopoverItem('parent', popoverItem);

      expect(registry.getPopoverItems('parent')).toEqual([popoverItem]);
    });

    it('should return an empty array when the parent menu item does not exist', () => {
      expect(registry.getPopoverItems('missing-parent')).toEqual([]);
    });

    it('should return a copy of the registered popover items', () => {
      const parentItem: DiscoverAppMenuItemType = {
        id: 'parent',
        order: 1,
        label: 'Parent',
        iconType: 'warning',
        items: [],
      };

      const popoverItem: DiscoverAppMenuPopoverItem = {
        id: 'child-1',
        order: 1,
        label: 'Child 1',
        iconType: 'bell',
        run: jest.fn(),
      };

      registry.registerItem(parentItem);
      registry.registerPopoverItem('parent', popoverItem);

      const popoverItems = registry.getPopoverItems('parent');
      popoverItems.push({
        id: 'child-2',
        order: 2,
        label: 'Child 2',
        iconType: 'bell',
        run: jest.fn(),
      });

      expect(registry.getPopoverItems('parent')).toEqual([popoverItem]);
    });
  });

  describe('getItem', () => {
    it('should return a registered menu item', () => {
      const item: DiscoverAppMenuItemType = {
        id: 'test-item',
        order: 1,
        label: 'Test Item',
        iconType: 'magnify',
        run: jest.fn(),
      };

      registry.registerItem(item);

      expect(registry.getItem('test-item')).toEqual(item);
    });

    it('should return undefined when the menu item does not exist', () => {
      expect(registry.getItem('missing-item')).toBeUndefined();
    });

    it('should return a copy of nested popover items', () => {
      const parentItem: DiscoverAppMenuItemType = {
        id: 'parent',
        order: 1,
        label: 'Parent',
        iconType: 'warning',
        items: [],
      };

      const popoverItem: DiscoverAppMenuPopoverItem = {
        id: 'child-1',
        order: 1,
        label: 'Child 1',
        iconType: 'bell',
        run: jest.fn(),
      };

      registry.registerItem(parentItem);
      registry.registerPopoverItem('parent', popoverItem);

      const item = registry.getItem('parent');
      item?.items?.push({
        id: 'child-2',
        order: 2,
        label: 'Child 2',
        iconType: 'bell',
        run: jest.fn(),
      });

      expect(registry.getItem('parent')?.items).toEqual([popoverItem]);
    });
  });

  describe('registerCustomItem', () => {
    it('should register a custom menu item', () => {
      const customItem: DiscoverAppMenuItemType = {
        id: 'custom-item',
        order: 1,
        label: 'Custom Item',
        iconType: 'flask',
        testId: 'customItem',
        run: jest.fn(),
      };

      registry.registerCustomItem(customItem);

      const config = registry.getAppMenuConfig();
      expect(config.items).toHaveLength(1);
      expect(config.items?.[0]).toEqual(customItem);
    });

    it('should update an existing custom item with the same ID', () => {
      const customItem1: DiscoverAppMenuItemType = {
        id: 'custom-item',
        order: 1,
        label: 'Custom Item 1',
        iconType: 'flask',
        run: jest.fn(),
      };

      const customItem2: DiscoverAppMenuItemType = {
        id: 'custom-item',
        order: 2,
        label: 'Custom Item 2',
        iconType: 'bolt',
        run: jest.fn(),
      };

      registry.registerCustomItem(customItem1);
      registry.registerCustomItem(customItem2);

      const config = registry.getAppMenuConfig();
      expect(config.items).toHaveLength(1);
      expect(config.items?.[0]).toEqual(customItem2);
    });

    it('should limit custom items to CUSTOM_ITEMS_LIMIT', () => {
      const customItem1: DiscoverAppMenuItemType = {
        id: 'custom-1',
        order: 1,
        label: 'Custom 1',
        iconType: 'flask',
        run: jest.fn(),
      };

      const customItem2: DiscoverAppMenuItemType = {
        id: 'custom-2',
        order: 2,
        label: 'Custom 2',
        iconType: 'bolt',
        run: jest.fn(),
      };

      const customItem3: DiscoverAppMenuItemType = {
        id: 'custom-3',
        order: 3,
        label: 'Custom 3',
        iconType: 'brush',
        run: jest.fn(),
      };

      registry.registerCustomItem(customItem1);
      registry.registerCustomItem(customItem2);
      registry.registerCustomItem(customItem3);

      const config = registry.getAppMenuConfig();
      // Should only include the first 2 items due to CUSTOM_ITEMS_LIMIT
      expect(config.items).toHaveLength(AppMenuRegistry.CUSTOM_ITEMS_LIMIT);
      expect(config.items?.[0].id).toBe('custom-1');
      expect(config.items?.[1].id).toBe('custom-2');
    });

    it('should merge custom items with regular items', () => {
      const regularItem: DiscoverAppMenuItemType = {
        id: 'regular-item',
        order: 2,
        label: 'Regular Item',
        iconType: 'magnify',
        run: jest.fn(),
      };

      const customItem: DiscoverAppMenuItemType = {
        id: 'custom-item',
        order: 1,
        label: 'Custom Item',
        iconType: 'flask',
        run: jest.fn(),
      };

      registry.registerItem(regularItem);
      registry.registerCustomItem(customItem);

      const config = registry.getAppMenuConfig();
      expect(config.items).toHaveLength(2);
    });
  });

  describe('registerPopoverItem with custom items', () => {
    it('should register a popover item under a custom parent menu item', () => {
      const parentItem: DiscoverAppMenuItemType = {
        id: 'custom-parent',
        order: 1,
        label: 'Custom Parent',
        iconType: 'flask',
        items: [],
      };

      const popoverItem: DiscoverAppMenuPopoverItem = {
        id: 'custom-child-1',
        order: 1,
        label: 'Custom Child 1',
        iconType: 'bell',
        run: jest.fn(),
      };

      registry.registerCustomItem(parentItem);
      registry.registerPopoverItem('custom-parent', popoverItem);

      const config = registry.getAppMenuConfig();
      const parent = config.items?.find((item) => item.id === 'custom-parent');

      expect(parent?.items).toBeDefined();
      expect(parent?.items).toHaveLength(1);
      expect(parent?.items?.[0]).toEqual(popoverItem);
    });

    it('should handle registering custom popover items before parent exists', () => {
      const popoverItem: DiscoverAppMenuPopoverItem = {
        id: 'custom-child-1',
        order: 1,
        label: 'Custom Child 1',
        run: jest.fn(),
      };

      // Register popover item first
      registry.registerPopoverItem('custom-parent', popoverItem);

      const parentItem: DiscoverAppMenuItemType = {
        id: 'custom-parent',
        order: 1,
        label: 'Custom Parent',
        iconType: 'flask',
        items: [],
      };

      // Then register parent
      registry.registerCustomItem(parentItem);

      const config = registry.getAppMenuConfig();
      const parent = config.items?.find((item) => item.id === 'custom-parent');

      // The second registerCustomItem should overwrite the parent, losing the popover items
      expect(parent?.items).toEqual([]);
    });

    it('should handle multiple custom popover items with same order', () => {
      const parentItem: DiscoverAppMenuItemType = {
        id: 'custom-parent',
        order: 1,
        label: 'Custom Parent',
        iconType: 'flask',
        items: [],
      };

      const popoverItem1: DiscoverAppMenuPopoverItem = {
        id: 'custom-child-1',
        label: 'Custom Child 1',
        order: 1,
        run: jest.fn(),
      };

      const popoverItem2: DiscoverAppMenuPopoverItem = {
        id: 'custom-child-2',
        label: 'Custom Child 2',
        order: 1,
        run: jest.fn(),
      };

      registry.registerCustomItem(parentItem);
      registry.registerPopoverItem('custom-parent', popoverItem1);
      registry.registerPopoverItem('custom-parent', popoverItem2);

      const config = registry.getAppMenuConfig();
      const parent = config.items?.find((item) => item.id === 'custom-parent');

      expect(parent?.items).toHaveLength(2);
      // Both items have same order, so they should maintain insertion order
      expect(parent?.items?.[0].id).toBe('custom-child-1');
      expect(parent?.items?.[1].id).toBe('custom-child-2');
    });
  });

  describe('getAppMenuConfig', () => {
    it('should return complete AppMenuConfig with all components', () => {
      const item1: DiscoverAppMenuItemType = {
        id: 'item-1',
        order: 1,
        label: 'Item 1',
        iconType: 'magnify',
        run: jest.fn(),
      };

      const item2: DiscoverAppMenuItemType = {
        id: 'item-2',
        order: 2,
        label: 'Item 2',
        iconType: 'share',
        items: [],
      };

      const popoverItem: DiscoverAppMenuPopoverItem = {
        id: 'popover-1',
        order: 1,
        label: 'Popover 1',
        run: jest.fn(),
      };

      const primaryItem = {
        id: 'primary',
        label: 'Save',
        iconType: 'save',
        run: jest.fn(),
      };

      registry.registerItems([item1, item2]);
      registry.registerPopoverItem('item-2', popoverItem);
      registry.setPrimaryActionItem(primaryItem);

      const config = registry.getAppMenuConfig();

      expect(config.items).toHaveLength(2);
      expect(config.primaryActionItem).toEqual(primaryItem);

      const item2Config = config.items?.find((item) => item.id === 'item-2');
      expect(item2Config?.items).toHaveLength(1);
    });

    it('should return empty items array when no items registered', () => {
      const config = registry.getAppMenuConfig();

      expect(config.items).toEqual([]);
      expect(config.primaryActionItem).toBeUndefined();
    });

    it('should include both regular and custom items', () => {
      const regularItem: DiscoverAppMenuItemType = {
        id: 'regular',
        order: 2,
        label: 'Regular',
        iconType: 'magnify',
        run: jest.fn(),
      };

      const customItem: DiscoverAppMenuItemType = {
        id: 'custom',
        order: 1,
        label: 'Custom',
        iconType: 'flask',
        run: jest.fn(),
      };

      registry.registerItem(regularItem);
      registry.registerCustomItem(customItem);

      const config = registry.getAppMenuConfig();

      expect(config.items).toHaveLength(2);
    });
  });
});
