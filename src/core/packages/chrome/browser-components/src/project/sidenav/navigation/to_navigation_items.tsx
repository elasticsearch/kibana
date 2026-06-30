/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ChromeProjectNavigationNode,
  NavigationTreeDefinitionUI,
} from '@kbn/core-chrome-browser';
import {
  getNavigationNodeIcon,
  NAVIGATION_NODE_ICON_FALLBACK,
} from '@kbn/core-chrome-browser-navigation-utils';
import classnames from 'classnames';
import type {
  MenuItem,
  NavigationStructure,
  SecondaryMenuItem,
  SecondaryMenuSection,
  SideNavLogo,
} from '@kbn/ui-side-navigation/types';
import { toSentenceCase } from '@kbn/shared-ux-label-formatter';

import { i18n } from '@kbn/i18n';
import type { PanelStateManager } from './panel_state_manager';
import { isActiveFromUrl } from './utils/is_active_from_url';

const SKIP_WARNINGS = process.env.NODE_ENV === 'production';

const HOME_TITLE = i18n.translate('core.ui.chrome.sideNavigation.homeItemTitle', {
  defaultMessage: 'Home',
});

export interface NavigationItems {
  logoItem?: SideNavLogo;
  navItems: NavigationStructure;
  activeItemId?: string;
}

/**
 * Converts the navigation tree definition and nav links into a format for new navigation.
 *
 * @remarks
 *
 * Structural Assumptions and Mapping
 *
 * - Root node (1st level) is used for the "logo" item and application branding
 * - 2nd level nodes are transformed into primary navigation items:
 *   - Accordion nodes are flattened (not supported) - their children become primary items
 *   - Nodes without links that aren't panel openers are treated as section dividers and not supported in new nav - their children are flattened
 *   - panelOpener nodes create flyout secondary navigation panels, they can't have links directly, but can have sections with links
 * - 3rd level is used for secondary navigation (children of panelOpener):
 *   - If all 3rd level items have links, they're treated as menu items and wrapped in a single section
 *   - If some don't have links, they're treated as section headers with their children becoming menu items
 * - Footer is limited to 5 items maximum (extras are dropped with warning)
 *
 * @param navigationTree
 * @param navLinks
 * @param activeNodes
 * @param panelStateManager - Manager for panel opener state
 * @param isNextChrome - Whether the navigation is in the next chrome
 */
export const toNavigationItems = (
  navigationTree: NavigationTreeDefinitionUI,
  activeNodes: ChromeProjectNavigationNode[][],
  overflowItemIds: string[] = [],
  panelStateManager: PanelStateManager,
  isNextChrome: boolean = false
): NavigationItems => {
  let primaryNodes: ChromeProjectNavigationNode[] = navigationTree.body;
  const footerNodes: ChromeProjectNavigationNode[] = navigationTree.footer ?? [];

  let deepestActiveItemId: string | undefined;
  let currentActiveItemIdLevel = -1;

  const isActive = (navNode: ChromeProjectNavigationNode) =>
    isActiveFromUrl(navNode.path, activeNodes, false);

  const maybeMarkActive = (
    navNode: ChromeProjectNavigationNode,
    level: number,
    parentNode?: ChromeProjectNavigationNode
  ) => {
    if (deepestActiveItemId == null || currentActiveItemIdLevel < level) {
      if (isActive(navNode)) {
        deepestActiveItemId = navNode.id;
        currentActiveItemIdLevel = level;

        if (parentNode?.id) {
          panelStateManager.setPanelLastActive(parentNode.id, navNode.id);
        }
      }
    }
  };

  const getTestSubj = (navNode: ChromeProjectNavigationNode, append: string[] = []): string => {
    const { id, path, deepLink } = navNode;
    return classnames(
      `nav-item`,
      `nav-item-${path}`,
      {
        [`nav-item-deepLinkId-${deepLink?.id}`]: !!deepLink,
        [`nav-item-id-${id}`]: id,
        [`nav-item-isActive`]: isActive(navNode),
      },
      ...append
    );
  };

  let logoItem: SideNavLogo | undefined;

  const homeNodeIndex = primaryNodes.findIndex((node) => node.renderAs === 'home');
  if (homeNodeIndex !== -1) {
    const homeNode = primaryNodes[homeNodeIndex];
    maybeMarkActive(homeNode, 0);

    if (isNextChrome) {
      // TODO: https://github.com/elastic/kibana/issues/272291
      primaryNodes = primaryNodes.map((node, i) =>
        i === homeNodeIndex ? { ...node, title: HOME_TITLE, icon: 'home' } : node
      );
    } else {
      primaryNodes = primaryNodes.filter((_, i) => i !== homeNodeIndex);
      logoItem = {
        href: warnIfMissing(homeNode, 'href', '/missing-href-😭'),
        iconType: getNavigationNodeIcon(homeNode),
        id: warnIfMissing(homeNode, 'id', 'kibana'),
        label: warnIfMissing(homeNode, 'title', 'Kibana'),
        'data-test-subj': getTestSubj(homeNode, ['nav-item-home']),
      };
    }
  } else {
    warnOnce(
      `No "home" node found in primary nodes. There should be a logo node with solution logo, name and home page href. renderAs: "home" is expected.`
    );
  }

  // TODO: The visibility checks below (sideNavStatus === 'hidden', empty panel-opener pruning,
  // section-header flattening) duplicate logic already handled by `getRenderableNodes` in
  // `@kbn/core-chrome-browser-internal`. Once `getNavigation$()` passes a pre-pruned tree, this
  // function can be simplified to a pure shape-transformer with no visibility decisions.
  const toMenuItem = (navNode: ChromeProjectNavigationNode): MenuItem[] | MenuItem | null => {
    if (!navNode) return null;

    if (navNode.sideNavStatus === 'hidden') {
      return null;
    }

    // This was like a sub-section title without a link in the old navigation.
    // In the new navigation, just flatten it into its children, since we must have links in the primary items.
    if (navNode.renderAs !== 'panelOpener' && !navNode.href) {
      warnOnce(
        `Navigation node "${navNode.id}${
          navNode.title ? ` (${navNode.title})` : ''
        }" is missing href and is not a panel opener. This node was likely used as a sub-section. Ignoring this node and flattening its children: ${navNode.children
          ?.map((c) => c.id)
          .join(', ')}.`
      );

      if (!navNode.children?.length) return null;
      return filterEmpty(navNode.children.flatMap(toMenuItem));
    }

    let secondarySections: SecondaryMenuSection[] | undefined;

    // Helper function to filter out hidden and custom render items
    const filterValidSecondaryChildren = (
      children: ChromeProjectNavigationNode[]
    ): ChromeProjectNavigationNode[] => {
      return children.filter((child) => child.sideNavStatus !== 'hidden');
    };

    // Helper function to convert a node to a secondary menu item
    const createSecondaryMenuItem = (child: ChromeProjectNavigationNode): SecondaryMenuItem => {
      maybeMarkActive(child, 2, navNode);
      return {
        id: child.id,
        label: toSentenceCase(warnIfMissing(child, 'title', 'Missing Title 😭')),
        href: warnIfMissing(child, 'href', 'Missing Href 😭'),
        isExternal: child.isExternalLink,
        'data-test-subj': getTestSubj(child),
        badgeType: child.badgeType,
      };
    };

    if (navNode.renderAs === 'panelOpener') {
      if (!navNode.children?.length) {
        warnOnce(`Panel opener node "${navNode.id}" has no children. Ignoring it.`);
        return null;
      }

      const noSubSections = navNode.children.every((l) => l.href);

      if (noSubSections) {
        warnOnce(
          `Panel opener node "${
            navNode.id
          }" should contain panel sections, not direct links. Flattening links "${navNode.children
            ?.map((c) => c.id)
            .join(', ')}" into secondary items and creating a placeholder section for these links.`
        );

        // If all children have hrefs, we can treat them as secondary items
        const validChildren = filterValidSecondaryChildren(navNode.children);
        secondarySections = [
          {
            id: `${navNode.id}-section`,
            items: validChildren.map(createSecondaryMenuItem),
          },
        ];
      } else {
        // Otherwise, we need to create sections for each child
        secondarySections = filterEmpty(
          navNode.children.map((child) => {
            if (child.sideNavStatus === 'hidden') return null;
            if (!child.children?.length) return null;

            const validChildren = filterValidSecondaryChildren(child.children);
            const secondaryItems = validChildren.map(createSecondaryMenuItem);

            if (child.href) {
              warnOnce(
                `Secondary menu item node "${child.id}" has a href "${child.href}", but it should not. We're using it as a section title that doesn't have a link.`
              );
            }

            return {
              id: child.id,
              label: child.title && toSentenceCase(child.title),
              items: secondaryItems,
            };
          })
        ).filter((section) => section.items.length > 0); // Filter out empty sections;
      }

      // If after all filtering there are no sections, we skip this menu item
      if (secondarySections.length === 0) {
        return null;
      }
    }

    // for primary menu items there should always be a href
    // if it's a panel opener, we use the last opened panel or the first link inside the section as the href
    // if there are no sections, we use the href directly
    const itemHref = secondarySections?.length
      ? getPanelOpenerHref(navNode, secondarySections, panelStateManager)
      : warnIfMissing(navNode, 'href', 'missing-href-😭');

    maybeMarkActive(navNode, 1);

    return {
      id: navNode.id,
      label: toSentenceCase(warnIfMissing(navNode, 'title', 'Missing Title 😭')),
      iconType: getNavigationNodeIcon(navNode),
      href: itemHref,
      sections: secondarySections,
      'data-test-subj': getTestSubj(navNode),
      badgeType: navNode.badgeType,
    } as MenuItem;
  };

  const overflowIdSet = new Set(overflowItemIds);
  const allPrimaryItems = filterEmpty(primaryNodes.flatMap(toMenuItem));
  const primaryItems = allPrimaryItems.filter((item) => !overflowIdSet.has(item.id));
  const overflowItems = allPrimaryItems.filter((item) => overflowIdSet.has(item.id));
  const footerItems = filterEmpty(footerNodes.flatMap(toMenuItem));

  if (footerItems.length > 5) {
    warnOnce(
      `Footer items should not exceed 5. Found ${
        footerItems.length
      }. Only the first 5 will be displayed. Dropped items: ${footerItems
        .slice(5)
        .map((item) => item.id)
        .join(', ')}`
    );
  }

  if (!SKIP_WARNINGS) {
    warnAboutDuplicateIds(logoItem, primaryItems, footerItems);
    warnAboutDuplicateIcons(logoItem, primaryItems, footerItems);
    warnAboutTooManyNewItems(primaryItems, footerItems);
  }

  return {
    logoItem,
    navItems: { primaryItems, overflowItems, footerItems },
    activeItemId: deepestActiveItemId,
  };
};

// =====================
// Utilities & Helpers
// =====================

function warnIfMissing<T extends { id: string }, K extends keyof T>(
  obj: T | null | undefined,
  key: K | K[],
  fallback: NonNullable<T[K]>
): NonNullable<T[K]> {
  const keys = Array.isArray(key) ? key : [key];

  // Helper function to create warning message
  const createWarningMessage = (reason: string) =>
    `Navigation item${obj?.id ? ` "${obj.id}"` : ''} ${reason}. Using fallback value: "${String(
      fallback
    )}".`;

  if (!obj) {
    warnOnce(createWarningMessage(`is missing`));
    return fallback;
  }

  // Try each key in order until we find a value
  for (const k of keys) {
    const value = obj[k];
    if (value !== undefined && value !== null) {
      return value as NonNullable<T[K]>;
    }
  }

  // None of the keys had values, warn and use fallback
  const missingKeysMessage =
    keys.length === 1
      ? `is missing a "${String(keys[0])}"`
      : `is missing all of "${keys.join(', ')}"`;

  warnOnce(createWarningMessage(missingKeysMessage));
  return fallback;
}

const warnedMessages = new Set<string>();
let lastWarning = '';
function warnOnce(message: string) {
  if (SKIP_WARNINGS) return;
  if (!warnedMessages.has(message)) {
    warnedMessages.add(message);
  }
  setTimeout(() => {
    const header = '\n=== Navigation Warnings ===\n';
    const warning =
      header +
      Array.from(warnedMessages.values())
        .map((msg) => `• ${msg}`)
        .join('\n');
    if (warning !== lastWarning) {
      // eslint-disable-next-line no-console
      console.warn(warning);
      lastWarning = warning;
    }
  }, 0);
}

const filterEmpty = <T,>(arr: Array<T | null | undefined>): T[] =>
  arr.filter((item) => item !== null && item !== undefined) as T[];

/**
 * Generic function to detect and warn about duplicate values in navigation items.
 * @param values - Array of values to check for duplicates
 * @param formatWarning - Function to format the warning message for duplicates
 */
function warnAboutDuplicates(
  values: string[],
  formatWarning: (value: string, count: number) => string
) {
  const valueGroups = new Map<string, number>();
  values.forEach((value) => {
    valueGroups.set(value, (valueGroups.get(value) || 0) + 1);
  });

  valueGroups.forEach((count, value) => {
    if (count > 1) {
      warnOnce(formatWarning(value, count));
    }
  });
}

function warnAboutDuplicateIcons(
  logoItem: SideNavLogo | undefined,
  primaryItems: MenuItem[],
  footerItems: MenuItem[]
) {
  if (SKIP_WARNINGS) return;
  const icons = [...(logoItem ? [logoItem] : []), ...primaryItems, ...footerItems]
    .filter(
      (item) =>
        item.iconType &&
        item.iconType !== NAVIGATION_NODE_ICON_FALLBACK &&
        typeof item.iconType === 'string'
    )
    .map((item) => String(item.iconType));

  warnAboutDuplicates(
    icons,
    (icon) =>
      `Icon "${icon}" is used by multiple navigation items. Consider using unique icons for better UX.`
  );
}

function warnAboutDuplicateIds(
  logoItem: SideNavLogo | undefined,
  primaryItems: MenuItem[],
  footerItems: MenuItem[]
) {
  if (SKIP_WARNINGS) return;
  let allIds: string[] = logoItem ? [logoItem.id] : [];

  // Helper to extract IDs from menu items including their secondary sections
  const collectIds = (items: MenuItem[]) => {
    items.forEach((item) => {
      allIds.push(item.id);
      if (item.sections) {
        item.sections.forEach((section) => {
          allIds.push(section.id);
          section.items.forEach((secondaryItem) => {
            allIds.push(secondaryItem.id);
          });
        });
      }
    });
  };

  collectIds(primaryItems);
  collectIds(footerItems);

  allIds = allIds.filter((id) => !id?.startsWith('node-')); // Filter out auto-generated IDs

  warnAboutDuplicates(
    allIds,
    (id, count) =>
      `ID "${id}" is used ${count} times in navigation items. Each navigation item must have a unique ID.`
  );
}

function warnAboutTooManyNewItems(primaryItems: MenuItem[], footerItems: MenuItem[]) {
  if (SKIP_WARNINGS) return;

  const maxNewItemsPerLevel = 2;
  const allMenuItems = [...primaryItems, ...footerItems];
  const newPrimaryItems: MenuItem[] = [];
  const isNew = (item: MenuItem | SecondaryMenuItem) => item.badgeType === 'new';

  const getHiddenItems = (items: { label: string }[]) =>
    items
      .slice(maxNewItemsPerLevel)
      .map((item) => item.label)
      .join(', ');

  allMenuItems.forEach((item) => {
    const isNewPrimaryItem = isNew(item);
    const hasNewSecondaryItems = item.sections?.some((section) => section.items.some(isNew));

    if (isNewPrimaryItem || hasNewSecondaryItems) {
      newPrimaryItems.push(item);
    }
  });

  // Warn if too many new primary items
  if (newPrimaryItems.length > maxNewItemsPerLevel) {
    const hiddenItems = getHiddenItems(newPrimaryItems);
    warnOnce(
      `Max of ${maxNewItemsPerLevel} new primary items reached. The following will not show new indicators: ${hiddenItems}.`
    );
  }

  newPrimaryItems.slice(0, maxNewItemsPerLevel).forEach((item) => {
    const isNewPrimaryItem = isNew(item);
    const hasNewSecondaryItems = item.sections?.some((section) => section.items.some(isNew));

    // Warn if primary is new AND has new secondary children items in submenu
    if (isNewPrimaryItem && hasNewSecondaryItems) {
      warnOnce(
        `New primary item "${item.label}" should not have new secondary children items. They will not show new badges, only their parent will.`
      );
    }

    // Warn if too many new secondary items per parent
    const newSecondaryItems =
      item.sections?.flatMap((section) => section.items.filter(isNew)) ?? [];
    if (newSecondaryItems.length > maxNewItemsPerLevel) {
      const hiddenItems = getHiddenItems(newSecondaryItems);
      warnOnce(
        `Too many new secondary items in "${item.label}". The following will not show new badges: ${hiddenItems}.`
      );
    }
  });
}

/**
 * Finds an item href based on the last active item history for a panel opener.
 * @param panelId - The panel opener node id
 * @param sections - The secondary menu sections to search in
 * @param panelStateManager - Manager for panel opener state
 * @returns The href of the last active item, or undefined if not found
 */
const findItemByLastActive = (
  panelId: string,
  sections: SecondaryMenuSection[],
  panelStateManager: PanelStateManager
): string | undefined => {
  const lastActiveItemId = panelStateManager.getPanelLastActive(panelId);
  if (!lastActiveItemId) return undefined;

  for (const section of sections) {
    const foundItem = section.items.find((item) => item.id === lastActiveItemId);
    if (foundItem?.href) return foundItem.href;
  }

  return undefined;
};

/**
 * Finds the first available href from secondary menu sections.
 * @param sections - The secondary menu sections to search in
 * @returns The first available href, or undefined if none found
 */
const findFirstAvailableHref = (sections: SecondaryMenuSection[]): string | undefined => {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.href && !item.isExternal) {
        return item.href;
      }
    }
  }
};

/**
 * Determines the appropriate href for a panel opener node.
 * Uses last active item history first, then falls back to first available href.
 * @param navNode - The navigation node (panel opener)
 * @param secondarySections - The secondary menu sections
 * @param panelStateManager - Manager for panel opener state
 * @returns The determined href for the panel opener
 */
const getPanelOpenerHref = (
  navNode: ChromeProjectNavigationNode,
  secondarySections: SecondaryMenuSection[],
  panelStateManager: PanelStateManager
): string => {
  // Try to use last active item first
  const lastActiveHref = findItemByLastActive(navNode.id, secondarySections, panelStateManager);
  if (lastActiveHref) return lastActiveHref;

  // Fall back to first available href
  const firstAvailableHref = findFirstAvailableHref(secondarySections);

  // Warn if panel opener has its own href (which it shouldn't)
  if (navNode.href) {
    warnOnce(
      `Panel opener node "${navNode.id}" has a href "${
        navNode.href
      }", but it should not. We're using it as a panel opener that contains sections with links and we use the first link inside the section as the href ${
        firstAvailableHref ?? 'missing-href-😭'
      }.`
    );
  }

  return firstAvailableHref ?? 'missing-href-😭';
};
