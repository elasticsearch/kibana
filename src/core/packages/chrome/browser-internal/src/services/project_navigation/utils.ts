/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ChromeNavLink,
  ChromeProjectNavigationNode,
  NavigationTreeDefinition,
  NodeDefinition,
  NavigationTreeDefinitionUI,
  AppDeepLinkId,
  SideNavNodeStatus,
  CloudLinkId,
  CloudLinks,
  SolutionId,
} from '@kbn/core-chrome-browser/src';
import type { Location } from 'history';
import type { SideNavigationSection } from '@kbn/core-chrome-browser/src/project_navigation';

const wrapIdx = (index: number): string => `[${index}]`;

/**
 * Flatten the navigation tree into a record of path => node
 * for quicker access when detecting the active path
 *
 * @param navTree The navigation tree to flatten
 * @param prefix Array of path prefix (used in the recursion)
 * @returns The flattened navigation tree
 */
export const flattenNav = (
  navTree: ChromeProjectNavigationNode[],
  prefix: string[] = [],
  acc: Record<string, ChromeProjectNavigationNode> = {}
): Record<string, ChromeProjectNavigationNode> => {
  for (let idx = 0; idx < navTree.length; idx++) {
    const node = navTree[idx];
    const updatedPrefix = [...prefix, wrapIdx(idx)];
    const path = updatedPrefix.join('');
    const { children, ...rest } = node;
    acc[path] = children?.length ? rest : node;
    if (children?.length) {
      flattenNav(children, updatedPrefix, acc);
    }
  }
  return acc;
};

function truncateAt(str: string, divider: string): string {
  const position = str.indexOf(divider);
  return position !== -1 ? str.slice(0, position) : str;
}

export const stripQueryParams = (url: string) => truncateAt(url, '?');

/**
 * Extract the parent paths from a key
 *
 * @example
 * IN: "[0][1][2][0]"
 * OUT: ["[0]", "[0][1]", "[0][1][2]", "[0][1][2][0]"]
 *
 * @param key The key to extract parent paths from
 * @returns An array of parent paths
 */
function extractParentPaths(key: string, navTree: Record<string, ChromeProjectNavigationNode>) {
  // Split the string on every '][' to get an array of values without the brackets.
  const arr = key.split('][');
  if (arr.length === 1) {
    return arr;
  }
  // Add the brackets back in for the first and last elements, and all elements in between.
  arr[0] = `${arr[0]}]`;
  arr[arr.length - 1] = `[${arr[arr.length - 1]}`;
  for (let i = 1; i < arr.length - 1; i++) {
    arr[i] = `[${arr[i]}]`;
  }

  return arr
    .reduce<string[]>((acc, _currentValue, currentIndex) => {
      acc.push(arr.slice(0, currentIndex + 1).join(''));
      return acc;
    }, [])
    .filter((k) => Boolean(navTree[k]));
}

/**
 * Find the active nodes in the navigation tree based on the current Location.pathname
 * Note that the pathname cand match multiple navigation tree branches, each branch
 * will be returned as an array of nodes.
 *
 * @param currentPathname The current Location.pathname
 * @param navTree The flattened navigation tree
 * @returns The active nodes
 */
export const findActiveNodes = (
  currentPathname: string,
  navTree: Record<string, ChromeProjectNavigationNode>,
  location?: Location,
  prepend: (path: string) => string = (path) => path
): ChromeProjectNavigationNode[][] => {
  const activeNodes: ChromeProjectNavigationNode[][] = [];
  let maxLength = 0;
  const matchesByLength = new Map<number, string[]>();

  const activeNodeFromKey = (key: string): ChromeProjectNavigationNode => ({
    ...navTree[key],
  });

  Object.entries(navTree).forEach(([key, node]) => {
    if (node.getIsActive && location) {
      const isActive = node.getIsActive({ pathNameSerialized: currentPathname, location, prepend });
      if (isActive) {
        const keysWithParents = extractParentPaths(key, navTree);
        activeNodes.push(keysWithParents.map(activeNodeFromKey));
      }
      return;
    }

    const nodePath = node.deepLink?.url ? stripQueryParams(node.deepLink.url) : undefined;

    if (nodePath) {
      const match = currentPathname.startsWith(nodePath);

      if (match) {
        const { length } = nodePath;
        const bucket = matchesByLength.get(length) ?? [];
        bucket.push(key);
        bucket.sort((a, b) => b.length - a.length);
        matchesByLength.set(length, bucket);
        if (length > maxLength) maxLength = length;
      }
    }
  });

  const longestMatch = matchesByLength.get(maxLength);
  if (longestMatch) {
    longestMatch.forEach((key) => {
      const keysWithParents = extractParentPaths(key, navTree);
      activeNodes.push(keysWithParents.map(activeNodeFromKey));
    });
  }

  return activeNodes;
};

let uniqueId = 0;
const generateUniqueNodeId = () => `node${uniqueId++}`;

function isAbsoluteLink(link: string) {
  return link.startsWith('http://') || link.startsWith('https://');
}

function getNavigationNodeId(
  { id: _id, link }: Pick<NodeDefinition, 'id' | 'link'>,
  idGenerator = generateUniqueNodeId
): string {
  const id = _id ?? link;
  return id ?? idGenerator();
}

function getNodeStatus(
  {
    link,
    deepLink,
    cloudLink,
    sideNavStatus,
  }: {
    link?: string;
    deepLink?: ChromeNavLink;
    cloudLink?: CloudLinkId;
    sideNavStatus?: SideNavNodeStatus;
  },
  { cloudLinks }: { cloudLinks: CloudLinks }
): SideNavNodeStatus | 'remove' {
  if (link && (!deepLink || !deepLink.visibleIn.includes('projectSideNav'))) {
    // If a link is provided but no deepLink found, or the app excluded projectSideNav
    return 'remove';
  }

  if (cloudLink) {
    if (!cloudLinks[cloudLink]) {
      // Invalid cloudLinkId or link url has not been set in kibana.yml
      return 'remove';
    }
    // Cloud link permission checks are handled by the Cloud plugin's `getPrivilegedUrls()` method,
    // which gates URLs based on user privileges before they are set via `setCloudUrls()`.
  }

  return sideNavStatus ?? 'visible';
}

function getTitleForNode(
  navNode: { title?: string; deepLink?: { title: string }; cloudLink?: CloudLinkId },
  { deepLink, cloudLinks }: { deepLink?: ChromeNavLink; cloudLinks: CloudLinks }
): string | undefined {
  if (navNode.title) {
    return navNode.title;
  }

  if (deepLink?.title) {
    return deepLink.title;
  }

  if (navNode.cloudLink) {
    return cloudLinks[navNode.cloudLink]?.title ?? '';
  }

  return; // title is optional in EuiCollapsibleNavItemProps
}

function validateNodeProps<
  LinkId extends AppDeepLinkId = AppDeepLinkId,
  Id extends string = string,
  ChildrenId extends string = Id
>({ id, link, href, cloudLink, renderAs }: NodeDefinition<LinkId, Id, ChildrenId>) {
  if (link && cloudLink) {
    throw new Error(
      `[Chrome navigation] Error in node [${id}]. Only one of "link" or "cloudLink" can be provided.`
    );
  }
  if (href && cloudLink) {
    throw new Error(
      `[Chrome navigation] Error in node [${id}]. Only one of "href" or "cloudLink" can be provided.`
    );
  }
}

const initNavNode = <
  LinkId extends AppDeepLinkId = AppDeepLinkId,
  Id extends string = string,
  ChildrenId extends string = Id
>(
  node: NodeDefinition<LinkId, Id, ChildrenId>,
  {
    cloudLinks,
    deepLinks,
    parentNodePath,
    index = 0,
  }: {
    cloudLinks: CloudLinks;
    deepLinks: Record<string, ChromeNavLink>;
    parentNodePath?: string;
    index?: number;
  }
): ChromeProjectNavigationNode | null => {
  validateNodeProps(node);

  const { cloudLink, link, children, ...navNodeFromProps } = node;
  const deepLink = link !== undefined ? deepLinks[link] : undefined;
  const sideNavStatus = getNodeStatus(
    {
      link,
      deepLink,
      cloudLink,
      sideNavStatus: navNodeFromProps.sideNavStatus,
    },
    { cloudLinks }
  );

  if (sideNavStatus === 'remove') {
    return null;
  }

  const id = getNavigationNodeId(node, () => `node-${index}`) as Id;
  const title = getTitleForNode(node, { deepLink, cloudLinks });
  const isExternalLink = cloudLink != null;
  const href = isExternalLink ? cloudLinks[cloudLink]?.href : node.href;
  const path = parentNodePath ? `${parentNodePath}.${id}` : id;

  if (href && !isAbsoluteLink(href)) {
    throw new Error(`href must be an absolute URL. Node id [${id}].`);
  }

  const navNode: ChromeProjectNavigationNode = {
    ...navNodeFromProps,
    id,
    href: deepLink?.url ?? href,
    path,
    title,
    deepLink,
    isExternalLink,
    sideNavStatus,
  };

  return navNode;
};

/**
 * Returns the top-level body nodes that the sidebar will actually render, in
 * order. Specifically it prunes:
 *
 * - The home/logo node (`renderAs === 'home'`)
 * - Nodes explicitly hidden from the side nav (`sideNavStatus === 'hidden'`)
 * - Panel-opener nodes whose every descendant leaf has been removed or hidden
 *   (i.e. the user has no access to any item inside them)
 *
 * The result is the authoritative list for the customization modal so it shows
 * exactly the items the user can actually see and reorder.
 *
 * TODO: Once this is the established source of truth, `toNavigationItems` in
 * `@kbn/core-chrome-browser-components` can be simplified to consume this
 * pre-pruned list rather than re-filtering inside `toMenuItem`.
 *
 * Icon resolution for the same nodes lives in `@kbn/core-chrome-browser-navigation-utils`.
 */
export const getRenderableNodes = (
  nodes: ChromeProjectNavigationNode[]
): ChromeProjectNavigationNode[] => {
  const hasVisibleLeaf = (node: ChromeProjectNavigationNode): boolean => {
    if (node.sideNavStatus === 'hidden') return false;
    if (!node.children?.length) return Boolean(node.href);
    return node.children.some(hasVisibleLeaf);
  };

  return nodes.filter((node) => {
    if (node.renderAs === 'home') return false;
    if (node.sideNavStatus === 'hidden') return false;
    if (!hasVisibleLeaf(node)) return false;
    return true;
  });
};

export const parseNavigationTree = (
  id: SolutionId,
  navigationTreeDef: NavigationTreeDefinition,
  {
    deepLinks,
    cloudLinks,
  }: {
    deepLinks: Record<string, ChromeNavLink>;
    cloudLinks: CloudLinks;
  }
): {
  navigationTree: ChromeProjectNavigationNode[];
  navigationTreeUI: NavigationTreeDefinitionUI;
} => {
  // The navigation tree that represents the global navigation and will be used by the Chrome service
  const navigationTree: ChromeProjectNavigationNode[] = [];

  // Contains UI layout information (body, footer) and render "special" blocks like recently accessed.
  const navigationTreeUI: NavigationTreeDefinitionUI = { id, body: [] };

  const initNodeAndChildren = (
    node: NodeDefinition,
    { index = 0, parentPath = [] }: { index?: number; parentPath?: string[] } = {}
  ): ChromeProjectNavigationNode | null => {
    const navNode = initNavNode(node, {
      cloudLinks,
      deepLinks,
      parentNodePath: parentPath.length > 0 ? parentPath.join('.') : undefined,
      index,
    });

    if (navNode && node.children) {
      navNode.children = node.children
        .map((child, i) =>
          initNodeAndChildren(child, {
            index: i,
            parentPath: [...parentPath, navNode.id],
          })
        )
        .filter((child): child is ChromeProjectNavigationNode => child !== null);
    }

    return navNode;
  };

  const onNodeInitiated = (
    navNode: ChromeProjectNavigationNode | null,
    section: SideNavigationSection = 'body'
  ) => {
    if (navNode) {
      // Add the node to the global navigation tree
      navigationTree.push(navNode);

      // Add the node to the Side Navigation UI tree
      if (!navigationTreeUI[section]) {
        navigationTreeUI[section] = [];
      }
      navigationTreeUI[section]!.push(navNode);
    }
  };

  const parseNodesArray = (
    nodes?: NodeDefinition[],
    section: SideNavigationSection = 'body',
    startIndex = 0
  ): void => {
    if (!nodes) return;

    nodes.forEach((node, i) => {
      const navNode = initNodeAndChildren(node, { index: startIndex + i });
      onNodeInitiated(navNode, section);
    });
  };

  parseNodesArray(navigationTreeDef.body, 'body');
  parseNodesArray(navigationTreeDef.footer, 'footer', navigationTreeDef.body?.length ?? 0);

  return { navigationTree, navigationTreeUI };
};
