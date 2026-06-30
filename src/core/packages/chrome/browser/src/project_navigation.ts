/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Location } from 'history';
import type { EuiSideNavItemType, IconType } from '@elastic/eui';
import type { Observable } from 'rxjs';
import type { AppId as DevToolsApp, DeepLinkId as DevToolsLink } from '@kbn/deeplinks-devtools';
import type {
  AppId as AnalyticsApp,
  DeepLinkId as AnalyticsDeepLink,
} from '@kbn/deeplinks-analytics';
import type { AppId as MlApp, DeepLinkId as MlLink } from '@kbn/deeplinks-ml';
import type {
  AppId as ManagementApp,
  DeepLinkId as ManagementLink,
} from '@kbn/deeplinks-management';
import type {
  DeepLinkId as SearchLink,
  EnterpriseSearchAnalyticsApp,
  EnterpriseSearchApp,
  EnterpriseSearchApplicationsApp,
  EnterpriseSearchContentApp,
} from '@kbn/deeplinks-search';
import type {
  AppId as ObservabilityApp,
  DeepLinkId as ObservabilityLink,
} from '@kbn/deeplinks-observability';
import type { AppId as SecurityApp, DeepLinkId as SecurityLink } from '@kbn/deeplinks-security';
import type { AppId as FleetApp, DeepLinkId as FleetLink } from '@kbn/deeplinks-fleet';
import type { AppId as SharedApp, DeepLinkId as SharedLink } from '@kbn/deeplinks-shared';
import type { WorkplaceAIApp, DeepLinkId as WorkplaceAILink } from '@kbn/deeplinks-workplace-ai';
import type { VectordbApp, DeepLinkId as VectordbLink } from '@kbn/deeplinks-vectordb';
import type { DeepLinkId as AgentBuilderLink } from '@kbn/deeplinks-agent-builder';
import type { AppId as WorkflowsApp, DeepLinkId as WorkflowsLink } from '@kbn/deeplinks-workflows';
import type { KibanaProject } from '@kbn/projects-solutions-groups';
import type { BadgeType } from '@kbn/ui-side-navigation';

import type { ChromeNavLink } from './nav_links';

export type SolutionId = KibanaProject;

/** @public */
export type AppId =
  | DevToolsApp
  | AnalyticsApp
  | MlApp
  | ManagementApp
  | EnterpriseSearchApp
  | EnterpriseSearchContentApp
  | EnterpriseSearchApplicationsApp
  | EnterpriseSearchAnalyticsApp
  | ObservabilityApp
  | SecurityApp
  | FleetApp
  | SharedApp
  | WorkplaceAIApp
  | VectordbApp
  | WorkflowsApp;

/** @public */
export type AppDeepLinkId =
  | AnalyticsDeepLink
  | DevToolsLink
  | MlLink
  | ManagementLink
  | SearchLink
  | ObservabilityLink
  | SecurityLink
  | FleetLink
  | SharedLink
  | WorkplaceAILink
  | VectordbLink
  | AgentBuilderLink
  | WorkflowsLink;

/** @public */
export type CloudLinkId =
  | 'userAndRoles'
  | 'performance'
  | 'billingAndSub'
  | 'deployment'
  | 'deployments'
  | 'projects';

export interface CloudURLs {
  baseUrl?: string;
  billingUrl?: string;
  deploymentsUrl?: string;
  deploymentUrl?: string;
  projectsUrl?: string;
  performanceUrl?: string;
  usersAndRolesUrl?: string;
}

export interface CloudLink {
  title: string;
  href: string;
}

export type CloudLinks = {
  [id in CloudLinkId]?: CloudLink;
};

export type SideNavNodeStatus = 'hidden' | 'visible';

export type RenderAs = 'home' | 'panelOpener';

export type GetIsActiveFn = (params: {
  /** The current path name including the basePath + hash value but **without** any query params */
  pathNameSerialized: string;
  /** The history Location */
  location: Location;
  /** Utiliy function to prepend a path with the basePath */
  prepend: (path: string) => string;
}) => boolean;

/**
 * Base definition of navigation nodes. A node can either be a "group" or an "item".
 * Each have commmon properties and specific properties.
 */
interface NodeDefinitionBase {
  /**
   * Optional icon for the navigation node. Note: not all navigation depth will render the icon
   */
  icon?: IconType;

  /**
   * href for absolute links only. Internal links should use "link".
   */
  href?: string;
  /**
   * Optional status to indicate if the breadcrumb should be hidden when this node is active.
   * @default 'visible'
   */
  breadcrumbStatus?: 'hidden' | 'visible';
  /**
   * Optional status to indicate if the node should be hidden in the side nav (but still present in the navigation tree).
   * @default 'visible'
   */
  sideNavStatus?: SideNavNodeStatus;
  /**
   * Optional function to get the active state. This function is called whenever the location changes.
   */
  getIsActive?: GetIsActiveFn;

  /**
   * Indicate if this is a special node
   * - home - node should be rendered as the home link
   */
  renderAs?: RenderAs;

  /**
   * (optional) The type of badge shown next to the item (e.g. `beta`, `techPreview`, `new`).
   */
  badgeType?: BadgeType;
}

/** @public */
/**
 * Chrome project navigation node. This is the tree definition stored in the Chrome service
 * that is generated based on the NodeDefinition below.
 * Some of the process that occurs between the 2 are:
 * - "link" prop get converted to existing ChromNavLink
 * - "path" is added to each node based on where it is located in the tree
 * - "isActive" state is set for each node if its URL matches the current location
 */
export interface ChromeProjectNavigationNode extends NodeDefinitionBase {
  /** Optional id, if not passed a "link" must be provided. */
  id: string;
  /** Optional title. If not provided and a "link" is provided the title will be the Deep link title */
  title?: string;
  /** Path in the tree of the node */
  path: string;
  /** App id or deeplink id */
  deepLink?: ChromeNavLink;
  /**
   * Optional children of the navigation node. Once a node has "children" defined it is
   * considered a "group" node.
   */
  children?: ChromeProjectNavigationNode[];
  /**
   * Flag to indicate if the node is an "external" cloud link
   */
  isExternalLink?: boolean;
}

/** @public */
export interface ChromeSetProjectBreadcrumbsParams {
  absolute: boolean;
}

/**
 * @public
 *
 * A navigation node definition with its unique id, title, path in the tree and optional
 * deep link and children.
 * This definition serves to build the full ChromeProjectNavigation.navigationTree, converting
 * "link" to "deepLink" and adding the "path" property for each node.
 */
export interface NodeDefinition<
  LinkId extends AppDeepLinkId = AppDeepLinkId,
  Id extends string = string,
  ChildrenId extends string = Id
> extends NodeDefinitionBase {
  /** Optional id, if not passed a "link" must be provided. */
  id?: Id;
  /** Optional title. If not provided and a "link" is provided the title will be the Deep link title */
  title?: string;
  /** App id or deeplink id */
  link?: LinkId;
  /** Cloud link id */
  cloudLink?: CloudLinkId;
  /** Optional children of the navigation node. Can not be used with `isGroupTitle` */
  children?: Array<NodeDefinition<LinkId, Id, ChildrenId>>;
}

/**
 * @public
 *
 * Definition for the complete navigation tree, including body and footer
 */
export interface NavigationTreeDefinition<
  LinkId extends AppDeepLinkId = AppDeepLinkId,
  Id extends string = string,
  ChildrenId extends string = Id
> {
  /**
   * Main content of the navigation.
   * */
  body: Array<NodeDefinition<LinkId, Id, ChildrenId>>;
  /**
   * Footer content of the navigation
   * */
  footer?: Array<NodeDefinition<LinkId, Id, ChildrenId>>;
}

export type SideNavigationSection = keyof NavigationTreeDefinition;

/**
 * @public
 *
 * Definition for the complete navigation tree, including body and footer
 * that is used by the UI to render the navigation.
 * This interface is the result of parsing the definition above (validating, replacing "link" props
 * with their corresponding "deepLink"...)
 */
export interface NavigationTreeDefinitionUI {
  id: SolutionId;
  body: Array<ChromeProjectNavigationNode>;
  footer?: Array<ChromeProjectNavigationNode>;
}

/**
 * @public
 *
 * Definition for a solution navigation in stateful Kibana.
 *
 * This definition is used to register a solution navigation in the Chrome service
 * for the side navigation evolution to align with the Serverless UX.
 */

export interface SolutionNavigationDefinition<LinkId extends AppDeepLinkId = AppDeepLinkId> {
  /** Unique id for the solution navigation. */
  id: SolutionId;
  /** Title for the solution navigation. */
  title: string;
  /** The navigation tree definition */
  navigationTree$: Observable<NavigationTreeDefinition<LinkId>>;
  /** Optional icon for the solution navigation to render in the select dropdown. */
  icon?: IconType;
}

export type SolutionNavigationDefinitions = {
  [id in SolutionId]?: SolutionNavigationDefinition;
};

/**
 * Temporary helper interface while we have to maintain both the legacy side navigation
 * and the new "solution view" one. The legacy uses EuiSideNavItemType and its properties are not fully compatible
 * with the NodeDefinition. Solution teams declare their "classic" navigation using the EuiSideNavItemType.
 * Converting those to the `NodeDefinition` require some additional props.
 */
export type EuiSideNavItemTypeEnhanced<T = unknown> = Omit<EuiSideNavItemType<T>, 'items'> & {
  items?: Array<EuiSideNavItemTypeEnhanced<unknown>>;
  iconToString?: string;
  nameToString?: string;
};

/** A single user-specified move: place item `id` directly after item `afterId` (or at position 0 if `afterId` is null). */
export interface NavigationCustomizationMove {
  id: string;
  afterId: string | null;
}

/**
 * Customization configuration for navigation items, stored as a delta from the default order.
 * Resilient to nav items being added, removed, or reordered by default across releases.
 */
export interface NavigationCustomization {
  /**
   * User-specified moves applied sequentially on top of the default order.
   * Only items the user explicitly moved are recorded.
   * Moves operate on the full item list (including hidden items).
   */
  moves: NavigationCustomizationMove[];
  /** IDs of items to hide from the main navigation (moved to overflow menu). */
  hidden: AppDeepLinkId[];
}
