/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { MAX_MENU_ITEMS } from '../constants';

/**
 * Utility function to get the number of visible menu items until we reach the menu height or the limit of menu items.
 *
 * @param heights - The heights of the menu items.
 * @param gap - The gap between the menu items.
 * @param menuHeight - The height of the menu.
 * @param hasForcedMoreButton - When true, a "More" button is rendered regardless of responsive
 * overflow (e.g. because items were explicitly hidden by the user). Its height is added to the list
 * to fit so space is reserved for it; otherwise the button has no reserved space and overlaps the
 * footer.
 *
 * @returns The number of visible menu items.
 */
export const countVisibleMenuItems = (
  heights: number[],
  gap: number,
  menuHeight: number,
  hasForcedMoreButton: boolean = false
): number => {
  // The "More" button takes roughly the same vertical space as any other item. When it is forced
  // in, the button is always rendered, so include its height in the fitting math.
  const itemHeights =
    hasForcedMoreButton && heights.length > 0 ? [...heights, heights[0]] : heights;

  const countItemsToFit = (availableHeight: number, limit: number) => {
    let itemCount = 0;
    let totalHeight = 0;

    for (let i = 0; i < itemHeights.length && itemCount < limit; i++) {
      const itemHeight = itemHeights[i];
      const nextTotalHeight = totalHeight + itemHeight + (itemCount > 0 ? gap : 0);

      if (nextTotalHeight <= availableHeight) {
        totalHeight = nextTotalHeight;
        itemCount++;
      } else {
        break;
      }
    }

    return itemCount;
  };

  // 1. Calculate how many items can fit without considering the "More" button
  const initialVisibleCount = countItemsToFit(menuHeight, MAX_MENU_ITEMS);

  // 2. If not all items are visible, we need the "More" button
  if (itemHeights.length > initialVisibleCount) {
    const moreItemHeight = itemHeights[0]; // Approximately the same height as any other item
    const availableHeight = menuHeight - moreItemHeight - gap;

    return countItemsToFit(availableHeight, MAX_MENU_ITEMS - 1);
  }

  // Never report more than the real number of items: the synthetic "More" button height does not
  // correspond to an actual menu item, so it must not inflate the visible count.
  return Math.min(initialVisibleCount, heights.length);
};
