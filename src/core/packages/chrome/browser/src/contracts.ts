/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import type { Observable } from 'rxjs';
import type { AppMenuConfig } from '@kbn/app-menu';
import type { ChromeControls } from './controls';
import type { ChromeHelp } from './help';
import type { ChromeNavLink, ChromeNavLinks } from './nav_links';
import type { ChromeRecentlyAccessed } from './recently_accessed';
import type { ChromeDocTitle } from './doc_title';
import type {
  ChromeGlobalHelpExtensionMenuLink,
  ChromeHelpExtension,
  ChromeHelpMenuLink,
} from './help_extension';
import type {
  ChromeBreadcrumb,
  ChromeBreadcrumbsAppendExtension,
  ChromeSetBreadcrumbsParams,
} from './breadcrumb';
import type { ChromeBadge, ChromeBreadcrumbsBadge, ChromeStyle, ChromeUserBanner } from './types';
import type { SolutionId } from './project_navigation';
import type { SidebarStart, SidebarSetup } from './sidebar';

/**
 * ChromeSetup exposes APIs available during the setup phase.
 * @public
 */
export interface ChromeSetup {
  /** {@link SidebarSetup} */
  sidebar: SidebarSetup;
}

/**
 * ChromeStart allows plugins to customize the global chrome header UI and
 * enrich the UX with additional information about the current location of the
 * browser.
 *
 * @remarks
 * While ChromeStart exposes many APIs, they should be used sparingly and the
 * developer should understand how they affect other plugins and applications.
 *
 * @example
 * How to add a recently accessed item to the sidebar:
 * ```ts
 * core.chrome.recentlyAccessed.add('/app/map/1234', 'Map 1234', '1234');
 * ```
 *
 * @example
 * How to set the help dropdown extension:
 * ```tsx
 * core.chrome.setHelpExtension({
 *   appName: 'My App',
 *   links: [{ linkType: 'documentation', href: docLinks.links.myApp.guide }],
 * });
 * ```
 *
 * @public
 */
export interface ChromeStart {
  /** {@inheritdoc ChromeNavLinks} */
  navLinks: ChromeNavLinks;
  /** {@inheritdoc ChromeRecentlyAccessed} */
  recentlyAccessed: ChromeRecentlyAccessed;
  /** {@inheritdoc ChromeDocTitle} */
  docTitle: ChromeDocTitle;
  /**
   * Persistent interactive chrome controls. Chrome decides where they render.
   *
   * {@inheritdoc ChromeControls}
   */
  controls: ChromeControls;

  /**
   * Newsfeed and Feedback action registration for the Help menu.
   *
   * {@inheritdoc ChromeHelp}
   */
  help: ChromeHelp;

  /**
   * Get an observable of the current visibility state of the chrome.
   */
  getIsVisible$(): Observable<boolean>;

  /**
   * Set the temporary visibility for the chrome. This does nothing if the chrome is hidden
   * by default and should be used to hide the chrome for things like full-screen modes
   * with an exit button.
   */
  setIsVisible(isVisible: boolean): void;

  /**
   * Get an observable of the current badge
   * @deprecated Pass `badges` to `AppHeader` from `@kbn/app-header`.
   */
  getBadge$(): Observable<ChromeBadge | undefined>;

  /**
   * Override the current badge.
   * @deprecated Pass `badges` to `AppHeader` from `@kbn/app-header`.
   */
  setBadge(badge?: ChromeBadge): void;

  /**
   * Get an observable of the current list of breadcrumbs
   */
  getBreadcrumbs$(): Observable<ChromeBreadcrumb[]>;

  /**
   * Get the current list of breadcrumbs synchronously
   */
  getBreadcrumbs(): ChromeBreadcrumb[];

  /**
   * Override the current set of breadcrumbs
   */
  setBreadcrumbs(newBreadcrumbs: ChromeBreadcrumb[], params?: ChromeSetBreadcrumbsParams): void;

  /**
   * Get an observable of the current app menu configuration
   * @deprecated Pass `menu` to `AppHeader` from `@kbn/app-header`.
   */
  getAppMenu$(): Observable<AppMenuConfig | undefined>;

  /**
   * Set the app menu configuration for the current application.
   *
   * @deprecated Pass `menu` to `AppHeader` from `@kbn/app-header`.
   */
  setAppMenu(config?: AppMenuConfig): void;

  /**
   * Get an observable of the current extensions appended to breadcrumbs
   * @deprecated Use the typed `favorite`, `badges`, or `metadata` props on `AppHeader` from
   * `@kbn/app-header`.
   */
  getBreadcrumbsAppendExtensions$(): Observable<ChromeBreadcrumbsAppendExtension[]>;

  /**
   * Render an element next to the last breadcrumb.
   *
   * @deprecated Use the typed `favorite`, `badges`, or `metadata` props on `AppHeader` from
   * `@kbn/app-header`.
   */
  setBreadcrumbsAppendExtension(
    breadcrumbsAppendExtension: ChromeBreadcrumbsAppendExtension
  ): () => void;

  /**
   * Set badges to be displayed in the breadcrumbs area.
   * The badges will always be displayed as the last {@link ChromeBreadcrumbsAppendExtension} in the breadcrumbs.
   * By default, when navigating within the same application, badges are not cleared automatically, you need to handle
   * their removal manually.
   *
   * @deprecated Pass `badges` to `AppHeader` from `@kbn/app-header`.
   *
   * @param badges - Array of {@link ChromeBreadcrumbsBadge} to display in the breadcrumbs area.
   */
  setBreadcrumbsBadges(badges: ChromeBreadcrumbsBadge[]): void;

  /**
   * Get an observable of the current custom nav link
   */
  getCustomNavLink$(): Observable<Partial<ChromeNavLink> | undefined>;

  /**
   * Override the current set of custom nav link
   */
  setCustomNavLink(newCustomNavLink?: Partial<ChromeNavLink>): void;

  /**
   * Get an observable of the current help menu links
   */
  getHelpMenuLinks$(): Observable<ChromeHelpMenuLink[]>;

  /**
   * Override the default links shown in the help menu
   */
  setHelpMenuLinks(links: ChromeHelpMenuLink[]): void;

  /**
   * Get the list of the registered global help extension menu links
   */
  getGlobalHelpExtensionMenuLinks$(): Observable<ChromeGlobalHelpExtensionMenuLink[]>;

  /**
   * Append a global help extension menu link
   */
  registerGlobalHelpExtensionMenuLink(
    globalHelpExtensionMenuLink: ChromeGlobalHelpExtensionMenuLink
  ): void;

  /**
   * Get an observable of the current custom help content
   */
  getHelpExtension$(): Observable<ChromeHelpExtension | undefined>;

  /**
   * Override the current set of custom help content.
   */
  setHelpExtension(helpExtension?: ChromeHelpExtension): void;

  /**
   * Override the default support URL shown in the help menu
   * @param url The updated support URL
   */
  setHelpSupportUrl(url: string): void;

  /**
   * Get the support URL shown in the help menu
   */
  getHelpSupportUrl$(): Observable<string>;

  /**
   * Set the banner that will appear on top of the chrome header.
   *
   * @remarks Using `undefined` when invoking this API will remove the banner.
   */
  setHeaderBanner(headerBanner?: ChromeUserBanner): void;

  /**
   * Get an observable of the current header banner presence state.
   */
  hasHeaderBanner$(): Observable<boolean>;

  /**
   * Get the current header banner presence synchronously.
   */
  hasHeaderBanner(): boolean;

  /**
   * Sets the style type of the chrome.
   * @param style The style type to apply to the chrome.
   */
  setChromeStyle(style: ChromeStyle): void;

  /**
   * Get an observable of the current style type of the chrome.
   */
  getChromeStyle$(): Observable<ChromeStyle>;

  /**
   * Get the current style type synchronously.
   */
  getChromeStyle(): ChromeStyle;

  sideNav: {
    /**
     * Get an observable of the current collapsed state of the side nav.
     */
    getIsCollapsed$(): Observable<boolean>;

    /**
     * Get the current collapsed state of the side nav synchronously.
     */
    getIsCollapsed(): boolean;

    /**
     * Set the collapsed state of the side nav.
     * @param isCollapsed The collapsed state of the side nav.
     */
    setIsCollapsed(isCollapsed: boolean): void;

    /**
     * Get an observable of the current width of the side nav.
     */
    getWidth$(): Observable<number>;

    /**
     * Get the current width of the side nav synchronously.
     */
    getWidth(): number;
  };

  /**
   * {@link SidebarStart}
   */
  sidebar: SidebarStart;

  /**
   * Get the id of the currently active project navigation or `null` otherwise.
   */
  getActiveSolutionNavId$(): Observable<SolutionId | null>;

  /**
   * Get the id of the currently active project navigation synchronously.
   */
  getActiveSolutionNavId(): SolutionId | null;

  /**
   * Used only by the rendering service and KibanaRenderingContextProvider to wrap the rendering tree in the Chrome context providers
   */
  withProvider(component: ReactNode): ReactNode;
}
