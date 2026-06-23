/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, firstValueFrom, type Subscription } from 'rxjs';

import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { CloudSetup, CloudStart } from '@kbn/cloud-plugin/public';
import type { ConsolePluginStart } from '@kbn/console-plugin/public';
import type { SearchConnectorsPluginStart } from '@kbn/content-connectors-plugin/public';
import type {
  AppMountParameters,
  CoreStart,
  CoreSetup,
  HttpSetup,
  Plugin,
  PluginInitializerContext,
  AppDeepLink,
} from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES, type AppUpdater, AppStatus } from '@kbn/core/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { FleetStart } from '@kbn/fleet-plugin/public';
import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import { i18n } from '@kbn/i18n';
import type {
  IndexManagementPluginSetup,
  IndexManagementPluginStart,
} from '@kbn/index-management-shared-types';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { MlPluginStart } from '@kbn/ml-plugin/public';
import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';
import type { SearchNavigationPluginStart } from '@kbn/search-navigation/public';
import type { SearchPlaygroundPluginStart } from '@kbn/search-playground/public';
import { ELASTICSEARCH_URL_PLACEHOLDER } from '@kbn/search-shared-ui';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/public';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { UiActionsSetup, UiActionsStart } from '@kbn/ui-actions-plugin/public';

import {
  ANALYTICS_PLUGIN,
  APPLICATIONS_PLUGIN,
  ENTERPRISE_SEARCH_DATA_PLUGIN,
  ENTERPRISE_SEARCH_HOME_PLUGIN,
  SEARCH_PRODUCT_NAME,
  SEARCH_HOMEPAGE,
  SEARCH_APPS_TITLE,
  SEARCH_INDEX_MANAGEMENT_APP_ID,
  SEARCH_INDEX_MANAGEMENT_APP_BASE,
} from '../common/constants';
import type { ClientConfigType, InitialAppData } from '../common/types';
import { hasEnterpriseLicense } from '../common/utils/licensing';

import { SEARCH_APPLICATIONS_PATH } from './applications/applications/routes';
import { CONNECTORS_PATH, CRAWLERS_PATH } from './applications/enterprise_search_content/routes';
import { docLinks } from './applications/shared/doc_links';

import type { DynamicSideNavItems } from './navigation_tree';

export interface ClientData extends InitialAppData {
  errorConnectingMessage?: string;
}

export type EnterpriseSearchPublicSetup = ReturnType<EnterpriseSearchPlugin['setup']>;
export type EnterpriseSearchPublicStart = ReturnType<EnterpriseSearchPlugin['start']>;

interface PluginsSetup {
  cloud?: CloudSetup;
  home?: HomePublicPluginSetup;
  indexManagement: IndexManagementPluginSetup;
  licensing: LicensingPluginStart;
  security?: SecurityPluginSetup;
  share?: SharePluginSetup;
  uiActions: UiActionsSetup;
}

export interface PluginsStart {
  charts?: ChartsPluginStart;
  cloud?: CloudSetup & CloudStart;
  console?: ConsolePluginStart;
  contentConnectors?: SearchConnectorsPluginStart;
  data?: DataPublicPluginStart;
  fleet?: FleetStart;
  indexManagement?: IndexManagementPluginStart;
  lens?: LensPublicStart;
  licensing?: LicensingPluginStart;
  ml?: MlPluginStart;
  navigation: NavigationPublicPluginStart;
  searchNavigation: SearchNavigationPluginStart;
  searchPlayground?: SearchPlaygroundPluginStart;
  security?: SecurityPluginStart;
  share?: SharePluginStart;
  spaces?: SpacesPluginStart;
  uiActions: UiActionsStart;
}

export interface ESConfig {
  elasticsearch_host: string;
}

export type UpdateSideNavDefinitionFn = (items: Partial<DynamicSideNavItems>) => void;

const contentLinks: AppDeepLink[] = [
  {
    id: 'connectors',
    path: `/${CONNECTORS_PATH}`,
    title: i18n.translate('xpack.enterpriseSearch.navigation.contentConnectorsLinkLabel', {
      defaultMessage: 'Connectors',
    }),
    visibleIn: ['globalSearch'],
  },
  {
    id: 'webCrawlers',
    path: `/${CRAWLERS_PATH}`,
    title: i18n.translate('xpack.enterpriseSearch.navigation.contentWebcrawlersLinkLabel', {
      defaultMessage: 'Web Crawlers',
    }),
    visibleIn: ['globalSearch'],
  },
];

const applicationsLinks: AppDeepLink[] = [
  {
    id: 'searchApplications',
    path: `/${SEARCH_APPLICATIONS_PATH}`,
    title: SEARCH_APPS_TITLE,
    visibleIn: [],
  },
];

export class EnterpriseSearchPlugin implements Plugin {
  private config: ClientConfigType;
  private data: ClientData = {};
  private enterpriseLicenseAppUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));
  private esConfig: ESConfig;
  private hasInitialized: boolean = false;
  private isSidebarEnabled = true;
  private licenseSubscription: Subscription | undefined;
  private readonly sideNavDynamicItems$ = new BehaviorSubject<DynamicSideNavItems>({});

  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.get<ClientConfigType>();
    this.esConfig = { elasticsearch_host: ELASTICSEARCH_URL_PLACEHOLDER };
  }

  public setup(core: CoreSetup, plugins: PluginsSetup) {
    const { cloud } = plugins;

    core.application.register({
      appRoute: ENTERPRISE_SEARCH_HOME_PLUGIN.URL,
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      euiIconType: ENTERPRISE_SEARCH_HOME_PLUGIN.LOGO,
      id: ENTERPRISE_SEARCH_HOME_PLUGIN.ID,
      mount: async () => {
        const [coreStart] = await core.getStartServices();
        coreStart.application.navigateToApp(SEARCH_HOMEPAGE);
        return () => {};
      },
      order: 0,
      title: ENTERPRISE_SEARCH_HOME_PLUGIN.NAV_TITLE,
      visibleIn: ['home', 'kibanaOverview'],
    });

    core.application.register({
      appRoute: ENTERPRISE_SEARCH_DATA_PLUGIN.URL,
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      deepLinks: contentLinks,
      euiIconType: ENTERPRISE_SEARCH_DATA_PLUGIN.LOGO,
      id: ENTERPRISE_SEARCH_DATA_PLUGIN.ID,
      mount: async (params: AppMountParameters) => {
        const kibanaDeps = await this.getKibanaDeps(core, params, cloud);
        const { chrome, http } = kibanaDeps.core;
        chrome.docTitle.change(ENTERPRISE_SEARCH_DATA_PLUGIN.NAME);

        await this.getInitialData(http);
        const pluginData = this.getPluginData();

        const { renderApp } = await import('./applications');
        const { EnterpriseSearchContent } = await import(
          './applications/enterprise_search_content'
        );

        return renderApp(EnterpriseSearchContent, kibanaDeps, pluginData);
      },
      order: 1,
      title: ENTERPRISE_SEARCH_DATA_PLUGIN.NAV_TITLE,
      visibleIn: [],
    });

    core.application.register({
      appRoute: APPLICATIONS_PLUGIN.URL,
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      deepLinks: applicationsLinks,
      euiIconType: APPLICATIONS_PLUGIN.LOGO,
      id: APPLICATIONS_PLUGIN.ID,
      mount: async (params: AppMountParameters) => {
        const kibanaDeps = await this.getKibanaDeps(core, params, cloud);
        const { chrome, http } = kibanaDeps.core;
        chrome.docTitle.change(ENTERPRISE_SEARCH_DATA_PLUGIN.NAME);

        await this.getInitialData(http);
        const pluginData = this.getPluginData();

        const { renderApp } = await import('./applications');
        const { Applications } = await import('./applications/applications');

        return renderApp(Applications, kibanaDeps, pluginData);
      },
      title: APPLICATIONS_PLUGIN.NAV_TITLE,
      visibleIn: [],
    });

    core.application.register({
      appRoute: ANALYTICS_PLUGIN.URL,
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      euiIconType: ENTERPRISE_SEARCH_HOME_PLUGIN.LOGO,
      id: ANALYTICS_PLUGIN.ID,
      mount: async (params: AppMountParameters) => {
        const kibanaDeps = await this.getKibanaDeps(core, params, cloud);
        const { chrome, http } = kibanaDeps.core;
        chrome.docTitle.change(ANALYTICS_PLUGIN.NAME);

        await this.getInitialData(http);
        const pluginData = this.getPluginData();

        const { renderApp } = await import('./applications');
        const { Analytics } = await import('./applications/analytics');

        return renderApp(Analytics, kibanaDeps, pluginData);
      },
      title: ANALYTICS_PLUGIN.NAME,
      visibleIn: [],
    });

    core.application.register({
      appRoute: '/app/enterprise_search',
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      id: 'enterpriseSearchRedirect',
      mount: async (params: AppMountParameters) => {
        const kibanaDeps = await this.getKibanaDeps(core, params, cloud);
        const pluginData = this.getPluginData();

        const { renderApp } = await import('./applications');
        const { ApplicationRedirect } = await import('./applications/enterprise_search_redirect');

        return renderApp(ApplicationRedirect, kibanaDeps, pluginData);
      },
      title: 'EnterpriseSearchRedirect',
      visibleIn: [],
    });

    if (plugins.home) {
      plugins.home.featureCatalogue.registerSolution({
        description: ENTERPRISE_SEARCH_HOME_PLUGIN.DESCRIPTION,
        icon: 'logoElasticsearch',
        id: ENTERPRISE_SEARCH_HOME_PLUGIN.ID,
        order: 100,
        path: ENTERPRISE_SEARCH_HOME_PLUGIN.URL,
        title: SEARCH_PRODUCT_NAME,
      });

      plugins.home.featureCatalogue.register({
        category: 'data',
        description: ANALYTICS_PLUGIN.DESCRIPTION,
        icon: 'appAnalytics',
        id: ANALYTICS_PLUGIN.ID,
        path: ANALYTICS_PLUGIN.URL,
        showOnHomePage: false,
        title: ANALYTICS_PLUGIN.NAME,
      });
    }

    core.application.register({
      appRoute: SEARCH_INDEX_MANAGEMENT_APP_BASE,
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      id: SEARCH_INDEX_MANAGEMENT_APP_ID,
      async mount({ element, history }) {
        const { renderIndexManagementApp } = await import('./index_management_application');
        return renderIndexManagementApp(element, {
          core,
          history,
          indexManagement: plugins.indexManagement,
        });
      },
      order: 2,
      title: i18n.translate('xpack.enterpriseSearch.searchIndexManagement.title', {
        defaultMessage: 'Index Management',
      }),
      visibleIn: [],
    });
  }

  public start(core: CoreStart, plugins: PluginsStart) {
    // This must be called here in start() and not in `applications/index.tsx` to prevent loading
    // race conditions with our apps' `routes.ts` being initialized before `renderApp()`
    docLinks.setDocLinks(core.docLinks);

    import('./navigation_tree').then(({ getNavigationTreeDefinition }) => {
      return plugins.navigation.addSolutionNavigation(
        getNavigationTreeDefinition({
          core,
          dynamicItems$: this.sideNavDynamicItems$,
          isCloudEnabled: plugins.cloud?.isCloudEnabled,
        })
      );
    });

    this.licenseSubscription = plugins.licensing?.license$.subscribe((license) => {
      if (hasEnterpriseLicense(license)) {
        this.enterpriseLicenseAppUpdater$.next(() => ({
          status: AppStatus.accessible,
        }));
      } else {
        this.enterpriseLicenseAppUpdater$.next(() => ({
          status: AppStatus.inaccessible,
        }));
      }
    });

    // Return empty start contract rather than void in order for plugins
    // that depend on the enterprise search plugin to determine whether it is enabled or not
    return {};
  }

  public stop() {
    if (this.licenseSubscription) {
      this.licenseSubscription.unsubscribe();
      this.licenseSubscription = undefined;
    }
  }

  private async getInitialData(http: HttpSetup) {
    try {
      this.esConfig = await http.get('/internal/enterprise_search/es_config');
    } catch {
      this.esConfig = { elasticsearch_host: ELASTICSEARCH_URL_PLACEHOLDER };
    }

    if (this.hasInitialized) return; // We've already made an initial call

    try {
      this.data = await http.get('/internal/enterprise_search/config_data');
      this.hasInitialized = true;
    } catch (e) {
      this.data.errorConnectingMessage = `${e.response.status} ${e.message}`;
    }
  }

  private async getKibanaDeps(
    core: CoreSetup,
    params: AppMountParameters,
    cloudSetup?: CloudSetup
  ) {
    // Helper for using start dependencies on mount (instead of setup dependencies)
    // and for grouping Kibana-related args together (vs. plugin-specific args)
    const [coreStart, pluginsStart] = await core.getStartServices();
    const cloud =
      cloudSetup && (pluginsStart as PluginsStart).cloud
        ? { ...cloudSetup, ...(pluginsStart as PluginsStart).cloud }
        : undefined;
    const plugins = { ...pluginsStart, cloud } as PluginsStart;

    const chromeStyle = await firstValueFrom(coreStart.chrome.getChromeStyle$());
    this.isSidebarEnabled = chromeStyle === 'classic';

    coreStart.chrome.getChromeStyle$().subscribe((style) => {
      this.isSidebarEnabled = style === 'classic';
    });

    return {
      core: coreStart,
      isSidebarEnabled: this.isSidebarEnabled,
      params,
      plugins,
      updateSideNavDefinition: this.updateSideNavDefinition.bind(this),
    };
  }

  private getPluginData() {
    // Small helper for grouping plugin data related args together
    return {
      config: this.config,
      data: this.data,
      esConfig: this.esConfig,
      isSidebarEnabled: this.isSidebarEnabled,
    };
  }

  private updateSideNavDefinition = (items: Partial<DynamicSideNavItems>) => {
    this.sideNavDynamicItems$.next({ ...this.sideNavDynamicItems$.getValue(), ...items });
  };
}
