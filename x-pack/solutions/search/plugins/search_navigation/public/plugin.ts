/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  Plugin,
  PluginInitializerContext,
  ScopedHistory,
} from '@kbn/core/public';
import { type Subscription } from 'rxjs';
import type { ChromeBreadcrumb, ChromeStyle } from '@kbn/core-chrome-browser';
import { i18n } from '@kbn/i18n';
import type { Logger } from '@kbn/logging';
import { SEARCH_HOMEPAGE } from '@kbn/deeplinks-search';
import {
  INDEX_MANAGEMENT_LOCATOR_ID,
  type IndexManagementLocatorParams,
} from '@kbn/index-management-shared-types';
import { BaseClassicNavItems } from './base_classic_navigation_items';
import type {
  SearchNavigationPluginSetup,
  SearchNavigationPluginStart,
  ClassicNavItem,
  SearchNavigationSetBreadcrumbsOptions,
  AppPluginStartDependencies,
} from './types';
import { classicNavigationFactory } from './classic_navigation';
import { SearchIndexManagementLocatorDefinition } from './locator';

export class SearchNavigationPlugin
  implements Plugin<SearchNavigationPluginSetup, SearchNavigationPluginStart>
{
  private readonly logger: Logger;
  private currentChromeStyle: ChromeStyle | undefined = undefined;
  private coreStart: CoreStart | undefined = undefined;
  private pluginsStart: AppPluginStartDependencies | undefined = undefined;
  private onAppMountHandlers: Array<() => Promise<void>> = [];
  private chromeSub: Subscription | undefined;
  private baseClassicNavItems: ClassicNavItem[] = BaseClassicNavItems;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.logger = this.initializerContext.logger.get();
  }

  public setup(_core: CoreSetup): SearchNavigationPluginSetup {
    return {};
  }

  public start(core: CoreStart, plugins: AppPluginStartDependencies): SearchNavigationPluginStart {
    this.coreStart = core;
    this.pluginsStart = plugins;
    this.chromeSub = core.chrome.getChromeStyle$().subscribe((value) => {
      this.currentChromeStyle = value;
    });

    const { monitor, manageEnrich, monitorEnrich, manageIndexTemplates } =
      core.application.capabilities.index_management;
    if (monitor || manageEnrich || monitorEnrich || manageIndexTemplates) {
      const indexManagementLocator =
        this.pluginsStart.share.url.locators.get<IndexManagementLocatorParams>(
          INDEX_MANAGEMENT_LOCATOR_ID
        );
      const getChromeStyle = (): 'classic' | 'project' | undefined => this.currentChromeStyle;
      this.pluginsStart.share.url.locators.create(
        new SearchIndexManagementLocatorDefinition({
          getChromeStyle,
          indexManagementLocator: indexManagementLocator ?? undefined,
        })
      );
    }

    return {
      handleOnAppMount: this.handleOnAppMount.bind(this),
      registerOnAppMountHandler: this.registerOnAppMountHandler.bind(this),
      getBaseClassicNavItems: this.getBaseClassicNavItems.bind(this),
      useClassicNavigation: this.useClassicNavigation.bind(this),
      breadcrumbs: {
        setSearchBreadCrumbs: this.setBreadcrumbs.bind(this),
        clearBreadcrumbs: this.clearBreadcrumbs.bind(this),
      },
    };
  }

  public stop() {
    if (this.chromeSub) {
      this.chromeSub.unsubscribe();
      this.chromeSub = undefined;
    }
  }

  private async handleOnAppMount() {
    if (this.onAppMountHandlers.length === 0) return;

    try {
      await Promise.all(this.onAppMountHandlers);
    } catch (e) {
      this.logger.warn('Error handling app mount functions for search navigation');
      this.logger.warn(e);
    }
  }

  private registerOnAppMountHandler(handler: () => Promise<void>) {
    this.onAppMountHandlers.push(handler);
  }

  private useClassicNavigation(history: ScopedHistory<unknown>) {
    if (this.coreStart === undefined || this.currentChromeStyle !== 'classic') return undefined;

    return classicNavigationFactory(
      this.baseClassicNavItems,
      this.coreStart,
      history,
      this.pluginsStart?.spaces
    );
  }

  private getBaseClassicNavItems(): ClassicNavItem[] {
    return this.baseClassicNavItems;
  }

  private setBreadcrumbs(
    breadcrumbs: ChromeBreadcrumb[],
    { forClassicChromeStyle = false }: SearchNavigationSetBreadcrumbsOptions = {}
  ) {
    if (forClassicChromeStyle === true && this.currentChromeStyle !== 'classic') return;

    if (this.pluginsStart?.serverless) {
      // Serverless: use the serverless plugin's breadcrumb API
      this.pluginsStart.serverless.setBreadcrumbs(breadcrumbs);
    } else if (this.currentChromeStyle === 'project') {
      // Project chrome (solution spaces): the navigation tree provides the base path.
      // Breadcrumbs are appended to the nav-tree-generated path.
      this.coreStart?.chrome.setBreadcrumbs([], {
        project: { value: breadcrumbs },
      });
    } else {
      // Classic chrome: prepend the Elasticsearch home breadcrumb
      const searchBreadcrumbs = [this.getSearchHomeBreadcrumb(), ...breadcrumbs];
      this.coreStart?.chrome.setBreadcrumbs(searchBreadcrumbs);
    }
  }

  private clearBreadcrumbs() {
    if (this.pluginsStart?.serverless) {
      this.pluginsStart.serverless.setBreadcrumbs([]);
    } else {
      this.coreStart?.chrome.setBreadcrumbs([]);
    }
  }

  private getSearchHomeBreadcrumb(): ChromeBreadcrumb {
    // home deep link for this breadcrumb's path.
    const homeHref = this.coreStart?.chrome.navLinks.get(SEARCH_HOMEPAGE)?.href;
    return {
      text: i18n.translate('xpack.searchNavigation.breadcrumbs.home.title', {
        defaultMessage: 'Elasticsearch',
      }),
      href: homeHref,
    };
  }
}
