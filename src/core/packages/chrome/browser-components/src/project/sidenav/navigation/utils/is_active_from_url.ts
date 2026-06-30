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
} from '@kbn/core-chrome-browser';

type NavigationActiveNode = ChromeProjectNavigationNode | ChromeExtensionPointNavigationNode;

/**
 * Predicate to check if a nodePath is active
 *
 * @param nodePath The path of the node to check
 * @param activeNodes The active nodes to check against
 * @param onlyIfHighestMatch Flag to indicate if we should only return true if the nodePath is the highest match
 * @returns Boolean indicating if the nodePath is active
 */
export function isActiveFromUrl(
  nodePath: string,
  activeNodes: NavigationActiveNode[][],
  onlyIfHighestMatch = false
) {
  return activeNodes.reduce((acc, nodesBranch) => {
    if (acc === true) return true;
    return onlyIfHighestMatch
      ? isSamePath(nodesBranch[nodesBranch.length - 1].path, nodePath)
      : nodesBranch.some((branch) => isSamePath(branch.path, nodePath));
  }, false);
}

function isSamePath(pathA: string | null, pathB: string | null) {
  if (pathA === null || pathB === null) {
    return false;
  }
  return pathA === pathB;
}
