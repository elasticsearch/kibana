/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MutableRefObject } from 'react';

import type { MenuItem } from '../../types';

/**
 * Utility function to cache the heights of the menu items in a ref.
 * It assumes one initial render where all items are in the DOM.
 *
 * @param ref - The ref to the heights cache.
 * @param menu - The menu element.
 * @param items - The menu items.
 */
export const cacheMenuItemHeights = (
  ref: MutableRefObject<number[]>,
  menu: HTMLElement,
  items: MenuItem[]
): void => {
  if (ref.current?.length !== items.length) {
    const children: Element[] = Array.from(menu.children);

    // Ignore the trailing "More" button when caching heights.
    if (children.length >= items.length && children.length <= items.length + 1) {
      ref.current = children.slice(0, items.length).map((child) => child.clientHeight);
    }
  }
};
