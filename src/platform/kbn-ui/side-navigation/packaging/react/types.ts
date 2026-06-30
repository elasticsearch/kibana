/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Standalone type definitions for the `SideNavigation` external package.
 *
 * Types are defined inline (not re-exported) so that declaration generation
 * does not pull in the full Kibana dependency graph. Build-time validation
 * in `type_validation.ts` ensures these stay in sync with the source types.
 *
 * @see {@link ./type_validation.ts} for the compatibility check.
 */

import type * as React from 'react';

type ReactNode = string | number | boolean | null | undefined | React.ReactElement;

/**
 * Badge types that can be displayed next to navigation items.
 */
export type BadgeType = 'beta' | 'techPreview' | 'new';

/**
 * A navigation item within a secondary/nested menu.
 */
export interface SecondaryMenuItem {
  /** URL or hash for navigation. */
  href: string;
  /** Unique identifier for this item. */
  id: string;
  /** Display text for the menu item. */
  label: string;
  /** Optional test selector for automated testing. */
  'data-test-subj'?: string;
  /** Optional badge to display next to the label. */
  badgeType?: BadgeType;
  /** If true, opens link in a new tab with an external icon. */
  isExternal?: boolean;
}

/**
 * A section grouping within a secondary menu.
 */
export interface SecondaryMenuSection {
  /** Unique identifier for this section. */
  id: string;
  /** Array of menu items in this section. */
  items: SecondaryMenuItem[];
  /** Optional section header label (omit for unlabeled sections). */
  label?: string;
}

/**
 * A primary navigation menu item displayed in the sidebar.
 */
export interface MenuItem {
  /** URL or hash for navigation. */
  href: string;
  /** EUI icon name — see https://eui.elastic.co/#/display/icons. */
  iconType: string;
  /** Unique identifier for this item. */
  id: string;
  /** Display text for the menu item. */
  label: string;
  /** Optional test selector for automated testing. */
  'data-test-subj'?: string;
  /** Optional badge to display next to the label. */
  badgeType?: BadgeType;
  /** Optional array of secondary menu sections for nested navigation. */
  sections?: SecondaryMenuSection[];
}

/**
 * The complete navigation structure containing primary, overflow, and footer items.
 */
export interface NavigationStructure {
  /** Items displayed in the footer area of the navigation. */
  footerItems: MenuItem[];
  /** Items that are always placed in the overflow ("More") menu. */
  overflowItems?: MenuItem[];
  /** Items displayed in the primary/main area of the navigation. */
  primaryItems: MenuItem[];
}

/**
 * Configuration for the logo displayed at the top of the sidebar.
 */
export interface SideNavLogo {
  /** The route ID of the logo, used for the active state. */
  id: string;
  /** The href of the logo link, typically the home page. */
  href: string;
  /** The label for the logo, typically the product name. */
  label: string;
  /** The logo type, e.g. `appObservability`, `appSecurity`, etc. */
  iconType: string;
  /** Optional `data-test-subj` attribute. */
  'data-test-subj'?: string;
}

/**
 * Props accepted by the `SideNavigation` component.
 */
export interface NavigationProps {
  /** The active item ID, used for highlighting the current item. */
  activeItemId?: string;
  /** Whether the navigation is collapsed. */
  isCollapsed: boolean;
  /** The navigation structure containing primary, secondary, and footer items. */
  items: NavigationStructure;
  /** The logo object containing the route ID, href, label, and type. */
  logo: SideNavLogo;
  /** Required by the grid layout to set the width of the navigation slot. */
  setWidth: (width: number) => void;
  /** Callback fired when a navigation item is clicked. */
  onItemClick?: (item: MenuItem | SecondaryMenuItem | SideNavLogo) => void;
  /** Callback fired when the collapse button is toggled. Omit to hide the toggle button. */
  onToggleCollapsed?: (isCollapsed: boolean) => void;
  /** When true, renders a centered horizontal separator at the top of the side nav. */
  showTopSeparator?: boolean;
  /** Content to display inside the side panel footer. */
  sidePanelFooter?: ReactNode;
  /** Optional `data-test-subj` attribute for testing purposes. */
  'data-test-subj'?: string;
}

/** Alias for the external package. */
export type SideNavigationProps = NavigationProps;

/** Component declaration (compiled to function declaration in `.d.ts`). */
export declare function SideNavigation(props: SideNavigationProps): React.ReactNode;
