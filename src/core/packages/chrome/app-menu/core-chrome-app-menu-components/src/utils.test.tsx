/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiThemeComputed } from '@elastic/eui';
import {
  createReturnFocus,
  getDisplayedItemsAllowedAmount,
  getShouldOverflow,
  getAppMenuItems,
  mapAppMenuItemToPanelItem,
  getPopoverActionItems,
  getPopoverSwitchItems,
  getPopoverPanels,
  getIsSelectedColor,
  processStaticItems,
} from './utils';
import { APP_MENU_ITEM_LIMIT } from './constants';
import { APP_MENU_TEST_SUBJECTS } from './test_subjects';
import type { AppMenuItemType, AppMenuPopoverItem, AppMenuSwitch } from './types';

describe('utils', () => {
  describe('createReturnFocus', () => {
    let triggerElement: HTMLButtonElement;
    let overflowButton: HTMLButtonElement;

    beforeEach(() => {
      triggerElement = document.createElement('button');
      overflowButton = document.createElement('button');
      overflowButton.setAttribute('data-test-subj', APP_MENU_TEST_SUBJECTS.overflowButton);
    });

    afterEach(() => {
      triggerElement.remove();
      overflowButton.remove();
    });

    it('should focuse the trigger element when it is still in the DOM', () => {
      document.body.appendChild(triggerElement);
      const returnFocus = createReturnFocus(triggerElement);
      returnFocus();
      expect(document.activeElement).toBe(triggerElement);
    });

    it('should focuse the parent element when the trigger has been removed but the parent is still in the DOM', () => {
      const parentElement = document.createElement('button');
      document.body.appendChild(parentElement);
      // triggerElement is NOT appended — simulates a popover item that was unmounted
      const returnFocus = createReturnFocus(triggerElement, parentElement);
      returnFocus();
      expect(document.activeElement).toBe(parentElement);
      parentElement.remove();
    });

    it('should focuse the overflow button when both trigger and parent element have been removed from the DOM', () => {
      // neither triggerElement nor parentElement is appended
      document.body.appendChild(overflowButton);
      const parentElement = document.createElement('button');
      const returnFocus = createReturnFocus(triggerElement, parentElement);
      returnFocus();
      expect(document.activeElement).toBe(overflowButton);
    });

    it('should focuse the overflow button when the trigger element has been removed from the DOM', () => {
      // triggerElement is NOT appended — simulates a popover item that was unmounted
      document.body.appendChild(overflowButton);
      const returnFocus = createReturnFocus(triggerElement);
      returnFocus();
      expect(document.activeElement).toBe(overflowButton);
    });
  });

  describe('getDisplayedItemsAllowedAmount', () => {
    it('should return full limit when items fit within limit', () => {
      const result = getDisplayedItemsAllowedAmount({
        items: [
          { id: '1', label: 'Item 1', run: jest.fn(), iconType: 'gear', order: 1 },
          { id: '2', label: 'Item 2', run: jest.fn(), iconType: 'gear', order: 2 },
        ],
      });

      expect(result).toBe(APP_MENU_ITEM_LIMIT);
    });

    it('should return full limit when no items', () => {
      const result = getDisplayedItemsAllowedAmount({});

      expect(result).toBe(APP_MENU_ITEM_LIMIT);
    });

    it('should reserve one slot for overflow when items exceed limit', () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        label: `Item ${i}`,
        run: jest.fn(),
        iconType: 'gear' as const,
        order: i,
      }));

      const result = getDisplayedItemsAllowedAmount({ items });

      expect(result).toBe(APP_MENU_ITEM_LIMIT - 1);
    });

    it('should reserve one slot when any item is marked as overflow', () => {
      const result = getDisplayedItemsAllowedAmount({
        items: [
          { id: '1', label: 'Item 1', run: jest.fn(), iconType: 'gear', order: 1 },
          {
            id: '2',
            label: 'Item 2',
            run: jest.fn(),
            iconType: 'gear',
            order: 2,
            overflow: true,
          },
        ],
      });

      expect(result).toBe(APP_MENU_ITEM_LIMIT - 1);
    });

    it('should not be affected by primaryActionItem', () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        label: `Item ${i}`,
        run: jest.fn(),
        iconType: 'gear' as const,
        order: i,
      }));

      const result = getDisplayedItemsAllowedAmount({
        items,
        primaryActionItem: { id: 'save', label: 'Save', run: jest.fn(), iconType: 'save' },
      });

      expect(result).toBe(APP_MENU_ITEM_LIMIT - 1);
    });
  });

  describe('getShouldOverflow', () => {
    it('should return false when config has no items', () => {
      const result = getShouldOverflow({
        config: {},
        displayedItemsAllowedAmount: 5,
      });

      expect(result).toBe(false);
    });

    it('should return false when items count is less than allowed amount', () => {
      const result = getShouldOverflow({
        config: {
          items: [
            { id: '1', label: 'Item 1', run: jest.fn(), iconType: 'gear', order: 1 },
            { id: '2', label: 'Item 2', run: jest.fn(), iconType: 'gear', order: 2 },
          ],
        },
        displayedItemsAllowedAmount: 5,
      });

      expect(result).toBe(false);
    });

    it('should return false when items count equals allowed amount', () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        label: `Item ${i}`,
        run: jest.fn(),
        iconType: 'gear' as const,
        order: i,
      }));

      const result = getShouldOverflow({
        config: { items },
        displayedItemsAllowedAmount: 5,
      });

      expect(result).toBe(false);
    });

    it('should return true when items count exceeds allowed amount', () => {
      const items = Array.from({ length: 6 }, (_, i) => ({
        id: `${i}`,
        label: `Item ${i}`,
        run: jest.fn(),
        iconType: 'gear' as const,
        order: i,
      }));

      const result = getShouldOverflow({
        config: { items },
        displayedItemsAllowedAmount: 5,
      });

      expect(result).toBe(true);
    });

    it('should return true when an item is marked as overflow', () => {
      const result = getShouldOverflow({
        config: {
          items: [
            { id: '1', label: 'Item 1', run: jest.fn(), iconType: 'gear', order: 1 },
            {
              id: '2',
              label: 'Item 2',
              run: jest.fn(),
              iconType: 'gear',
              order: 2,
              overflow: true,
            },
          ],
        },
        displayedItemsAllowedAmount: 5,
      });

      expect(result).toBe(true);
    });
  });

  describe('getAppMenuItems', () => {
    it('should return empty arrays when config has no items', () => {
      const result = getAppMenuItems({ config: {} });

      expect(result).toEqual({
        displayedItems: [],
        overflowItems: [],
        shouldOverflow: false,
      });
    });

    it('should return all items as displayed when under limit', () => {
      const items = [
        { id: '1', label: 'Item 1', run: jest.fn(), iconType: 'gear' as const, order: 1 },
        { id: '2', label: 'Item 2', run: jest.fn(), iconType: 'gear' as const, order: 2 },
      ];

      const result = getAppMenuItems({ config: { items } });

      expect(result.displayedItems).toHaveLength(2);
      expect(result.overflowItems).toHaveLength(0);
      expect(result.shouldOverflow).toBe(false);
    });

    it('should sort items by order', () => {
      const items = [
        { id: '3', label: 'Item 3', run: jest.fn(), iconType: 'gear' as const, order: 3 },
        { id: '1', label: 'Item 1', run: jest.fn(), iconType: 'gear' as const, order: 1 },
        { id: '2', label: 'Item 2', run: jest.fn(), iconType: 'gear' as const, order: 2 },
      ];

      const result = getAppMenuItems({ config: { items } });

      expect(result.displayedItems[0].id).toBe('1');
      expect(result.displayedItems[1].id).toBe('2');
      expect(result.displayedItems[2].id).toBe('3');
    });

    it('should split items into displayed and overflow when exceeding limit', () => {
      const items = Array.from({ length: 7 }, (_, i) => ({
        id: `${i}`,
        label: `Item ${i}`,
        run: jest.fn(),
        iconType: 'gear' as const,
        order: i,
      }));

      const result = getAppMenuItems({ config: { items } });

      // limit - 1 items shown, rest overflow
      expect(result.displayedItems).toHaveLength(APP_MENU_ITEM_LIMIT - 1);
      expect(result.overflowItems).toHaveLength(5);
      expect(result.shouldOverflow).toBe(true);
    });

    it('should show all items when exactly at limit', () => {
      const items = Array.from({ length: APP_MENU_ITEM_LIMIT }, (_, i) => ({
        id: `${i}`,
        label: `Item ${i}`,
        run: jest.fn(),
        iconType: 'gear' as const,
        order: i,
      }));

      const result = getAppMenuItems({ config: { items } });

      expect(result.displayedItems).toHaveLength(APP_MENU_ITEM_LIMIT);
      expect(result.overflowItems).toHaveLength(0);
      expect(result.shouldOverflow).toBe(false);
    });

    it('should not be affected by primaryActionItem presence', () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        label: `Item ${i}`,
        run: jest.fn(),
        iconType: 'gear' as const,
        order: i,
      }));

      const result = getAppMenuItems({
        config: {
          items,
          primaryActionItem: { id: 'save', label: 'Save', run: jest.fn(), iconType: 'save' },
        },
      });

      // Same as without primary action: limit - 1 items shown
      expect(result.displayedItems).toHaveLength(APP_MENU_ITEM_LIMIT - 1);
      expect(result.overflowItems).toHaveLength(3);
      expect(result.shouldOverflow).toBe(true);
    });

    it('should move forced overflow items to overflow even when under limit', () => {
      const items = [
        {
          id: 'hiddenUnderOverflow',
          label: 'Hidden under overflow',
          run: jest.fn(),
          iconType: 'gear' as const,
          order: 1,
          overflow: true,
        },
      ];

      const result = getAppMenuItems({ config: { items } });

      expect(result.displayedItems).toHaveLength(0);
      expect(result.overflowItems).toHaveLength(1);
      expect(result.overflowItems[0].id).toBe('hiddenUnderOverflow');
      expect(result.shouldOverflow).toBe(true);
    });

    it('should preserve order across displayed and overflow items', () => {
      const items = [
        {
          id: 'third',
          label: 'Third',
          run: jest.fn(),
          iconType: 'gear' as const,
          order: 3,
        },
        {
          id: 'firstForced',
          label: 'First forced',
          run: jest.fn(),
          iconType: 'gear' as const,
          order: 1,
          overflow: true,
        },
        {
          id: 'second',
          label: 'Second',
          run: jest.fn(),
          iconType: 'gear' as const,
          order: 2,
        },
      ];

      const result = getAppMenuItems({ config: { items } });

      expect(result.displayedItems.map((item) => item.id)).toEqual(['second', 'third']);
      expect(result.overflowItems.map((item) => item.id)).toEqual(['firstForced']);
      expect(result.shouldOverflow).toBe(true);
    });
  });

  describe('mapAppMenuItemToPanelItem', () => {
    const baseItem: AppMenuPopoverItem = {
      id: 'test',
      label: 'test item',
      run: jest.fn(),
      order: 1,
    };

    it('should capitalize label', () => {
      const item = { ...baseItem, label: 'my label' };
      const result = mapAppMenuItemToPanelItem(item);

      expect(result.name).toBe('My label');
    });

    it('should include icon when provided', () => {
      const item = { ...baseItem, iconType: 'gear' as const };
      const result = mapAppMenuItemToPanelItem(item);

      expect(result.icon).toBe('gear');
    });

    it('should set onClick handler when no href or childPanelId', () => {
      const result = mapAppMenuItemToPanelItem(baseItem);

      expect(result.onClick).toBeDefined();
    });

    it('should not set onClick when childPanelId is provided', () => {
      const result = mapAppMenuItemToPanelItem(baseItem, 1);

      expect(result.onClick).toBeUndefined();
      expect(result.panel).toBe(1);
    });

    it('should set target when href is provided', () => {
      const item = { ...baseItem, href: 'http://example.com', target: '_blank' };
      const result = mapAppMenuItemToPanelItem(item);

      expect(result.target).toBe('_blank');
    });

    it('should not set target when no href', () => {
      const item = { ...baseItem, target: '_blank' };
      const result = mapAppMenuItemToPanelItem(item);

      expect(result.target).toBeUndefined();
    });

    it('should set disabled state', () => {
      const item = { ...baseItem, disableButton: true };
      const result = mapAppMenuItemToPanelItem(item);

      expect(result.disabled).toBe(true);
    });

    it('should include testId as data-test-subj', () => {
      const item = { ...baseItem, testId: 'my-test-id' };
      const result = mapAppMenuItemToPanelItem(item);

      expect(result['data-test-subj']).toBe('my-test-id');
    });

    it('should include tooltip content and title', () => {
      const item = { ...baseItem, tooltipContent: 'Content', tooltipTitle: 'Title' };
      const result = mapAppMenuItemToPanelItem(item);

      expect(result.toolTipContent).toBe('Content');
      expect(result.toolTipProps?.title).toBe('Title');
    });
  });

  describe('getPopoverActionItems', () => {
    it('should return empty array when no action items provided', () => {
      const result = getPopoverActionItems({});

      expect(result).toEqual([]);
    });

    it('should return items with separator when primary action item is provided', () => {
      const result = getPopoverActionItems({
        primaryActionItem: { id: 'save', label: 'Save', run: jest.fn(), iconType: 'save' },
      });

      expect(result).toHaveLength(2);
      expect(result[0].isSeparator).toBe(true);
      expect(result[1].key).toBe('action-items');
    });

    it('should return empty array when both items are hidden with "all"', () => {
      const result = getPopoverActionItems({
        primaryActionItem: {
          id: 'save',
          label: 'Save',
          run: jest.fn(),
          iconType: 'save',
          hidden: 'all',
        },
      });

      expect(result).toEqual([]);
    });

    it('should return items when hidden at non-mobile breakpoints only', () => {
      const result = getPopoverActionItems({
        primaryActionItem: {
          id: 'save',
          label: 'Save',
          run: jest.fn(),
          iconType: 'save',
          hidden: ['xl'],
        },
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('getPopoverSwitchItems', () => {
    const defaultSwitch: AppMenuSwitch = {
      id: 'test-switch',
      label: 'Test switch',
      labelProps: {},
      checked: false,
      onChange: jest.fn(),
    };

    it('should return a separator and a switch item', () => {
      const result = getPopoverSwitchItems({ switchConfig: defaultSwitch });

      expect(result).toHaveLength(2);
      expect(result[0].isSeparator).toBe(true);
      expect(result[0].key).toBe('switch-separator');
      expect(result[1].key).toBe('switch-test-switch');
    });

    it('should have a renderItem function for the switch item', () => {
      const result = getPopoverSwitchItems({ switchConfig: defaultSwitch });

      expect(result[1].renderItem).toBeDefined();
    });
  });

  describe('getPopoverPanels', () => {
    const defaultSwitch: AppMenuSwitch = {
      id: 'test-switch',
      label: 'Test switch',
      labelProps: {},
      checked: false,
      onChange: jest.fn(),
    };

    it('should create single panel for flat items', () => {
      const items: AppMenuPopoverItem[] = [
        { id: '1', label: 'Item 1', run: jest.fn(), order: 1 },
        { id: '2', label: 'Item 2', run: jest.fn(), order: 2 },
      ];

      const panels = getPopoverPanels({ items });

      expect(panels).toHaveLength(1);
      expect(panels[0].id).toBe(0);
      expect(panels[0].items).toHaveLength(2);
    });

    it('should create nested panels for items with sub-items', () => {
      const items: AppMenuPopoverItem[] = [
        {
          id: '1',
          label: 'Parent',
          order: 1,
          items: [{ id: '1-1', label: 'Child', run: jest.fn(), order: 1 }],
        },
      ];

      const panels = getPopoverPanels({ items });

      expect(panels).toHaveLength(2);
      const mainPanel = panels.find((p) => p.id === 0);
      const childPanel = panels.find((p) => p.id === 1);

      expect(mainPanel).toBeDefined();
      expect(childPanel).toBeDefined();
      expect(childPanel?.title).toBe('Parent');
    });

    it('should add separator above item when separator is "above"', () => {
      const items: AppMenuPopoverItem[] = [
        { id: '1', label: 'Item 1', run: jest.fn(), order: 1, separator: 'above' },
      ];

      const panels = getPopoverPanels({ items });
      const panelItems = panels[0].items as Array<{ isSeparator?: boolean; key?: string }>;

      expect(panelItems[0].isSeparator).toBe(true);
      expect(panelItems[0].key).toBe('separator-1');
    });

    it('should add separator below item when separator is "below"', () => {
      const items: AppMenuPopoverItem[] = [
        { id: '1', label: 'Item 1', run: jest.fn(), order: 1, separator: 'below' },
      ];

      const panels = getPopoverPanels({ items });
      const panelItems = panels[0].items as Array<{ isSeparator?: boolean; key?: string }>;

      expect(panelItems[1].isSeparator).toBe(true);
      expect(panelItems[1].key).toBe('separator-1');
    });

    it('should append action items to main panel when provided', () => {
      const items: AppMenuPopoverItem[] = [{ id: '1', label: 'Item 1', run: jest.fn(), order: 1 }];

      const panels = getPopoverPanels({
        items,
        primaryActionItem: { id: 'save', label: 'Save', run: jest.fn(), iconType: 'save' },
      });

      const mainPanel = panels[0];
      const panelItems = mainPanel.items as Array<{ key?: string; isSeparator?: boolean }>;

      expect(panelItems).toHaveLength(3);
      expect(panelItems[1].isSeparator).toBe(true);
      expect(panelItems[2].key).toBe('action-items');
    });

    it('should use custom startPanelId', () => {
      const items: AppMenuPopoverItem[] = [{ id: '1', label: 'Item 1', run: jest.fn(), order: 1 }];

      const panels = getPopoverPanels({ items, startPanelId: 10 });

      expect(panels[0].id).toBe(10);
    });

    it('should handle deeply nested items', () => {
      const items: AppMenuPopoverItem[] = [
        {
          id: '1',
          label: 'Level 1',
          order: 1,
          items: [
            {
              id: '1-1',
              label: 'Level 2',
              order: 1,
              items: [{ id: '1-1-1', label: 'Level 3', run: jest.fn(), order: 1 }],
            },
          ],
        },
      ];

      const panels = getPopoverPanels({ items });

      expect(panels).toHaveLength(3);
    });

    it('should set data-test-subj on panels with popoverTestId', () => {
      const items: AppMenuPopoverItem[] = [
        {
          id: '1',
          label: 'Export',
          order: 1,
          popoverTestId: 'exportPopoverPanel',
          items: [
            {
              id: '1-1',
              label: 'PDF',
              run: jest.fn(),
              order: 1,
            },
          ],
        },
        {
          id: '2',
          label: 'Share',
          order: 2,
          popoverTestId: 'sharePopoverPanel',
          items: [
            {
              id: '2-1',
              label: 'Link',
              run: jest.fn(),
              order: 1,
            },
          ],
        },
      ];

      const panels = getPopoverPanels({ items });

      expect(panels).toHaveLength(3);
      const exportPanel = panels.find((p) => p.title === 'Export');
      const sharePanel = panels.find((p) => p.title === 'Share');
      const mainPanel = panels.find((p) => p.id === 0);

      expect(exportPanel?.['data-test-subj']).toBe('exportPopoverPanel');
      expect(sharePanel?.['data-test-subj']).toBe('sharePopoverPanel');
      expect(mainPanel?.['data-test-subj']).toBeUndefined(); // Main panel has no test ID by default
    });

    it('should not show a separator when only static items are present', () => {
      const items: AppMenuPopoverItem[] = [];
      const staticItems: AppMenuPopoverItem[] = [
        { id: 'static1', label: 'Static 1', run: jest.fn(), order: 1 },
        { id: 'static2', label: 'Static 2', run: jest.fn(), order: 2 },
      ];

      const panels = getPopoverPanels({ items, staticItems });

      expect(panels).toHaveLength(1);
      const panelItems = panels[0].items as Array<{ key?: string; isSeparator?: boolean }>;
      expect(panelItems[0].isSeparator).not.toBe(true);
      expect(panelItems.map((i) => i.key)).toEqual(['static1', 'static2']);
    });

    it('should add a separator between regular and static items', () => {
      const items: AppMenuPopoverItem[] = [
        { id: '1', label: 'Item 1', run: jest.fn(), order: 2 },
        { id: '2', label: 'Item 2', run: jest.fn(), order: 1 },
      ];
      const staticItems: AppMenuPopoverItem[] = [
        { id: 'static1', label: 'Static 1', run: jest.fn(), order: 1 },
      ];

      const panels = getPopoverPanels({ items, staticItems });

      expect(panels).toHaveLength(1);
      const panelItems = panels[0].items as Array<{ key?: string; isSeparator?: boolean }>;
      expect(panelItems.map((i) => i.key)).toEqual(['2', '1', 'static-items-separator', 'static1']);
      expect(panelItems[2].isSeparator).toBe(true);
    });

    it('should not re-sort staticItems together with regular items', () => {
      const items: AppMenuPopoverItem[] = [
        { id: 'regular', label: 'Regular', run: jest.fn(), order: 10 },
      ];
      const staticItems: AppMenuPopoverItem[] = [
        { id: 'static1', label: 'Static', run: jest.fn(), order: 1 },
      ];

      const panels = getPopoverPanels({ items, staticItems });

      const panelItems = panels[0].items as Array<{ key?: string }>;
      // Static item with order 1 should still come after regular item with order 10
      expect(panelItems[0].key).toBe('regular');
      expect(panelItems[panelItems.length - 1].key).toBe('static1');
    });

    it('should handle staticItems with nested sub-items', () => {
      const items: AppMenuPopoverItem[] = [{ id: '1', label: 'Item 1', run: jest.fn(), order: 1 }];
      const staticItems: AppMenuPopoverItem[] = [
        {
          id: 'static-parent',
          label: 'Static Parent',
          order: 1,
          items: [{ id: 'static-child', label: 'Static Child', run: jest.fn(), order: 1 }],
        },
      ];

      const panels = getPopoverPanels({ items, staticItems });

      // Main panel + child panel for static item
      expect(panels).toHaveLength(2);
      const childPanel = panels.find((p) => p.title === 'Static Parent');
      expect(childPanel).toBeDefined();
    });

    it('should place staticItems before action items', () => {
      const items: AppMenuPopoverItem[] = [{ id: '1', label: 'Item 1', run: jest.fn(), order: 1 }];
      const staticItems: AppMenuPopoverItem[] = [
        { id: 'static1', label: 'Static', run: jest.fn(), order: 1 },
      ];

      const panels = getPopoverPanels({
        items,
        staticItems,
        primaryActionItem: { id: 'save', label: 'Save', run: jest.fn(), iconType: 'save' },
      });

      const panelItems = panels[0].items as Array<{ key?: string }>;
      // Order: regular item, separator, static, action-separator, action-items
      const staticIndex = panelItems.findIndex((i) => i.key === 'static1');
      const actionIndex = panelItems.findIndex((i) => i.key === 'action-items');
      expect(staticIndex).toBeLessThan(actionIndex);
    });

    it('should append switch items as the very last items in the panel', () => {
      const items: AppMenuPopoverItem[] = [{ id: '1', label: 'Item 1', run: jest.fn(), order: 1 }];

      const panels = getPopoverPanels({
        items,
        switchConfig: defaultSwitch,
      });

      const panelItems = panels[0].items as Array<{ key?: string; isSeparator?: boolean }>;
      const switchIndex = panelItems.findIndex((i) => i.key === 'switch-test-switch');
      expect(switchIndex).toBe(panelItems.length - 1);
      // Separator should be right before the switch
      expect(panelItems[switchIndex - 1].isSeparator).toBe(true);
    });

    it('should place switch after action items when both are present', () => {
      const items: AppMenuPopoverItem[] = [{ id: '1', label: 'Item 1', run: jest.fn(), order: 1 }];

      const panels = getPopoverPanels({
        items,
        primaryActionItem: { id: 'save', label: 'Save', run: jest.fn(), iconType: 'save' },
        switchConfig: defaultSwitch,
      });

      const panelItems = panels[0].items as Array<{ key?: string }>;
      const actionIndex = panelItems.findIndex((i) => i.key === 'action-items');
      const switchIndex = panelItems.findIndex((i) => i.key === 'switch-test-switch');
      expect(actionIndex).toBeLessThan(switchIndex);
      expect(switchIndex).toBe(panelItems.length - 1);
    });
  });

  describe('getIsSelectedColor', () => {
    const mockEuiTheme = {
      components: {
        buttons: {
          backgroundFilledPrimaryHover: '#filled-primary',
          backgroundEmptyPrimaryHover: '#empty-primary',
          backgroundFilledTextHover: '#filled-text',
          backgroundEmptyTextHover: '#empty-text',
        },
      },
      colors: {
        backgroundBaseInteractiveHover: '#fallback',
      },
    } as unknown as EuiThemeComputed;

    it('should return filled primary hover color for filled primary button', () => {
      const result = getIsSelectedColor({
        color: 'primary',
        euiTheme: mockEuiTheme,
        isFilled: true,
      });

      expect(result).toBe('#filled-primary');
    });

    it('should return empty primary hover color for non-filled primary button', () => {
      const result = getIsSelectedColor({
        color: 'primary',
        euiTheme: mockEuiTheme,
        isFilled: false,
      });

      expect(result).toBe('#empty-primary');
    });

    it('should return empty text hover color for text button', () => {
      const result = getIsSelectedColor({
        color: 'text',
        euiTheme: mockEuiTheme,
        isFilled: false,
      });

      expect(result).toBe('#empty-text');
    });

    it('should return fallback color when color key does not exist', () => {
      const result = getIsSelectedColor({
        color: 'nonexistent' as any,
        euiTheme: mockEuiTheme,
        isFilled: false,
      });

      expect(result).toBe('#fallback');
    });
  });

  describe('processStaticItems', () => {
    const createStaticItem = (overrides: Record<string, unknown> = {}): AppMenuItemType =>
      ({
        id: 'item1',
        order: 1,
        label: 'Item 1',
        run: jest.fn(),
        iconType: 'gear',
        ...overrides,
      } as AppMenuItemType);

    it('should return an empty array when no items are provided', () => {
      expect(processStaticItems()).toEqual([]);
      expect(processStaticItems([])).toEqual([]);
    });

    it('should set overflow to true on all items', () => {
      const items = [
        createStaticItem({ id: 'a', order: 1 }),
        createStaticItem({ id: 'b', order: 2 }),
      ];
      const result = processStaticItems(items);

      expect(result.every((item) => item.overflow === true)).toBe(true);
    });

    it('should not add separator to items', () => {
      const items = [
        createStaticItem({ id: 'a', order: 1 }),
        createStaticItem({ id: 'b', order: 2 }),
        createStaticItem({ id: 'c', order: 3 }),
      ];
      const result = processStaticItems(items);

      expect(result[0].separator).toBeUndefined();
      expect(result[1].separator).toBeUndefined();
      expect(result[2].separator).toBeUndefined();
    });

    it('should strip existing separator values from items', () => {
      const items = [
        createStaticItem({ id: 'a', order: 1, separator: 'below' }),
        createStaticItem({ id: 'b', order: 2, separator: 'above' }),
      ];
      const result = processStaticItems(items);

      expect(result[0].separator).toBeUndefined();
      expect(result[1].separator).toBeUndefined();
    });

    it('should sort items by order', () => {
      const items = [
        createStaticItem({ id: 'c', order: 3 }),
        createStaticItem({ id: 'a', order: 1 }),
        createStaticItem({ id: 'b', order: 2 }),
      ];
      const result = processStaticItems(items);

      expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    });

    it('should not add separator to the first item after sorting', () => {
      const items = [
        createStaticItem({ id: 'c', order: 3 }),
        createStaticItem({ id: 'a', order: 1 }),
      ];
      const result = processStaticItems(items);

      expect(result[0].id).toBe('a');
      expect(result[0].separator).toBeUndefined();
    });
  });
});
