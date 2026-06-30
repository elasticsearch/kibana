/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type ReactNode } from 'react';
import { type Observable, distinctUntilChanged, map, shareReplay } from 'rxjs';
import type { RecentlyAccessedService } from '@kbn/recently-accessed';
import type { AppHeaderConfig, GlobalHeaderAiButton } from '@kbn/core-chrome-browser';
import { SidebarServiceProvider } from '@kbn/core-chrome-sidebar-context';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import type { SidebarStart } from '@kbn/core-chrome-sidebar';
import type { FeatureFlagsStart } from '@kbn/core-feature-flags-browser';
import { isNextChrome } from '@kbn/core-chrome-feature-flags';
import type { InternalChromeStart } from './types';
import type { ChromeState } from './state/chrome_state';
import type { NavControlsService } from './services/nav_controls';
import type { NavLinksService } from './services/nav_links';
import type { ProjectNavigationService } from './services/project_navigation';
import type { DocTitleService } from './services/doc_title';

type NavControlsStart = ReturnType<NavControlsService['start']>;
type NavLinksStart = ReturnType<NavLinksService['start']>;
type ProjectNavigationStart = ReturnType<ProjectNavigationService['start']>;
type DocTitleStart = ReturnType<DocTitleService['start']>;
type RecentlyAccessedStart = ReturnType<RecentlyAccessedService['start']>;

export interface ChromeApiDeps {
  state: ChromeState;
  services: {
    navControls: NavControlsStart;
    navLinks: NavLinksStart;
    recentlyAccessed: RecentlyAccessedStart;
    docTitle: DocTitleStart;
    projectNavigation: ProjectNavigationStart;
  };
  sidebar: SidebarStart;
  featureFlags: FeatureFlagsStart;
  componentDeps: InternalChromeStart['componentDeps'];
}

export function createChromeApi({
  state,
  services,
  sidebar,
  featureFlags,
  componentDeps,
}: ChromeApiDeps): InternalChromeStart {
  const { projectNavigation } = services;

  const validateProjectStyle = () => {
    const style = state.style.chromeStyle.get();
    if (style !== 'project') {
      throw new Error(
        `Invalid ChromeStyle value of "${style}". This method requires ChromeStyle set to "project".`
      );
    }
  };

  const hasHeaderBanner$ = state.headerBanner.$.pipe(
    map((banner) => Boolean(banner)),
    distinctUntilChanged(),
    shareReplay(1)
  );

  const project: InternalChromeStart['project'] = {
    setCloudUrls: projectNavigation.setCloudUrls.bind(projectNavigation),
    setKibanaName: projectNavigation.setKibanaName.bind(projectNavigation),
    initNavigation: (id, navigationTree$) => {
      validateProjectStyle();
      projectNavigation.initNavigation(id, navigationTree$);
    },
    getNavigation$: () => projectNavigation.getNavigation$(),
    setBreadcrumbs: (breadcrumbs, params) =>
      projectNavigation.setProjectBreadcrumbs(breadcrumbs, params),
    getBreadcrumbs$: () => projectNavigation.getProjectBreadcrumbs$(),
    getProjectHome$: () => projectNavigation.getProjectHome$(),
    setNavigationCustomization: (customization) =>
      projectNavigation.setNavigationCustomization(customization),
    getCustomizeNavigationHandler$: () => projectNavigation.getCustomizeNavigationHandler$(),
    registerCustomizeNavigationHandler: (handler) =>
      projectNavigation.registerCustomizeNavigationHandler(handler),
  };

  let appHeaderRegistrationId = 0;

  const chromeStart: InternalChromeStart = {
    componentDeps,

    withProvider: (children: ReactNode) => {
      return (
        <ChromeServiceProvider value={{ chrome: chromeStart }}>
          <SidebarServiceProvider value={{ sidebar }}>{children}</SidebarServiceProvider>
        </ChromeServiceProvider>
      );
    },

    // Sub-services
    navControls: services.navControls,
    navLinks: services.navLinks,
    recentlyAccessed: services.recentlyAccessed,
    docTitle: services.docTitle,

    // Visibility
    getIsVisible$: () => state.visibility.isVisible$,
    setIsVisible: state.visibility.setIsVisible,

    // Badge (delegates to breadcrumbs badge pipeline)
    getBadge$: () => state.breadcrumbs.legacyBadge.$,
    setBadge: state.breadcrumbs.legacyBadge.set,

    // Footer
    getGlobalFooter$: () => state.globalFooter.$,
    setGlobalFooter: state.globalFooter.set,

    // Breadcrumbs
    getBreadcrumbs$: () => state.breadcrumbs.classic.$,
    getBreadcrumbs: () => state.breadcrumbs.classic.get(),
    setBreadcrumbs: (newBreadcrumbs, params = {}) => {
      state.breadcrumbs.classic.set(newBreadcrumbs);
      if (params.project) {
        const { value: projectValue, absolute = false } = params.project;
        project.setBreadcrumbs(projectValue ?? [], { absolute });
      }
    },
    getBreadcrumbsAppendExtensions$: () => state.breadcrumbs.appendExtensions.$,
    getBreadcrumbsAppendExtensionsWithBadges$: () => state.breadcrumbs.appendExtensionsWithBadges$,
    getBreadcrumbsBadges$: () => state.breadcrumbs.badges.$,
    setBreadcrumbsAppendExtension: (extension) => {
      state.breadcrumbs.appendExtensions.addSorted(
        extension,
        ({ order: orderA = 50 }, { order: orderB = 50 }) => orderA - orderB
      );
      return () => {
        state.breadcrumbs.appendExtensions.remove((ext) => ext === extension);
      };
    },
    setBreadcrumbsBadges: (badges) => state.breadcrumbs.badges.set(badges),

    // App Menu
    getAppMenu$: () => state.appMenu.$,
    setAppMenu: state.appMenu.set,

    // Help
    getHelpExtension$: () => state.help.extension.$,
    setHelpExtension: state.help.extension.set,
    getHelpSupportUrl$: () => state.help.supportUrl.$,
    setHelpSupportUrl: state.help.supportUrl.set,
    getGlobalHelpExtensionMenuLinks$: () => state.help.globalMenuLinks.$,
    registerGlobalHelpExtensionMenuLink: (link) => state.help.globalMenuLinks.add(link),
    getHelpMenuLinks$: () => services.navControls.getHelpMenuLinks$(),
    setHelpMenuLinks: services.navControls.setHelpMenuLinks,

    // Custom Nav Link
    getCustomNavLink$: () => state.customNavLink.$,
    setCustomNavLink: state.customNavLink.set,

    // Header Banner
    setHeaderBanner: state.headerBanner.set,
    getHeaderBanner$: () => state.headerBanner.$,
    hasHeaderBanner$: () => hasHeaderBanner$,
    hasHeaderBanner: () => Boolean(state.headerBanner.get()),

    // Chrome Style
    setChromeStyle: state.style.setChromeStyle,
    getChromeStyle$: () => state.style.chromeStyle$,
    getChromeStyle: () => state.style.chromeStyle.get(),

    // Side Nav
    sideNav: {
      getIsCollapsed$: () => state.sideNav.collapsed.$,
      getIsCollapsed: () => state.sideNav.collapsed.get(),
      setIsCollapsed: state.sideNav.collapsed.set,
      getWidth$: () => state.sideNav.width.$,
      getWidth: () => state.sideNav.width.get(),
      setWidth: state.sideNav.width.set,
    },

    // Project Navigation
    getActiveSolutionNavId$: () =>
      projectNavigation.getActiveSolutionNavId$() as ReturnType<
        InternalChromeStart['getActiveSolutionNavId$']
      >,
    getActiveSolutionNavId: () => projectNavigation.getActiveSolutionNavId(),
    project,
    next: {
      get isEnabled() {
        return isNextChrome(featureFlags);
      },
      aiButton: {
        get$: () => state.aiButton.$.pipe(map((buttons) => [...buttons])),
        register: (button: GlobalHeaderAiButton) => {
          state.aiButton.update((prev) => new Set([...prev, button]));
          return () => {
            state.aiButton.update((prev) => {
              const next = new Set(prev);
              next.delete(button);
              return next;
            });
          };
        },
      },
      globalSearch: {
        get$: () => state.globalSearch.$,
        set: (config) => state.globalSearch.set(config),
      },
      contextSwitcher: {
        get$: () => state.contextSwitcher.$,
        set: state.contextSwitcher.set,
      },
      inlineAppHeader: {
        get$: () => state.inlineAppHeader.$,
        set: state.inlineAppHeader.set,
      },
      appHeader: {
        get$: () => state.appHeader.$,
        set: (config: AppHeaderConfig) => {
          const registrationId = ++appHeaderRegistrationId;
          state.appHeader.set(config);
          return () => {
            if (registrationId === appHeaderRegistrationId) {
              state.appHeader.set(undefined);
            }
          };
        },
      },
      userMenu: {
        get$: () => state.userMenu.$,
        set: (content) => state.userMenu.set(content),
      },
      registerFeedbackHandler: (handler: () => void) => {
        state.feedbackHandler.set(handler);
        return () => {
          state.feedbackHandler.update((current) => (current === handler ? undefined : current));
        };
      },
      getFeedbackHandler$: () => state.feedbackHandler.$,
      registerNewsfeedHandler: (handler: { open: () => void; hasNew$: Observable<boolean> }) => {
        state.newsfeedHandler.set(handler);
        return () => {
          state.newsfeedHandler.update((current) => (current === handler ? undefined : current));
        };
      },
      getNewsfeedHandler$: () => state.newsfeedHandler.$,
    },
    sidebar,
  };

  return chromeStart;
}
