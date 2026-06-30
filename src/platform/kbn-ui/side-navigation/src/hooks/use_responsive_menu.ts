/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MutableRefObject } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { MenuItem } from '../../types';
import { cacheMenuItemHeights } from '../utils/cache_menu_item_heights';
import { countVisibleMenuItems } from '../utils/count_visible_menu_items';
import { getStyleProperty } from '../utils/get_style_property';
import { useRafDebouncedCallback } from './use_raf_debounced';
import { useStableMenuItemsReference } from './use_stable_menu_items_reference';

interface ResponsiveMenuState {
  primaryMenuRef: MutableRefObject<HTMLElement | null>;
  visibleMenuItems: MenuItem[];
  overflowMenuItems: MenuItem[];
}

/**
 * Custom hook that measures the primary nav container and decides which items can stay visible.
 * Items that no longer fit are moved into the overflow "More" menu so the sidebar keeps its size
 * limits when resizing, zooming, or collapsing.
 *
 * @param isCollapsed - whether the side nav is currently collapsed (affects layout recalculation).
 * @param items - all primary navigation items, in priority order.
 * @param hasForcedMoreButton - whether a "More" button is rendered regardless of responsive overflow
 * (e.g. because items were explicitly hidden by the user). When true, space is reserved for it.
 * @returns an object containing:
 * - `primaryMenuRef` - a ref to the primary menu.
 * - `visibleMenuItems` - the visible menu items.
 * - `overflowMenuItems` - the overflow menu items.
 */
export function useResponsiveMenu(
  isCollapsed: boolean,
  items: MenuItem[],
  hasForcedMoreButton: boolean = false
): ResponsiveMenuState {
  const primaryMenuRef = useRef<HTMLElement | null>(null);
  const heightsCacheRef = useRef<number[]>([]);

  const [visibleCount, setVisibleCount] = useState<number>(items.length);

  const visibleMenuItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const overflowMenuItems = useMemo(() => items.slice(visibleCount), [items, visibleCount]);
  const stableItemsReference = useStableMenuItemsReference(items);

  const recalculateMenuLayout = useCallback(() => {
    if (!primaryMenuRef.current) return;

    // Primary menu
    const menu = primaryMenuRef.current;
    const menuHeight = menu.clientHeight;

    // 1. Cache the heights of all children
    cacheMenuItemHeights(heightsCacheRef, menu, stableItemsReference);

    if (heightsCacheRef.current.length === 0) return;

    // Primary menu items
    const childrenHeights = heightsCacheRef.current;
    const childrenGap = getStyleProperty(menu, 'gap');

    // 2. Calculate the number of visible menu items
    const nextVisibleCount = countVisibleMenuItems(
      childrenHeights,
      childrenGap,
      menuHeight,
      hasForcedMoreButton
    );

    // 3. Update the visible count if needed
    setVisibleCount(nextVisibleCount);
  }, [stableItemsReference, hasForcedMoreButton]);

  const [scheduleRecalculation, cancelRecalculation] =
    useRafDebouncedCallback(recalculateMenuLayout);

  useLayoutEffect(() => {
    // Invalidate the cache when items change
    setVisibleCount(stableItemsReference.length);
    heightsCacheRef.current = [];

    const observer = new ResizeObserver(() => {
      scheduleRecalculation();
    });

    if (primaryMenuRef.current) {
      observer.observe(primaryMenuRef.current);
    }

    // Initial calculation
    scheduleRecalculation();

    return () => {
      observer.disconnect();
      cancelRecalculation();
    };
  }, [
    isCollapsed,
    stableItemsReference,
    hasForcedMoreButton,
    scheduleRecalculation,
    cancelRecalculation,
  ]);

  return {
    primaryMenuRef,
    visibleMenuItems,
    overflowMenuItems,
  };
}
