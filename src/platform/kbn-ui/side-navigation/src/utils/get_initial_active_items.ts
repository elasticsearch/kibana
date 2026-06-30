/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MenuItem, NavigationStructure, SecondaryMenuItem } from '../../types';

export interface ActiveItemsState {
  primaryItem: MenuItem | null;
  secondaryItem: SecondaryMenuItem | null;
  isLogoActive: boolean;
}

/**
 * Utility function to determine the active menu items based on the `activeItemId`.
 *
 * @param items - the navigation structure.
 * @param activeItemId - the active item ID.
 * @param logoId - the logo ID.
 * @returns the active items state including: `primaryItem`, `secondaryItem`, and `isLogoActive`.
 */
export const getActiveItems = (
  items: NavigationStructure,
  activeItemId?: string,
  logoId?: string
): ActiveItemsState => {
  if (!activeItemId) {
    return { primaryItem: null, secondaryItem: null, isLogoActive: false };
  }

  // First, check if the logo is active
  if (logoId && activeItemId === logoId) {
    return { primaryItem: null, secondaryItem: null, isLogoActive: true };
  }

  // Second, search the secondary menu items using their IDs (prioritize children over parents)
  for (const primary of [...items.primaryItems, ...(items.overflowItems ?? [])]) {
    if (!primary.sections) continue;

    for (const section of primary.sections) {
      const secondaryItem = section.items.find((item) => item.id === activeItemId);
      if (secondaryItem) {
        return { primaryItem: primary, secondaryItem, isLogoActive: false };
      }
    }
  }

  // Third, search the secondary items of footer items
  for (const footer of items.footerItems) {
    if (!footer.sections) continue;

    for (const section of footer.sections) {
      const secondaryItem = section.items.find((item) => item.id === activeItemId);
      if (secondaryItem) {
        return { primaryItem: footer, secondaryItem, isLogoActive: false };
      }
    }
  }

  // Fourth, search the primary and overflow menu items using their IDs
  const primaryItem = [...items.primaryItems, ...(items.overflowItems ?? [])].find(
    (item) => item.id === activeItemId
  );
  if (primaryItem) {
    return { primaryItem, secondaryItem: null, isLogoActive: false };
  }

  // Fifth, search the footer items using their IDs
  const footerItem = items.footerItems.find((item) => item.id === activeItemId);
  if (footerItem) {
    return { primaryItem: footerItem, secondaryItem: null, isLogoActive: false };
  }

  return { primaryItem: null, secondaryItem: null, isLogoActive: false };
};
