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
  ChromeExtensionPointNavigationNode,
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

type PanelOpenerChild = ChromeProjectNavigationNode | ChromeExtensionPointNavigationNode;

interface NavigationConversionContext {
  panelStateManager: PanelStateManager;
  deepestActiveItemId?: string;
  currentActiveItemIdLevel: number;
  isActive: (navNode: PanelOpenerChild) => boolean;
  maybeMarkActive: (
    navNode: PanelOpenerChild,
    level: number,
    parentNode?: ChromeProjectNavigationNode
  ) => void;
  getTestSubj: (navNode: ChromeProjectNavigationNode, append?: string[]) => string;
}

const createNavigationConversionContext = (
  activeNodes: PanelOpenerChild[][],
  panelStateManager: PanelStateManager
): NavigationConversionContext => {
  const ctx: NavigationConversionContext = {
    panelStateManager,
    currentActiveItemIdLevel: -1,
    isActive: (navNode) => isActiveFromUrl(navNode.path, activeNodes, false),
    maybeMarkActive: (navNode, level, parentNode) => {
      if (ctx.deepestActiveItemId == null || ctx.currentActiveItemIdLevel < level) {
        if (ctx.isActive(navNode)) {
          ctx.deepestActiveItemId = navNode.id;
          ctx.currentActiveItemIdLevel = level;

          if (parentNode?.id) {
            panelStateManager.setPanelLastActive(parentNode.id, navNode.id);
          }
        }
      }
    },
    getTestSubj: (navNode, append = []) => {
      const { id, path, deepLink } = navNode;
      return classnames(
        `nav-item`,
        `nav-item-${path}`,
        {
          [`nav-item-deepLinkId-${deepLink?.id}`]: !!deepLink,
          [`nav-item-id-${id}`]: id,
          [`nav-item-isActive`]: ctx.isActive(navNode),
        },
        ...append
      );
    },
  };

  return ctx;
};

const sectionHasContent = (section: SecondaryMenuSection): boolean =>
  !!section.slotId || !!(section.items && section.items.length > 0);

const createSecondaryMenuItem = (
  child: ChromeProjectNavigationNode,
  panelNode: ChromeProjectNavigationNode,
  ctx: NavigationConversionContext
): SecondaryMenuItem => {
  ctx.maybeMarkActive(child, 2, panelNode);
  return {
    id: child.id,
    label: toSentenceCase(warnIfMissing(child, 'title', 'Missing Title 😭')),
    href: warnIfMissing(child, 'href', 'Missing Href 😭'),
    isExternal: child.isExternalLink,
    'data-test-subj': ctx.getTestSubj(child),
    badgeType: child.badgeType,
  };
};

const createExtensionPointSection = (
  child: ChromeExtensionPointNavigationNode
): SecondaryMenuSection | null => {
  if (!child.slotId || !child.extensionId) {
    warnOnce(`Extension node "${child.id}" is missing slotId/extensionId. Ignoring this section.`);
    return null;
  }

  return {
    id: child.id,
    label: child.title ? toSentenceCase(child.title) : undefined,
    slotId: child.slotId,
    extensionId: child.extensionId,
    popoverOnly: child.popoverOnly,
  };
};

const createNamedSection = (
  child: ChromeProjectNavigationNode,
  panelNode: ChromeProjectNavigationNode,
  ctx: NavigationConversionContext
): SecondaryMenuSection | null => {
  const validChildren =
    child.children?.filter(
      (c): c is ChromeProjectNavigationNode =>
        c.renderAs !== 'extension' && c.sideNavStatus !== 'hidden'
    ) ?? [];
  const secondaryItems = validChildren.map((c) => createSecondaryMenuItem(c, panelNode, ctx));

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
};

const convertPanelOpenerSections = (
  panelNode: ChromeProjectNavigationNode,
  children: PanelOpenerChild[],
  ctx: NavigationConversionContext
): SecondaryMenuSection[] => {
  const visibleChildren = children.filter((child) => child.sideNavStatus !== 'hidden');
  const noSubSections = visibleChildren.every(
    (child) => child.renderAs === 'extension' || !!child.href
  );
  const hasNonExtensionLinks = visibleChildren.some((child) => child.renderAs !== 'extension');
  const useLegacyDirectLinkCoalescing = noSubSections && hasNonExtensionLinks;

  if (useLegacyDirectLinkCoalescing) {
    warnOnce(
      `Panel opener node "${
        panelNode.id
      }" should contain panel sections, not direct links. Flattening links "${visibleChildren
        .filter((child) => child.renderAs !== 'extension' && child.href)
        .map((child) => child.id)
        .join(', ')}" into secondary items and creating a placeholder section for these links.`
    );
  }

  const sections: SecondaryMenuSection[] = [];
  let directLinkBuffer: ChromeProjectNavigationNode[] = [];
  let coalescedSectionIndex = 0;

  const flushDirectLinkBuffer = () => {
    if (directLinkBuffer.length === 0) {
      return;
    }

    sections.push({
      id:
        coalescedSectionIndex === 0
          ? `${panelNode.id}-section`
          : `${panelNode.id}-section-${coalescedSectionIndex}`,
      items: directLinkBuffer.map((child) => createSecondaryMenuItem(child, panelNode, ctx)),
    });
    coalescedSectionIndex += 1;
    directLinkBuffer = [];
  };

  for (const child of children) {
    if (child.sideNavStatus === 'hidden') {
      continue;
    }

    if (child.renderAs === 'extension') {
      if (useLegacyDirectLinkCoalescing) {
        flushDirectLinkBuffer();
      }

      const extensionSection = createExtensionPointSection(child);
      if (extensionSection) {
        sections.push(extensionSection);
      }
      continue;
    }

    if (useLegacyDirectLinkCoalescing && child.href) {
      directLinkBuffer.push(child);
      continue;
    }

    if (child.href && !child.children?.length) {
      sections.push({
        id: child.id,
        items: [createSecondaryMenuItem(child, panelNode, ctx)],
      });
      continue;
    }

    if (child.children?.length) {
      const namedSection = createNamedSection(child, panelNode, ctx);
      if (namedSection && sectionHasContent(namedSection)) {
        sections.push(namedSection);
      }
    }
  }

  if (useLegacyDirectLinkCoalescing) {
    flushDirectLinkBuffer();
  }

  return sections.filter(sectionHasContent);
};

const convertPanelOpener = (
  navNode: ChromeProjectNavigationNode,
  ctx: NavigationConversionContext
): MenuItem | null => {
  if (!navNode.children?.length) {
    warnOnce(`Panel opener node "${navNode.id}" has no children. Ignoring it.`);
    return null;
  }

  const secondarySections = convertPanelOpenerSections(navNode, navNode.children, ctx);

  if (secondarySections.length === 0) {
    return null;
  }

  ctx.maybeMarkActive(navNode, 1);

  return {
    id: navNode.id,
    label: toSentenceCase(warnIfMissing(navNode, 'title', 'Missing Title 😭')),
    iconType: getNavigationNodeIcon(navNode),
    href: getPanelOpenerHref(navNode, secondarySections, ctx.panelStateManager),
    sections: secondarySections,
    'data-test-subj': ctx.getTestSubj(navNode),
    badgeType: navNode.badgeType,
    popoverOnly:
      secondarySections.length > 0 && secondarySections.every((section) => section.popoverOnly),
  };
};

const convertPrimaryLink = (
  navNode: ChromeProjectNavigationNode,
  ctx: NavigationConversionContext
): MenuItem => {
  ctx.maybeMarkActive(navNode, 1);

  return {
    id: navNode.id,
    label: toSentenceCase(warnIfMissing(navNode, 'title', 'Missing Title 😭')),
    iconType: getNavigationNodeIcon(navNode),
    href: warnIfMissing(navNode, 'href', 'missing-href-😭'),
    'data-test-subj': ctx.getTestSubj(navNode),
    badgeType: navNode.badgeType,
    popoverOnly: false,
  };
};

const convertRootNodes = (
  nodes: ChromeProjectNavigationNode[],
  ctx: NavigationConversionContext
): MenuItem[] => {
  const items: MenuItem[] = [];

  for (const navNode of nodes) {
    if (navNode.sideNavStatus === 'hidden') {
      continue;
    }

    if (navNode.renderAs === 'panelOpener') {
      const panelItem = convertPanelOpener(navNode, ctx);
      if (panelItem) {
        items.push(panelItem);
      }
      continue;
    }

    if (!navNode.href) {
      warnOnce(
        `Navigation node "${navNode.id}${
          navNode.title ? ` (${navNode.title})` : ''
        }" is missing href and is not a panel opener. This node was likely used as a sub-section. Ignoring this node and flattening its children: ${navNode.children
          ?.map((c) => c.id)
          .join(', ')}.`
      );

      if (navNode.children?.length) {
        const flattenableChildren = navNode.children.filter(
          (child): child is ChromeProjectNavigationNode => child.renderAs !== 'extension'
        );
        items.push(...convertRootNodes(flattenableChildren, ctx));
      }
      continue;
    }

    items.push(convertPrimaryLink(navNode, ctx));
  }

  return items;
};

const extractHomeNode = (
  primaryNodes: ChromeProjectNavigationNode[],
  isNextChrome: boolean,
  ctx: NavigationConversionContext
): { logoItem?: SideNavLogo; primaryNodes: ChromeProjectNavigationNode[] } => {
  const homeNodeIndex = primaryNodes.findIndex((node) => node.renderAs === 'home');

  if (homeNodeIndex === -1) {
    warnOnce(
      `No "home" node found in primary nodes. There should be a logo node with solution logo, name and home page href. renderAs: "home" is expected.`
    );
    return { primaryNodes };
  }

  const homeNode = primaryNodes[homeNodeIndex];
  ctx.maybeMarkActive(homeNode, 0);

  if (isNextChrome) {
    // TODO: https://github.com/elastic/kibana/issues/272291
    return {
      primaryNodes: primaryNodes.map((node, i) =>
        i === homeNodeIndex ? { ...node, title: HOME_TITLE, icon: 'home' } : node
      ),
    };
  }

  return {
    logoItem: {
      href: warnIfMissing(homeNode, 'href', '/missing-href-😭'),
      iconType: getNavigationNodeIcon(homeNode),
      id: warnIfMissing(homeNode, 'id', 'kibana'),
      label: warnIfMissing(homeNode, 'title', 'Kibana'),
      'data-test-subj': ctx.getTestSubj(homeNode, ['nav-item-home']),
    },
    primaryNodes: primaryNodes.filter((_, i) => i !== homeNodeIndex),
  };
};

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
 * - 3rd level is used for secondary navigation (children of panelOpener), processed in tree order:
 *   - `renderAs: 'extension'` nodes become dynamic extension slot sections (`slotId` / `extensionId`)
 *   - Nodes with children become named section headers; their children (L4) become menu items
 *   - Direct links (href, no children) are coalesced into anonymous sections when the panel has no section headers; otherwise each direct link becomes its own single-item section
 * - Footer is limited to 5 items maximum (extras are dropped with warning)
 *
 * @param navigationTree
 * @param activeNodes
 * @param overflowItemIds - Primary item ids moved into the overflow menu
 * @param panelStateManager - Manager for panel opener state
 * @param isNextChrome - Whether the navigation is in the next chrome
 */
export const toNavigationItems = (
  navigationTree: NavigationTreeDefinitionUI,
  activeNodes: PanelOpenerChild[][],
  overflowItemIds: string[] = [],
  panelStateManager: PanelStateManager,
  isNextChrome: boolean = false
): NavigationItems => {
  const ctx = createNavigationConversionContext(activeNodes, panelStateManager);
  const { logoItem, primaryNodes } = extractHomeNode(navigationTree.body, isNextChrome, ctx);

  const allPrimaryItems = convertRootNodes(primaryNodes, ctx);
  const overflowIdSet = new Set(overflowItemIds);
  const primaryItems = allPrimaryItems.filter((item) => !overflowIdSet.has(item.id));
  const overflowItems = allPrimaryItems.filter((item) => overflowIdSet.has(item.id));
  const footerItems = convertRootNodes(navigationTree.footer ?? [], ctx);

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
    activeItemId: ctx.deepestActiveItemId,
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
          section.items?.forEach((secondaryItem) => {
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
    const hasNewSecondaryItems = item.sections?.some((section) => section.items?.some(isNew));

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
    const hasNewSecondaryItems = item.sections?.some((section) => section.items?.some(isNew));

    // Warn if primary is new AND has new secondary children items in submenu
    if (isNewPrimaryItem && hasNewSecondaryItems) {
      warnOnce(
        `New primary item "${item.label}" should not have new secondary children items. They will not show new badges, only their parent will.`
      );
    }

    // Warn if too many new secondary items per parent
    const newSecondaryItems =
      item.sections?.flatMap((section) => section.items?.filter(isNew) ?? []) ?? [];
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
    if (!section.items) continue;
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
    if (!section.items) continue;
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
  const lastActiveHref = findItemByLastActive(navNode.id, secondarySections, panelStateManager);

  if (lastActiveHref) {
    if (navNode.href) {
      warnOnce(
        `Panel opener node "${navNode.id}" has a href "${navNode.href}", but it should not. Using last-active section href "${lastActiveHref}" instead.`
      );
    }
    return lastActiveHref;
  }

  const firstAvailableHref = findFirstAvailableHref(secondarySections);
  if (firstAvailableHref) {
    if (navNode.href) {
      warnOnce(
        `Panel opener node "${navNode.id}" has a href "${navNode.href}", but it should not. Using first available section href "${firstAvailableHref}" instead.`
      );
    }
    return firstAvailableHref;
  }

  // No section provides a static link (likely sections are extension points only).
  // Fall back to the panel opener's own resolved href.
  if (navNode.href) {
    return navNode.href;
  }

  return 'missing-href-😭';
};
