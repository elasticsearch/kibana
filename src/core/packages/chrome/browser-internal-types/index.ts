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
import type { Capabilities } from '@kbn/core-capabilities-common';
import type { IBasePath } from '@kbn/core-http-browser';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
import type {
  ChromeSetup,
  ChromeStart,
  AppHeaderTitle,
  ChromeAppHeaderConfig,
  ChromeBadge,
  ChromeBreadcrumb,
  ChromeBreadcrumbsAppendExtension,
  ChromeBreadcrumbsBadge,
  ChromeAiButton,
  ChromeControls,
  ChromeHelp,
  ChromeNewsfeedHandler,
  ChromeUserBanner,
  GlobalSearchConfig,
  NavigationCustomization,
  NavigationTreeDefinition,
  NavigationTreeDefinitionUI,
  CloudURLs,
  SolutionId,
  ChromeProjectNavigationNode,
  ChromeSetProjectBreadcrumbsParams,
} from '@kbn/core-chrome-browser';

/** @internal */
export type InternalChromeSetup = ChromeSetup;

/** @internal */
export interface InlineAppHeaderState {
  title?: AppHeaderTitle;
}

/** @internal */
export interface InlineAppHeaderRegistration {
  update(title?: AppHeaderTitle): void;
  unregister(): void;
}

/** @internal */
export interface InternalChromeStart extends ChromeStart {
  /**
   * Dependencies used by Chrome-owned React components that live outside
   * `browser-internal`, but still render under `ChromeServiceProvider`.
   */
  componentDeps: {
    readonly basePath: IBasePath;
    readonly legacyActionMenu$: Observable<MountPoint | undefined>;
    readonly capabilities: Capabilities;
    readonly docTitleParts$: Observable<readonly string[]>;
  };

  sideNav: ChromeStart['sideNav'] & {
    /**
     * Set the width of the side nav.
     * @param width The width of the side nav in pixels.
     */
    setWidth(width: number): void;
  };

  /**
   * Get an observable of the current badge.
   * Only consumed by chrome components; plugins use `setBadge()`.
   */
  getBadge$(): Observable<ChromeBadge | undefined>;

  /**
   * Get an observable of the current header banner object.
   * Public consumers should use `hasHeaderBanner$()` instead.
   */
  getHeaderBanner$(): Observable<ChromeUserBanner | undefined>;

  /**
   * Get an observable of breadcrumb append extensions merged with badge extensions.
   * Unlike `getBreadcrumbsAppendExtensions$()` (public), this includes badges
   * converted to extensions. Used by chrome layout components.
   */
  getBreadcrumbsAppendExtensionsWithBadges$(): Observable<ChromeBreadcrumbsAppendExtension[]>;

  /**
   * Get an observable of the current breadcrumbs badges set via setBreadcrumbsBadges().
   */
  getBreadcrumbsBadges$(): Observable<ChromeBreadcrumbsBadge[]>;

  /** Set global footer. Used by the developer toolbar. */
  setGlobalFooter(node: ReactNode): void;

  /** Get an observable of the global footer node (devbar). */
  getGlobalFooter$(): Observable<ReactNode>;

  /** Project-style chrome APIs, used by the serverless plugin. */
  project: {
    /** Sets the cloud URLs for the project navigation. */
    setCloudUrls(cloudUrls: CloudURLs): void;

    /** Sets the Kibana name (project name for serverless, deployment name for ECH). */
    setKibanaName(kibanaName: string): void;

    /** Initialise project navigation from a definition tree. */
    initNavigation<TTree extends NavigationTreeDefinition>(
      id: SolutionId,
      navigationTree$: Observable<TTree>
    ): void;

    /** Get an observable of the resolved project navigation tree and active nodes. */
    getNavigation$(): Observable<{
      solutionId: SolutionId;
      navigationTree: NavigationTreeDefinitionUI;
      activeNodes: ChromeProjectNavigationNode[][];
      overflowItemIds: string[];
      /** Default top-level item IDs before any user customization is applied. */
      defaultItemIds: string[];
      /**
       * Top-level body nodes the sidebar will actually render: home node excluded,
       * hidden nodes removed, and panel-openers with no visible descendants pruned.
       */
      renderableNodes: ChromeProjectNavigationNode[];
    }>;

    /** Get an observable of the current project breadcrumbs. */
    getBreadcrumbs$(): Observable<ChromeBreadcrumb[]>;

    /** Get an observable of the project home URL derived from the navigation tree. */
    getProjectHome$(): Observable<string>;

    /**
     * Set project breadcrumbs.
     * @deprecated Project breadcrumb overrides remain only for compatibility fallback back
     * navigation. Declare hierarchy in the project navigation tree and pass explicit `back`
     * configuration to `AppHeader`.
     * @param breadcrumbs - Breadcrumb(s) to set.
     * @param params.absolute If true, replaces defaults; otherwise appends. Defaults to false.
     */
    setBreadcrumbs(
      breadcrumbs: ChromeBreadcrumb[] | ChromeBreadcrumb,
      params?: Partial<ChromeSetProjectBreadcrumbsParams>
    ): void;

    /**
     * Set navigation customization for live preview.
     * Pass undefined to clear the customization and revert to the original order.
     */
    setNavigationCustomization(customization: NavigationCustomization | undefined): void;

    /** Observable that emits the customize navigation handler when registered by the navigation plugin. */
    getCustomizeNavigationHandler$(): Observable<(() => void) | null>;

    /** Register the handler that opens the navigation customization modal. Called once by the navigation plugin. */
    registerCustomizeNavigationHandler(handler: () => void): void;
  };

  /** Persistent chrome controls, including getters for Chrome-owned renderers. */
  controls: InternalChromeControls;

  /** Help action registration, including getters for Chrome-owned renderers. */
  help: InternalChromeHelp;

  /** Chrome-owned app-header registry. Public apps should use `@kbn/app-header`. */
  appHeader: {
    set(config: ChromeAppHeaderConfig): () => void;
    get$(): Observable<ChromeAppHeaderConfig | undefined>;
  };

  /** Whether the active app currently mounts an inline `AppHeader`. */
  inlineAppHeader: {
    get$(): Observable<InlineAppHeaderState | undefined>;
    register(title?: AppHeaderTitle): InlineAppHeaderRegistration;
  };
}

/** @internal */
export interface InternalChromeControls extends ChromeControls {
  aiButton: ChromeControls['aiButton'] & {
    get$(): Observable<ChromeAiButton[]>;
  };
  globalSearch: ChromeControls['globalSearch'] & {
    get$(): Observable<GlobalSearchConfig | undefined>;
  };
  contextSwitcher: ChromeControls['contextSwitcher'] & {
    get$(): Observable<ReactNode>;
  };
  projectPicker: ChromeControls['projectPicker'] & {
    get$(): Observable<ReactNode>;
  };
  userMenu: ChromeControls['userMenu'] & {
    get$(): Observable<ReactNode>;
  };
}

/** @internal */
export interface InternalChromeHelp extends ChromeHelp {
  getFeedbackHandler$(): Observable<(() => void) | undefined>;
  getNewsfeedHandler$(): Observable<ChromeNewsfeedHandler | undefined>;
}
