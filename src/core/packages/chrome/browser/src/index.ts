/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type {
  ChromeBreadcrumbsAppendExtension,
  ChromeBreadcrumb,
  ChromeSetBreadcrumbsParams,
} from './breadcrumb';
export type {
  AppHeaderBack,
  AppHeaderBadge,
  AppHeaderBadgeItem,
  AppHeaderConfig,
  AppHeaderEditableTitle,
  AppHeaderMetadataButtonItem,
  AppHeaderMetadataHealthItem,
  AppHeaderMetadataItem,
  AppHeaderMetadataItems,
  AppHeaderMetadataTextItem,
  AppHeaderTab,
  AppHeaderTabBadge,
  AppHeaderTabIconBadge,
  AppHeaderTitle,
  AppHeaderTitleSaveResult,
  ChromeNext,
  GlobalHeaderAiButton,
} from './chrome_next';
export type { ChromeSetup, ChromeStart } from './contracts';
export type { ChromeDocTitle } from './doc_title';
export type {
  ChromeHelpExtension,
  ChromeHelpExtensionLinkBase,
  ChromeHelpExtensionMenuLink,
  ChromeHelpExtensionMenuCustomLink,
  ChromeHelpExtensionMenuDocumentationLink,
  ChromeGlobalHelpExtensionMenuLink,
} from './help_extension';
export type { ChromeNavControls, ChromeNavControl, ChromeHelpMenuLink } from './nav_controls';
export type { ChromeNavLinks, ChromeNavLink } from './nav_links';
export type {
  ChromeRecentlyAccessed,
  ChromeRecentlyAccessedHistoryItem,
} from './recently_accessed';
export type { ChromeBadge, ChromeBreadcrumbsBadge, ChromeUserBanner, ChromeStyle } from './types';

export type {
  ChromeProjectNavigationNode,
  AppDeepLinkId,
  AppId,
  SolutionId,
  CloudLinkId,
  CloudLink,
  CloudLinks,
  CloudURLs,
  SideNavNodeStatus,
  ChromeSetProjectBreadcrumbsParams,
  NodeDefinition,
  RenderAs as NodeRenderAs,
  NavigationTreeDefinition,
  NavigationTreeDefinitionUI,
  SolutionNavigationDefinition,
  SolutionNavigationDefinitions,
  NavigationCustomization,
  NavigationCustomizationMove,
  EuiSideNavItemTypeEnhanced,
  RenderAs,
} from './project_navigation';

export type {
  SidebarApp,
  SidebarAppConfig,
  SidebarAppDefinition,
  SidebarSetup,
  SidebarStart,
} from './sidebar';

export type { GlobalSearchConfig } from './chrome_next/global_search';
