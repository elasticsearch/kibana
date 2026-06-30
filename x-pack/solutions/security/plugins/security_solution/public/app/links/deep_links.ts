/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subject, Subscription } from 'rxjs';
import { combineLatestWith, debounceTime } from 'rxjs';
import type { AppDeepLink, AppUpdater, AppDeepLinkLocations } from '@kbn/core/public';
import type { SecurityPageName } from '@kbn/deeplinks-security';
import type {
  NavigationTreeDefinition,
  NodeDefinition,
  PanelOpenerChildDefinition,
  StandardNodeDefinition,
} from '@kbn/core-chrome-browser';
import { SecurityLinkGroup } from '@kbn/security-solution-navigation/links';
import type { SecurityGroupName } from '@kbn/security-solution-navigation';
import type { AppLinkItems, LinkItem, NormalizedLinks } from '../../common/links/types';
import { applicationLinksUpdater } from './application_links_updater';

// TODO: remove after rollout https://github.com/elastic/kibana/issues/179572
const classicFormatter: (appLinks: AppLinkItems) => AppDeepLink[] = (appLinks) =>
  appLinks
    .filter(({ unauthorized }) => !unauthorized)
    .map((appLink) => {
      const visibleIn: Set<AppDeepLinkLocations> = new Set(appLink.visibleIn ?? []);
      if (!appLink.globalSearchDisabled) {
        visibleIn.add('globalSearch');
      }
      if (appLink.globalNavPosition != null) {
        visibleIn.add('classicSideNav');
      }
      const deepLink: AppDeepLink = {
        id: appLink.id,
        path: appLink.path,
        title: appLink.title,
        visibleIn: Array.from(visibleIn),
        ...(appLink.globalNavPosition != null ? { order: appLink.globalNavPosition } : {}),
        ...(appLink.globalSearchKeywords != null ? { keywords: appLink.globalSearchKeywords } : {}),
        ...(appLink.links && appLink.links?.length
          ? {
              deepLinks: classicFormatter(appLink.links),
            }
          : {}),
      };
      return deepLink;
    });

/**
 * Converts the navigation tree to a deepLinks hierarchy format using the application normalized links.
 * @param navigationTree - The navigation tree to convert
 * @param normalizedLinks - The normalized links to use for formatting
 * @returns The formatted deep links
 */
export const solutionFormatter = (
  navigationTree: NavigationTreeDefinition,
  normalizedLinks: NormalizedLinks
): AppDeepLink[] => {
  const { body, footer = [] } = navigationTree;
  const nodes: NodeDefinition[] = [];
  [...body, ...footer].forEach((rootNode) => {
    nodes.push(rootNode);
  });

  return solutionNodesFormatter(nodes, normalizedLinks);
};

type SolutionNavNode = NodeDefinition | PanelOpenerChildDefinition | StandardNodeDefinition;

const solutionNodesFormatter = (
  navigationNodes: SolutionNavNode[],
  normalizedLinks: NormalizedLinks
): AppDeepLink[] => {
  const deepLinks: AppDeepLink[] = [];

  navigationNodes.forEach((node) => {
    // skip extension nodes
    if (node.renderAs === 'extension') {
      return;
    }

    // Process links without an id: external links or second level groups
    if (!node.id && node.children) {
      deepLinks.push(...solutionNodesFormatter(node.children, normalizedLinks));
      return;
    }

    // Process top level groups
    const linkGroup = SecurityLinkGroup[node.id as SecurityGroupName];
    if (linkGroup) {
      const childrenLinks = solutionNodesFormatter(node.children ?? [], normalizedLinks);
      if (childrenLinks.length > 0) {
        deepLinks.push({
          id: node.id as string,
          title: linkGroup.title,
          deepLinks: childrenLinks,
        });
      }
      return;
    }

    // Process security links
    const appLink = normalizedLinks[node.id as SecurityPageName];
    if (appLink && !appLink.unauthorized) {
      const deepLink = formatDeepLink(appLink);
      if (appLink.unavailable) {
        deepLink.visibleIn = ['projectSideNav']; // Links marked as unavailable have an upselling page to display, show only in projectSideNav
      }
      if (node.children) {
        const childrenLinks = solutionNodesFormatter(node.children, normalizedLinks);
        if (childrenLinks.length > 0) {
          deepLink.deepLinks = childrenLinks;
        }
      }
      deepLinks.push(deepLink);
      return;
    }

    // Process other links with id other than security links or groups
    if (node.children) {
      deepLinks.push(...solutionNodesFormatter(node.children, normalizedLinks));
    }
  });

  return deepLinks;
};

const formatDeepLink = (appLink: LinkItem): AppDeepLink => {
  const visibleIn: Set<AppDeepLinkLocations> = new Set(appLink.visibleIn ?? []);
  if (!appLink.globalSearchDisabled) {
    visibleIn.add('globalSearch');
  }
  if (!appLink.sideNavDisabled) {
    visibleIn.add('projectSideNav');
  }
  const deepLink: AppDeepLink = {
    id: appLink.id,
    path: appLink.path,
    title: appLink.title,
    visibleIn: Array.from(visibleIn),
    ...(appLink.globalSearchKeywords != null ? { keywords: appLink.globalSearchKeywords } : {}),
  };
  return deepLink;
};

/**
 * Registers any change in appLinks to be updated in app deepLinks
 */
export const registerDeepLinksUpdater = (
  appUpdater$: Subject<AppUpdater>,
  navigationTree$: Subject<NavigationTreeDefinition | null>
): Subscription => {
  return navigationTree$
    .pipe(
      combineLatestWith(applicationLinksUpdater.links$, applicationLinksUpdater.normalizedLinks$),
      debounceTime(100) // Debounce to avoid too many updates
    )
    .subscribe(([navigationTree, appLinks, normalizedLinks]) => {
      const deepLinks =
        navigationTree == null
          ? classicFormatter(appLinks)
          : solutionFormatter(navigationTree, normalizedLinks);

      appUpdater$.next(() => ({ deepLinks }));
    });
};
