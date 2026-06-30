/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { MAX_MENU_ITEMS } from '../constants';
import { countVisibleMenuItems } from './count_visible_menu_items';

describe('countVisibleMenuItems', () => {
  it('returns all items when they fit in the available height', () => {
    const heights = Array.from({ length: 4 }, () => 40);
    const gap = 8;
    const menuHeight = 4 * 40 + 3 * gap;

    expect(countVisibleMenuItems(heights, gap, menuHeight)).toBe(heights.length);
  });

  it('reserves space for the "More" button when not all items fit', () => {
    const heights = [40, 40, 40];
    const gap = 10;
    const menuHeight = 90; // Only two items fit before accounting for the overflow control

    // Expect only one regular item to stay visible when the overflow control is required
    expect(countVisibleMenuItems(heights, gap, menuHeight)).toBe(1);
  });

  it('never returns more items than the configured maximum', () => {
    const heights = Array.from({ length: MAX_MENU_ITEMS + 5 }, () => 32);
    const gap = 4;
    const menuHeight = 2000; // Large enough to fit everything but should still cap at MAX_MENU_ITEMS - 1 (leaving room for the overflow control)

    expect(countVisibleMenuItems(heights, gap, menuHeight)).toBe(MAX_MENU_ITEMS - 1);
  });

  it('reserves space for a forced "More" button even when every item fits', () => {
    const heights = Array.from({ length: 4 }, () => 40);
    const gap = 8;
    const menuHeight = 4 * 40 + 3 * gap; // All four items fit exactly, with no room for "More"

    // Without a forced "More" button all four are visible
    expect(countVisibleMenuItems(heights, gap, menuHeight)).toBe(4);

    // A forced "More" button (e.g. items explicitly hidden) must reserve a slot, pushing one item out
    expect(countVisibleMenuItems(heights, gap, menuHeight, true)).toBe(3);
  });

  it('keeps all items visible when the forced "More" button also fits', () => {
    const heights = Array.from({ length: 4 }, () => 40);
    const gap = 8;
    const menuHeight = 5 * 40 + 4 * gap; // Room for the four items plus the "More" button

    expect(countVisibleMenuItems(heights, gap, menuHeight, true)).toBe(4);
  });
});
