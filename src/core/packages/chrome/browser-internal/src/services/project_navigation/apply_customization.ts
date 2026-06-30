/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  CloudLinks,
  ChromeNavLink,
  ChromeProjectNavigationNode,
  NavigationCustomization,
  NavigationTreeDefinition,
  NavigationTreeDefinitionUI,
  SolutionId,
} from '@kbn/core-chrome-browser';
import { replayMoves } from '@kbn/core-chrome-navigation-customization';
import { i18n } from '@kbn/i18n';
import { flattenNav, getRenderableNodes, parseNavigationTree } from './utils';

const HOME_TITLE = i18n.translate('core.ui.chrome.sideNavigation.homeItemTitle', {
  defaultMessage: 'Home',
});

export interface ParsedNavigation {
  id: SolutionId;
  tree: ChromeProjectNavigationNode[];
  treeUI: NavigationTreeDefinitionUI;
  flattened: Record<string, ChromeProjectNavigationNode>;
  overflowItemIds: string[];
  defaultItemIds: string[];
  /**
   * Top-level body nodes the sidebar will actually render: hidden nodes removed
   * and panel-openers with no visible descendants pruned. The home node is
   * excluded unless `isHomeCustomizable` is set, in which case it is kept as a
   * regular customizable item.
   */
  renderableNodes: ChromeProjectNavigationNode[];
}

/**
 * Applies user customization (moves + hidden) to a raw navigation tree definition,
 * parses the result, and returns the enriched {@link ParsedNavigation} structure.
 *
 * Moves are replayed sequentially on the default body order. Moves whose `id` or
 * `afterId` no longer exist in the current tree are silently skipped, making the
 * logic resilient to navigation items being added or removed across releases.
 *
 * `defaultItemIds` is captured from the *original* body (before any moves) so
 * callers can always determine which items ship with the solution by default.
 *
 * When `isHomeCustomizable` is true the `renderAs: 'home'` node is treated as a
 * regular, customizable item: it is kept in `defaultItemIds`/`renderableNodes`
 * and normalized to the shared "Home" title and icon so the customize modal and
 * the rendered sidebar present it identically. When false (classic chrome) the
 * home node is excluded from customization and left for the render layer to
 * extract as the solution logo.
 */
export const applyCustomization = (
  solutionId: SolutionId,
  def: NavigationTreeDefinition,
  deepLinks: Record<string, ChromeNavLink>,
  cloudLinks: CloudLinks,
  customization: NavigationCustomization | undefined,
  isHomeCustomizable: boolean = false
): ParsedNavigation => {
  let body = [...def.body];
  let overflowItemIds: string[] = [];

  // Helper: resolve the stable ID for any top-level body item regardless of whether
  // the author used the `id` shorthand or the `link` deep-link reference.
  const getId = (item: (typeof body)[number]): string | undefined => item.id ?? item.link;

  // Capture default item IDs from the raw body before any customization is applied.
  const defaultItemIds = body
    .filter((item) => isHomeCustomizable || item.renderAs !== 'home')
    .map((item) => getId(item) as string)
    .filter(Boolean);

  if (customization) {
    overflowItemIds = customization.hidden;
    body = replayMoves(body, customization.moves, getId);
  }

  const { navigationTree, navigationTreeUI } = parseNavigationTree(
    solutionId,
    { ...def, body },
    { deepLinks, cloudLinks }
  );

  // When the home node is customizable it renders as a regular sidebar item, so
  // normalize its title/icon here once. Both `treeUI` (rendered sidebar) and
  // `renderableNodes` (customize modal) read from the same normalized body.
  const bodyUI = isHomeCustomizable
    ? navigationTreeUI.body.map((node) =>
        node.renderAs === 'home' ? { ...node, title: HOME_TITLE, icon: 'home' } : node
      )
    : navigationTreeUI.body;

  return {
    id: solutionId,
    treeUI: { ...navigationTreeUI, body: bodyUI },
    tree: navigationTree,
    flattened: flattenNav(navigationTree),
    overflowItemIds,
    defaultItemIds,
    renderableNodes: getRenderableNodes(bodyUI, isHomeCustomizable),
  };
};
