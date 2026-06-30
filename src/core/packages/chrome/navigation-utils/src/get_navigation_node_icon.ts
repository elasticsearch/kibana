/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AppDeepLinkIdToIcon } from './known_icons_mappings';

/**
 * Minimal structural subset of ChromeProjectNavigationNode.
 * Using a local interface instead of importing from @kbn/core-chrome-browser
 * keeps this package dependency-free, preventing a kbn_references cycle.
 */
interface NavigationNode {
  id: string;
  icon?: unknown;
  deepLink?: {
    euiIconType?: string;
    icon?: string;
  };
}

const SKIP_WARNINGS = process.env.NODE_ENV === 'production';

/** @internal */
export const NAVIGATION_NODE_ICON_FALLBACK = 'broom' as const;

const warnedMessages = new Set<string>();
let lastWarning = '';

const warnOnce = (message: string) => {
  if (SKIP_WARNINGS) return;
  if (!warnedMessages.has(message)) {
    warnedMessages.add(message);
  }
  setTimeout(() => {
    const header = '\n=== Navigation icon warnings ===\n';
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
};

/**
 * Resolves the EUI icon type for a project navigation node using the same
 * fallback chain as the side navigation renderer.
 *
 * Shared by `@kbn/core-chrome-browser-components` (via re-export from
 * `@kbn/core-chrome-browser`) and the navigation customization modal
 * (via dynamic import).
 */
export const getNavigationNodeIcon = (node: NavigationNode | null): string => {
  if (node?.icon) {
    return node.icon as string;
  }

  if (node && AppDeepLinkIdToIcon[node.id]) {
    return AppDeepLinkIdToIcon[node.id];
  }

  if (node?.deepLink?.euiIconType) {
    return node.deepLink.euiIconType;
  }

  if (node?.deepLink?.icon) {
    return node.deepLink.icon;
  }

  warnOnce(
    `No icon found for node "${node?.id}". Expected iconV2, icon, deepLink.euiIconType, deepLink.icon or a known deep link id. Using fallback icon "broom".`
  );

  return NAVIGATION_NODE_ICON_FALLBACK;
};
