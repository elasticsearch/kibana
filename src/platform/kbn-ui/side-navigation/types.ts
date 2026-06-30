/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IconType } from '@elastic/eui';

export type BadgeType = 'beta' | 'techPreview' | 'new';

/**
 * A navigation item within a secondary/nested menu.
 * Secondary items appear when a primary menu item with sections is clicked or hovered.
 */
export interface SecondaryMenuItem {
  /**
   * The URL for the menu item link.
   */
  href: string;
  /**
   * The unique identifier of the menu item.
   */
  id: string;
  /**
   * The label to display for the menu item.
   */
  label: string;
  /**
   * (optional) `data-test-subj` attribute for testing and tracking purposes.
   */
  'data-test-subj'?: string;
  /**
   * (optional) The type of badge shown next to the item (e.g. `beta`, `techPreview`, `new`).
   */
  badgeType?: BadgeType;
  /**
   * (optional) Whether the link opens in a new tab.
   */
  isExternal?: boolean;
}

/**
 * A section grouping within a secondary menu.
 * Sections help organize related secondary menu items with optional headers.
 */
export interface SecondaryMenuSection {
  /**
   * The unique identifier of the secondary menu section.
   */
  id: string;
  /**
   * The items contained in the secondary menu section.
   */
  items: SecondaryMenuItem[];
  /**
   * (optional) The label to display for the secondary menu section.
   */
  label?: string;
}

/**
 * A primary navigation menu item that appears in the main navigation sidebar.
 * Can optionally contain nested secondary menu sections.
 */
export interface MenuItem {
  /**
   * The URL for the menu item link.
   */
  href: string;
  /**
   * The icon to display for the menu item.
   */
  iconType: IconType;
  /**
   * The unique identifier of the menu item.
   */
  id: string;
  /**
   * The label to display for the menu item.
   */
  label: string;
  /**
   * (optional) `data-test-subj` attribute for testing and tracking purposes.
   */
  'data-test-subj'?: string;
  /**
   * (optional) The type of badge shown next to the item (e.g. `beta`, `techPreview`, `new`).
   */
  badgeType?: BadgeType;
  /**
   * (optional) The secondary menu sections belonging to the menu item.
   */
  sections?: SecondaryMenuSection[];
}

/**
 * The complete navigation structure containing primary, overflow, and footer menu items.
 * This is the main data structure passed to the Navigation component.
 */
export interface NavigationStructure {
  /**
   * The items to be displayed in the navigation footer.
   */
  footerItems: MenuItem[];
  /**
   * Items that are always placed in the overflow ("More") menu.
   */
  overflowItems?: MenuItem[];
  /**
   * The primary navigation items displayed in the navigation main menu.
   */
  primaryItems: MenuItem[];
}

export interface MenuCalculations {
  /**
   * The total available height (in pixels) for the menu rendering.
   */
  availableHeight: number;
  /**
   * The gap (in pixels) between the menu items.
   */
  itemGap: number;
  /**
   * The maximum number of menu items that can be displayed in the navigation menu.
   */
  maxVisibleItems: number;
}

export interface SideNavLogo {
  /**
   * The route ID of the logo, used for the active state.
   */
  id: string;
  /**
   * The href of the logo link, typically the home page.
   */
  href: string;
  /**
   * The label for the logo, typically the product name.
   */
  label: string;
  /**
   * The logo type, e.g. `appObservability`, `appSecurity`, etc.
   */
  iconType: string;
  /**
   * (optional) `data-test-subj` attribute for testing and tracking purposes.
   */
  'data-test-subj'?: string;
}
