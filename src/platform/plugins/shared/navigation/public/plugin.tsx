/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import { of, ReplaySubject, take, map, switchMap } from 'rxjs';
import type {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  HttpStart,
} from '@kbn/core/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { Space } from '@kbn/spaces-plugin/public';
import { type SolutionId } from '@kbn/core-chrome-browser';
import type { InternalChromeStart } from '@kbn/core-chrome-browser-internal';
import type {
  NavigationPublicSetup,
  NavigationPublicStart,
  NavigationPublicSetupDependencies,
  NavigationPublicStartDependencies,
  AddSolutionNavigationArg,
} from './types';
import { TopNavMenuExtensionsRegistry, createTopNav } from './top_nav_menu';
import type { RegisteredTopNavMenuData } from './top_nav_menu/top_nav_menu_data';
import { NavigationCustomizationService } from './navigation_customization';

export class NavigationPublicPlugin
  implements
    Plugin<
      NavigationPublicSetup,
      NavigationPublicStart,
      NavigationPublicSetupDependencies,
      NavigationPublicStartDependencies
    >
{
  private readonly topNavMenuExtensionsRegistry: TopNavMenuExtensionsRegistry =
    new TopNavMenuExtensionsRegistry();
  private readonly stop$ = new ReplaySubject<void>(1);
  private readonly solutionNavDefinitions = new Map<SolutionId, AddSolutionNavigationArg>();
  private readonly customizationService = new NavigationCustomizationService();
  private chrome?: InternalChromeStart;
  private activeSolutionId: SolutionId | null = null;
  private isSolutionNavEnabled = false;

  constructor(private initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup, deps: NavigationPublicSetupDependencies): NavigationPublicSetup {
    return {
      registerMenuItem: this.topNavMenuExtensionsRegistry.register.bind(
        this.topNavMenuExtensionsRegistry
      ),
    };
  }

  public start(
    core: CoreStart,
    depsStart: NavigationPublicStartDependencies
  ): NavigationPublicStart {
    const { unifiedSearch, cloud, spaces, security } = depsStart;
    const extensions = this.topNavMenuExtensionsRegistry.getAll();
    const chrome = core.chrome as InternalChromeStart;
    this.chrome = chrome;
    const activeSpace$: Observable<Space | undefined> = spaces?.getActiveSpace$() ?? of(undefined);
    const isServerless = this.initializerContext.env.packageInfo.buildFlavor === 'serverless';
    this.isSolutionNavEnabled = spaces?.isSolutionViewEnabled ?? false;
    const isUnauthenticated = this.getIsUnauthenticated(core.http);

    /**
     * @deprecated Use AppMenu from "@kbn/core-chrome-app-menu" instead
     */
    const createCustomTopNav = (
      /*
       * Custom instance of unified search if it needs to be overridden
       *
       * */
      customUnifiedSearch?: UnifiedSearchPublicPluginStart,
      customExtensions?: RegisteredTopNavMenuData[]
    ) => {
      return createTopNav(customUnifiedSearch ?? unifiedSearch, customExtensions ?? extensions);
    };

    const initSolutionNavigation = (activeSpace?: Space) => {
      this.initiateChromeStyleAndSideNav(chrome, {
        isServerless,
        activeSpace,
      });

      if (!this.isSolutionNavEnabled) return;

      if (cloud) {
        chrome.project.setCloudUrls(cloud.getUrls()); // Ensure the project has the non-privileged URLs immediately
        cloud.getPrivilegedUrls().then((privilegedUrls) => {
          if (Object.keys(privilegedUrls).length === 0) return;

          chrome.project.setCloudUrls({ ...privilegedUrls, ...cloud.getUrls() }); // Merge the privileged URLs once available
        });
      }

      // Add the "Customize navigation" user-menu link once the active space
      // confirms a project-nav solution. The handler may have already been
      // registered synchronously below; enableUi's per-capability idempotency
      // guards prevent double-registration.
      if (security && !isServerless && getIsProjectNav(activeSpace?.solution)) {
        this.customizationService.enableUi({ core, chrome, security });
      }
    };

    if (isUnauthenticated) {
      // Don't fetch the active space if the user is not authenticated
      initSolutionNavigation();
    } else {
      activeSpace$.pipe(take(1)).subscribe(initSolutionNavigation);
    }

    // Register the chrome customize-navigation handler synchronously so it is
    // available before the active-space observable resolves. The menu link is
    // added separately (above) once the space is confirmed as project-nav.
    if (this.isSolutionNavEnabled) {
      this.customizationService.enableUi({ core, chrome });
    }

    // Sync stored customization to chrome. Initial emission is synchronous
    // (preload: true on the server), keeping startup ordering safe.
    this.customizationService.start({ core, chrome, isUnauthenticated });

    if (isServerless && !isUnauthenticated) {
      // In serverless, the serverless plugin initializes project navigation directly,
      // bypassing this plugin's addSolutionNavigation flow. Listen for the navigation
      // to become available, then enable customization support.
      chrome.project
        .getNavigation$()
        .pipe(take(1))
        .subscribe(({ solutionId }) => {
          this.activeSolutionId = solutionId;
          this.customizationService.enableUi({ core, chrome, security });
        });
    }

    return {
      ui: {
        /**
         * @deprecated Use AppMenu from "@kbn/core-chrome-app-menu" instead
         */
        TopNavMenu: createTopNav(unifiedSearch, extensions),
        /**
         * @deprecated Use AppMenu from "@kbn/core-chrome-app-menu" instead
         */
        AggregateQueryTopNavMenu: createTopNav(unifiedSearch, extensions),
        /**
         * @deprecated Use AppMenu from "@kbn/core-chrome-app-menu" instead
         */
        createTopNavWithCustomContext: createCustomTopNav,
      },
      addSolutionNavigation: (solutionNavigation) => {
        if (!this.isSolutionNavEnabled) return;
        this.addSolutionNavigation(solutionNavigation);
      },
      isSolutionNavEnabled$: of(isUnauthenticated).pipe(
        switchMap((unauth) => {
          if (unauth) return of(false);
          return activeSpace$.pipe(
            map((activeSpace) => {
              return this.isSolutionNavEnabled && getIsProjectNav(activeSpace?.solution);
            })
          );
        })
      ),
    };
  }

  public stop() {
    this.stop$.next();
    this.customizationService.stop();
  }

  private addSolutionNavigation(def: AddSolutionNavigationArg) {
    this.solutionNavDefinitions.set(def.id, def);
    this.tryInitNavigation();
  }

  private tryInitNavigation() {
    if (!this.activeSolutionId || !this.chrome) return;
    const def = this.solutionNavDefinitions.get(this.activeSolutionId);
    if (!def) return;
    this.chrome.project.initNavigation(this.activeSolutionId, def.navigationTree$);
  }

  private initiateChromeStyleAndSideNav(
    chrome: InternalChromeStart,
    { isServerless, activeSpace }: { isServerless: boolean; activeSpace?: Space }
  ) {
    const solutionView = activeSpace?.solution;
    const isProjectNav = this.isSolutionNavEnabled && getIsProjectNav(solutionView);

    // On serverless the chrome style is already set by the serverless plugin
    if (!isServerless) {
      chrome.setChromeStyle(isProjectNav ? 'project' : 'classic');
    }

    if (isProjectNav && solutionView !== 'classic') {
      this.activeSolutionId = solutionView as SolutionId;
      this.tryInitNavigation();
    }
  }

  private getIsUnauthenticated(http: HttpStart) {
    const { anonymousPaths } = http;
    return anonymousPaths.isAnonymous(window.location.pathname);
  }
}

function getIsProjectNav(solutionView?: string) {
  return Boolean(solutionView) && isKnownSolutionView(solutionView);
}

function isKnownSolutionView(solution?: string): solution is SolutionId {
  return Boolean(solution) && ['oblt', 'es', 'security'].includes(solution!);
}
