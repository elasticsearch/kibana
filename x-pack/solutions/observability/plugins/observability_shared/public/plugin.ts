/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type {
  BrowserUrlService,
  SharePluginSetup,
  SharePluginStart,
} from '@kbn/share-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import { BehaviorSubject } from 'rxjs';
import { createLazyObservabilityPageTemplate } from './components/page_template';
import { createNavigationRegistry } from './components/page_template/helpers/navigation_registry';
import { registerProfilingComponent } from './components/profiling/helpers/component_registry';
import { updateGlobalNavigation } from './services/update_global_navigation';
import {
  AssetDetailsFlyoutLocatorDefinition,
  AssetDetailsLocatorDefinition,
  HostsLocatorDefinition,
  InventoryLocatorDefinition,
  MetricsExplorerLocatorDefinition,
  FlamegraphLocatorDefinition,
  StacktracesLocatorDefinition,
  TopNFunctionsLocatorDefinition,
  ServiceOverviewLocatorDefinition,
  TransactionDetailsByNameLocatorDefinition,
  TransactionDetailsByTraceIdLocatorDefinition,
  ServiceTransactionsLocatorDefinition,
  ServiceAlertsLocatorDefinition,
  type AssetDetailsFlyoutLocator,
  type AssetDetailsLocator,
  type InventoryLocator,
  type HostsLocator,
  type FlamegraphLocator,
  type StacktracesLocator,
  type TopNFunctionsLocator,
  type ServiceOverviewLocator,
  type TransactionDetailsByNameLocator,
  type ServiceTransactionsLocator,
  type ServiceAlertsLocator,
  type MetricsExplorerLocator,
  type TransactionDetailsByTraceIdLocator,
} from '../common';
import type { DependencyOverviewLocator } from '../common/locators/apm/dependency_overview_locator';
import { DependencyOverviewLocatorDefinition } from '../common/locators/apm/dependency_overview_locator';

export interface ObservabilitySharedSetup {
  share: SharePluginSetup;
}

export interface ObservabilitySharedStart {
  spaces?: SpacesPluginStart;
  embeddable: EmbeddableStart;
  share: SharePluginStart;
  agentBuilder?: AgentBuilderPluginStart;
}

export type ObservabilitySharedPluginSetup = ReturnType<ObservabilitySharedPlugin['setup']>;
export type ObservabilitySharedPluginStart = ReturnType<ObservabilitySharedPlugin['start']>;
export type ProfilingLocators = ObservabilitySharedPluginSetup['locators']['profiling'];

interface ObservabilitySharedLocators {
  infra: {
    assetDetailsLocator: AssetDetailsLocator;
    assetDetailsFlyoutLocator: AssetDetailsFlyoutLocator;
    hostsLocator: HostsLocator;
    inventoryLocator: InventoryLocator;
    metricsExplorerLocator: MetricsExplorerLocator;
  };
  profiling: {
    flamegraphLocator: FlamegraphLocator;
    topNFunctionsLocator: TopNFunctionsLocator;
    stacktracesLocator: StacktracesLocator;
  };
  apm: {
    serviceOverview: ServiceOverviewLocator;
    dependencyOverview: DependencyOverviewLocator;
    transactionDetailsByName: TransactionDetailsByNameLocator;
    transactionDetailsByTraceId: TransactionDetailsByTraceIdLocator;
    serviceTransactions: ServiceTransactionsLocator;
    serviceAlerts: ServiceAlertsLocator;
  };
}

export class ObservabilitySharedPlugin implements Plugin {
  private readonly navigationRegistry = createNavigationRegistry();
  private isSidebarEnabled$: BehaviorSubject<boolean>;

  constructor() {
    this.isSidebarEnabled$ = new BehaviorSubject<boolean>(true);
  }

  public setup(coreSetup: CoreSetup, pluginsSetup: ObservabilitySharedSetup) {
    coreSetup.getStartServices().then(([coreStart]) => {
      coreStart.chrome
        .getChromeStyle$()
        .subscribe((style) => this.isSidebarEnabled$.next(style === 'classic'));
    });

    return {
      registerProfilingComponent,
      locators: this.createLocators(pluginsSetup.share.url),
      navigation: {
        registerSections: this.navigationRegistry.registerSections,
      },
    };
  }

  public start(core: CoreStart, plugins: ObservabilitySharedStart) {
    const { application } = core;

    const PageTemplate = createLazyObservabilityPageTemplate({
      currentAppId$: application.currentAppId$,
      getUrlForApp: application.getUrlForApp,
      navigateToApp: application.navigateToApp,
      navigationSections$: this.navigationRegistry.sections$,
      getPageTemplateServices: () => ({ coreStart: core }),
      isSidebarEnabled$: this.isSidebarEnabled$,
    });

    return {
      locators: this.createLocators(plugins.share.url),
      navigation: {
        PageTemplate,
        registerSections: this.navigationRegistry.registerSections,
      },
      updateGlobalNavigation,
    };
  }

  public stop() {}

  private createLocators(urlService: BrowserUrlService): ObservabilitySharedLocators {
    return {
      infra: {
        assetDetailsLocator: urlService.locators.create(new AssetDetailsLocatorDefinition()),
        assetDetailsFlyoutLocator: urlService.locators.create(
          new AssetDetailsFlyoutLocatorDefinition()
        ),
        hostsLocator: urlService.locators.create(new HostsLocatorDefinition()),
        inventoryLocator: urlService.locators.create(new InventoryLocatorDefinition()),
        metricsExplorerLocator: urlService.locators.create(new MetricsExplorerLocatorDefinition()),
      },
      profiling: {
        flamegraphLocator: urlService.locators.create(new FlamegraphLocatorDefinition()),
        topNFunctionsLocator: urlService.locators.create(new TopNFunctionsLocatorDefinition()),
        stacktracesLocator: urlService.locators.create(new StacktracesLocatorDefinition()),
      },
      apm: {
        serviceOverview: urlService.locators.create(new ServiceOverviewLocatorDefinition()),
        dependencyOverview: urlService.locators.create(new DependencyOverviewLocatorDefinition()),
        transactionDetailsByName: urlService.locators.create(
          new TransactionDetailsByNameLocatorDefinition()
        ),
        transactionDetailsByTraceId: urlService.locators.create(
          new TransactionDetailsByTraceIdLocatorDefinition()
        ),
        serviceTransactions: urlService.locators.create(new ServiceTransactionsLocatorDefinition()),
        serviceAlerts: urlService.locators.create(new ServiceAlertsLocatorDefinition()),
      },
    };
  }
}
