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
import { flattenNav, getRenderableNodes, parseNavigationTree } from './utils';

export interface ParsedNavigation {
  id: SolutionId;
  tree: ChromeProjectNavigationNode[];
  treeUI: NavigationTreeDefinitionUI;
  flattened: Record<string, ChromeProjectNavigationNode>;
  overflowItemIds: string[];
  defaultItemIds: string[];
  /**
   * Top-level body nodes the sidebar will actually render: home node excluded,
   * hidden nodes removed, and panel-openers with no visible descendants pruned.
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
 */
export const applyCustomization = (
  solutionId: SolutionId,
  def: NavigationTreeDefinition,
  deepLinks: Record<string, ChromeNavLink>,
  cloudLinks: CloudLinks,
  customization: NavigationCustomization | undefined
): ParsedNavigation => {
  let body = [...def.body];
  let overflowItemIds: string[] = [];

  // Helper: resolve the stable ID for any top-level body item regardless of whether
  // the author used the `id` shorthand or the `link` deep-link reference.
  const getId = (item: (typeof body)[number]): string | undefined => item.id ?? item.link;

  // Capture default item IDs from the raw body before any customization is applied.
  const defaultItemIds = body
    .filter((item) => item.renderAs !== 'home')
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

  return {
    id: solutionId,
    treeUI: navigationTreeUI,
    tree: navigationTree,
    flattened: flattenNav(navigationTree),
    overflowItemIds,
    defaultItemIds,
    renderableNodes: getRenderableNodes(navigationTreeUI.body),
  };
};
