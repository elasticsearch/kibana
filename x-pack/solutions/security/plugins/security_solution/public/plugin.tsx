/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { BehaviorSubject, combineLatestWith, Subject } from 'rxjs';
import type * as H from 'history';
import type {
  AppMountParameters,
  AppUpdater,
  CoreSetup,
  CoreStart,
  Plugin as IPlugin,
  PluginInitializerContext,
} from '@kbn/core/public';
import { AppStatus, DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import type { Logger } from '@kbn/logging';
import { uiMetricService } from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import type {
  SecuritySolutionAlertFlyoutFooterFeature,
  SecuritySolutionAlertFlyoutHeaderTitleFeature,
  SecuritySolutionAlertFlyoutOverviewTabFeature,
  SecuritySolutionAttackFlyoutFooterFeature,
  SecuritySolutionAttackFlyoutHeaderFeature,
  SecuritySolutionAttackFlyoutOverviewTabFeature,
  SecuritySolutionCellRendererFeature,
  SecuritySolutionIOCFlyoutFooterFeature,
  SecuritySolutionIOCFlyoutHeaderFeature,
  SecuritySolutionIOCFlyoutOverviewTabFeature,
} from '@kbn/discover-shared-plugin/public/services/discover_features';
import { ProductFeatureSecurityKey } from '@kbn/security-solution-features/keys';
import { ProductFeatureAssistantKey } from '@kbn/security-solution-features/src/product_features_keys';
import { ProjectRoutingAccess } from '@kbn/cps-utils';
import { getLazyCloudSecurityPosturePliAuthBlockExtension } from './cloud_security_posture/lazy_cloud_security_posture_pli_auth_block_extension';
import { getLazyEndpointAgentTamperProtectionExtension } from './management/pages/policy/view/ingest_manager_integration/lazy_endpoint_agent_tamper_protection_extension';
import type {
  PluginSetup,
  PluginStart,
  SetupPlugins,
  StartedSubPlugins,
  StartPlugins,
  StartPluginsDependencies,
  StartServices,
  SubPlugins,
} from './types';
import { ASSISTANT_MANAGEMENT_TITLE, SOLUTION_NAME } from './common/translations';

import { APP_ICON_SOLUTION, APP_ID, APP_PATH, APP_UI_ID } from '../common/constants';

import type { AppLinkItems } from './common/links';
import {
  type ApplicationLinksUpdateParams,
  applicationLinksUpdater,
} from './app/links/application_links_updater';
import type { FleetUiExtensionGetterOptions, SecuritySolutionUiConfigType } from './common/types';

import { getLazyEndpointPolicyEditExtension } from './management/pages/policy/view/ingest_manager_integration/lazy_endpoint_policy_edit_extension';
import { getLazyEndpointPolicyCreateExtension } from './management/pages/policy/view/ingest_manager_integration/lazy_endpoint_policy_create_extension';
import { getLazyEndpointPackageCustomExtension } from './management/pages/policy/view/ingest_manager_integration/lazy_endpoint_package_custom_extension';
import { getLazyEndpointPolicyResponseExtension } from './management/pages/policy/view/ingest_manager_integration/lazy_endpoint_policy_response_extension';
import { getLazyEndpointGenericErrorsListExtension } from './management/pages/policy/view/ingest_manager_integration/lazy_endpoint_generic_errors_list';
import type { ExperimentalFeatures } from '../common/experimental_features';
import { parseExperimentalConfigValue } from '../common/experimental_features';
import { LazyEndpointCustomAssetsExtension } from './management/pages/policy/view/ingest_manager_integration/lazy_endpoint_custom_assets_extension';
import { LazyAssetInventoryReplaceDefineStepExtension } from './asset_inventory/components/fleet_extensions/lazy_asset_inventory_replacestep_extension';
import { LazyCustomCriblExtension } from './security_integrations/cribl/components/lazy_custom_cribl_extension';

import type { SecurityAppStore } from './common/store/types';
import { PluginContract } from './plugin_contract';
import { PluginServices } from './plugin_services';
import { getEndpointUnifiedAttachment } from './cases/attachments/endpoint';
import { getEventType } from './cases/attachments/event';
import { getSecurityAlertType } from './cases/attachments/alert';
import { isSecuritySolutionAccessible } from './helpers_access';
import { getIndicatorAttachment } from './cases/attachments/indicator';
import { getTimelineAttachment } from './cases/attachments/timeline';
import { defaultDeepLinks } from './app/links/default_deep_links';
import { AIValueReportLocatorDefinition } from '../common/locators/ai_value_report/locator';
import {
  registerAttachmentUiDefinitions,
  registerEntityAnalyticsDashboardAttachment,
  registerEntityAttachment,
  registerRuleAttachment,
  registerRulePreviewAttachment,
} from './agent_builder/attachment_types';
import type { SecurityCanvasEmbeddedBundle } from './agent_builder/components/security_redux_embedded_provider';
import { registerWorkflowSteps } from './workflows/step_types';

export class Plugin implements IPlugin<PluginSetup, PluginStart, SetupPlugins, StartPlugins> {
  private config: SecuritySolutionUiConfigType;
  private experimentalFeatures: ExperimentalFeatures;
  private contract: PluginContract;
  private services: PluginServices;
  private logger: Logger;
  private isServerless: boolean;

  private appUpdater$ = new Subject<AppUpdater>();
  private storage = new Storage(localStorage);

  // Lazily instantiated dependencies
  private _subPlugins?: SubPlugins;
  private _store?: SecurityAppStore;
  private _actionsRegistered?: boolean = false;
  private _discoverFlyoutServicesPromise?: Promise<StartServices>;
  private _startedSubPluginsPromise?: Promise<StartedSubPlugins>;
  private _discoverFlyoutStorePromise?: Promise<SecurityAppStore>;
  private _securityCanvasContextPromise?: Promise<SecurityCanvasEmbeddedBundle>;
  private _coreSetup?: CoreSetup<StartPluginsDependencies, PluginStart>;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.config = this.initializerContext.config.get<SecuritySolutionUiConfigType>();
    this.experimentalFeatures = parseExperimentalConfigValue(
      this.config.enableExperimental || []
    ).features;
    this.contract = new PluginContract(this.experimentalFeatures);
    this.isServerless = initializerContext.env.packageInfo.buildFlavor === 'serverless';
    this.logger = initializerContext.logger.get(); // Initializes logger with name plugins.securitySolution

    this.services = new PluginServices(
      this.config,
      this.experimentalFeatures,
      this.contract,
      initializerContext.env.packageInfo,
      this.logger
    );
  }

  public setup(
    core: CoreSetup<StartPluginsDependencies, PluginStart>,
    plugins: SetupPlugins
  ): PluginSetup {
    this._coreSetup = core;
    this.services.setup(core, plugins);

    const { home, usageCollection, management, cases, share, workflowsExtensions } = plugins;
    const { productFeatureKeys$ } = this.contract;

    if (share) {
      share.url.locators.create(new AIValueReportLocatorDefinition());
    }

    if (workflowsExtensions) {
      registerWorkflowSteps(workflowsExtensions, core, this.experimentalFeatures);
    }

    // Lazily instantiate subPlugins and initialize services
    const mountDependencies = async (params?: AppMountParameters) => {
      const { renderApp } = await this.lazyApplicationDependencies();
      const [coreStart, startPlugins] = await core.getStartServices();

      const subPlugins = await this.ensureStartedSubPlugins(coreStart, startPlugins);
      const store = await this.store(coreStart, startPlugins, subPlugins);

      const services = await this.services.generateServices(coreStart, startPlugins, params);
      return { renderApp, subPlugins, store, services };
    };

    // register cloud security ui metrics
    if (plugins.usageCollection) uiMetricService.setup(plugins.usageCollection);

    // Register main Security Solution plugin
    core.application.register({
      id: APP_UI_ID,
      title: SOLUTION_NAME,
      appRoute: APP_PATH,
      category: DEFAULT_APP_CATEGORIES.security,
      deepLinks: defaultDeepLinks,
      updater$: this.appUpdater$,
      visibleIn: ['globalSearch', 'home', 'kibanaOverview'],
      euiIconType: APP_ICON_SOLUTION,
      mount: async (params) => {
        const { renderApp, services, store, subPlugins } = await mountDependencies(params);
        const { getSubPluginRoutesByCapabilities } = await this.lazyHelpersForRoutes();

        await this.registerActions(store, params.history, core, services);

        const subPluginRoutes = getSubPluginRoutesByCapabilities(subPlugins, services);

        const unmountApp = renderApp({
          ...params,
          services,
          store,
          usageCollection,
          subPluginRoutes,
        });

        return () => {
          unmountApp();
        };
      },
    });

    // Register legacy SIEM app for backward compatibility
    core.application.register({
      id: 'siem',
      appRoute: 'app/siem',
      title: 'SIEM',
      visibleIn: [],
      mount: async (_params: AppMountParameters) => {
        const [coreStart] = await core.getStartServices();

        const { manageOldSiemRoutes } = await this.lazyHelpersForRoutes();
        const subscription = this.appUpdater$.subscribe(() => {
          // wait for app initialization to set the links
          manageOldSiemRoutes(coreStart);
          subscription.unsubscribe();
        });

        return () => true;
      },
    });

    home?.featureCatalogue.registerSolution({
      id: APP_ID,
      title: SOLUTION_NAME,
      description: i18n.translate('xpack.securitySolution.featureCatalogueDescription', {
        defaultMessage:
          'Prevent, collect, detect, and respond to threats for unified protection across your infrastructure.',
      }),
      icon: 'logoSecurity',
      path: APP_PATH,
      order: 300,
    });

    home?.featureCatalogue.register({
      id: 'ai_assistant_security',
      title: ASSISTANT_MANAGEMENT_TITLE,
      description: i18n.translate(
        'xpack.securitySolution.securityAiAssistantManagement.app.description',
        {
          defaultMessage: 'Manage your AI Assistant for Security.',
        }
      ),
      icon: 'sparkles',
      path: '/app/management/ai/securityAiAssistantManagement',
      showOnHomePage: false,
      category: 'admin',
    });

    management?.sections.section.ai.registerApp({
      id: 'securityAiAssistantManagement',
      title: ASSISTANT_MANAGEMENT_TITLE,
      hideFromSidebar: true,
      hideFromGlobalSearch: !this.isServerless,
      order: 1,
      mount: async (params) => {
        const [coreStart] = await core.getStartServices();
        const { renderApp, services, store } = await mountDependencies();
        const { ManagementSettings } = await this.lazyAssistantSettingsManagement();
        const { RedirectIfUnauthorized } = await import(
          './assistant/stack_management/redirect_if_unauthorized'
        );

        return renderApp({
          ...params,
          services,
          store,
          usageCollection,
          children: (
            <RedirectIfUnauthorized coreStart={coreStart}>
              <ManagementSettings />
            </RedirectIfUnauthorized>
          ),
        });
      },
    });

    productFeatureKeys$
      .pipe(combineLatestWith(plugins.licensing.license$))
      .subscribe(([productFeatureKeys, license]) => {
        if (!productFeatureKeys || !license) {
          return;
        }

        const shouldShowAssistantManagement =
          productFeatureKeys?.has(ProductFeatureAssistantKey.assistant) &&
          !productFeatureKeys?.has(ProductFeatureSecurityKey.configurations) &&
          license?.hasAtLeast('enterprise');
        const assistantManagementApp = management?.sections.section.ai.getApp(
          'securityAiAssistantManagement'
        );

        if (!shouldShowAssistantManagement) {
          assistantManagementApp?.disable();
        }
      });

    if (!cases?.attachmentFramework) {
      throw new Error(
        'Security Solution requires the Cases setup contract to register security.event attachments'
      );
    }

    cases.attachmentFramework.registerUnified(getIndicatorAttachment());
    cases.attachmentFramework.registerUnified(getEndpointUnifiedAttachment());
    cases.attachmentFramework.registerUnified(getEventType());
    cases.attachmentFramework.registerUnified(getSecurityAlertType());
    cases.attachmentFramework.registerUnified(getTimelineAttachment());

    this.registerDiscoverSharedFeatures(core, plugins);

    return this.contract.getSetupContract();
  }

  public start(core: CoreStart, plugins: StartPlugins): PluginStart {
    this.services.start(core, plugins);
    this.registerFleetExtensions(core, plugins);
    this.registerPluginUpdates(core, plugins); // Not awaiting to prevent blocking start execution

    if (plugins.agentBuilder?.attachments) {
      const coreSetup = this._coreSetup;
      if (!coreSetup) {
        throw new Error('Security Solution setup contract is required to register attachments');
      }

      registerAttachmentUiDefinitions(plugins.agentBuilder.attachments);
      registerRuleAttachment({
        attachments: plugins.agentBuilder.attachments,
        application: core.application,
        aiRuleCreation: this.services.aiRuleCreation,
        uiSettings: core.uiSettings,
      });
      registerEntityAnalyticsDashboardAttachment({
        attachments: plugins.agentBuilder.attachments,
        application: core.application,
        agentBuilder: plugins.agentBuilder,
        chrome: core.chrome,
        searchSession: plugins.data.search.session,
      });
      registerEntityAttachment({
        attachments: plugins.agentBuilder.attachments,
        application: core.application,
        agentBuilder: plugins.agentBuilder,
        chrome: core.chrome,
        experimentalFeatures: this.experimentalFeatures,
        resolveSecurityCanvasContext: () =>
          this.getSecurityCanvasContext(core, plugins as StartPluginsDependencies),
        searchSession: plugins.data.search.session,
      });
      if (this.experimentalFeatures.rulePreviewAttachmentEnabled) {
        registerRulePreviewAttachment({
          attachments: plugins.agentBuilder.attachments,
          data: plugins.data,
          getServices: () => this.getDiscoverFlyoutServices(coreSetup),
          getStore: () => this.getDiscoverFlyoutStore(coreSetup),
          spaces: plugins.spaces,
        });
      }
    }

    // Enable CPS picker in READ_ONLY mode for all Security Solution pages
    plugins.cps?.cpsManager?.registerAppAccess(APP_UI_ID, () => ProjectRoutingAccess.READONLY);

    return this.contract.getStartContract(core);
  }

  public stop() {
    this.services.stop();
  }

  private getDiscoverFlyoutServices(
    core: CoreSetup<StartPluginsDependencies, PluginStart>
  ): Promise<StartServices> {
    if (!this._discoverFlyoutServicesPromise) {
      this._discoverFlyoutServicesPromise = core
        .getStartServices()
        .then(([coreStart, startPlugins]) =>
          this.services.generateServices(coreStart, startPlugins)
        );
    }

    return this._discoverFlyoutServicesPromise;
  }

  private ensureStartedSubPlugins(
    coreStart: CoreStart,
    startPlugins: StartPlugins
  ): Promise<StartedSubPlugins> {
    if (!this._startedSubPluginsPromise) {
      this._startedSubPluginsPromise = this.startSubPlugins(
        this.storage,
        coreStart,
        startPlugins
      ).catch((e) => {
        // allow retry on next call
        this._startedSubPluginsPromise = undefined;
        throw e;
      });
    }

    return this._startedSubPluginsPromise;
  }

  private getDiscoverFlyoutStore(
    core: CoreSetup<StartPluginsDependencies, PluginStart>
  ): Promise<SecurityAppStore> {
    if (!this._discoverFlyoutStorePromise) {
      this._discoverFlyoutStorePromise = core
        .getStartServices()
        .then(async ([coreStart, startPlugins]) => {
          const startedSubPlugins = await this.ensureStartedSubPlugins(coreStart, startPlugins);
          return this.store(coreStart, startPlugins, startedSubPlugins);
        })
        .catch((e) => {
          // allow retry if something failed during lazy init
          this._discoverFlyoutStorePromise = undefined;
          throw e;
        });
    }

    return this._discoverFlyoutStorePromise;
  }

  /**
   * Lazily resolves the Redux store + flattened `StartServices` bundle used by
   * `SecurityReduxEmbeddedProvider` on Agent Builder Canvas surfaces. Start-time work
   * (sub-plugin bootstrap, services generation) is deferred until the user opens the canvas —
   * the rest of Agent Builder and the label-only/inline paths must not pay that cost.
   *
   * Memoized in a class field so concurrent Preview clicks collapse to a single boot; the
   * cache is cleared on failure so a retry can recover.
   */
  private getSecurityCanvasContext(
    coreStart: CoreStart,
    startPlugins: StartPluginsDependencies
  ): Promise<SecurityCanvasEmbeddedBundle> {
    if (!this._securityCanvasContextPromise) {
      this._securityCanvasContextPromise = (async () => {
        const startedSubPlugins = await this.ensureStartedSubPlugins(coreStart, startPlugins);
        const [store, kibanaServices] = await Promise.all([
          this.store(coreStart, startPlugins, startedSubPlugins),
          this.services.generateServices(coreStart, startPlugins),
        ]);
        return { store, kibanaServices };
      })().catch((e) => {
        this._securityCanvasContextPromise = undefined;
        throw e;
      });
    }
    return this._securityCanvasContextPromise;
  }

  public async registerDiscoverSharedFeatures(
    core: CoreSetup<StartPluginsDependencies, PluginStart>,
    plugins: SetupPlugins
  ) {
    const { discoverShared } = plugins;
    const discoverFeatureRegistry = discoverShared.features.registry;

    const cellRendererFeature: SecuritySolutionCellRendererFeature = {
      id: 'security-solution-cell-renderer',
      getRenderer: async () => {
        const [{ getCellRendererForGivenRecord }, services, store] = await Promise.all([
          this.getLazyDiscoverSharedDeps(),
          this.getDiscoverFlyoutServices(core),
          this.getDiscoverFlyoutStore(core),
        ]);
        return getCellRendererForGivenRecord(services, store);
      },
    };
    discoverFeatureRegistry.register(cellRendererFeature);

    const LazyAlertFlyoutOverviewTab = React.lazy(async () => {
      const { AlertFlyoutOverviewTab } = await this.getLazyDiscoverSharedDeps();
      return { default: AlertFlyoutOverviewTab };
    });

    const alertFlyoutOverviewTabFeature: SecuritySolutionAlertFlyoutOverviewTabFeature = {
      id: 'security-solution-alert-flyout-overview-tab',
      render: ({ hit, onAlertUpdated, columns, filter, onAddColumn, onRemoveColumn }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyAlertFlyoutOverviewTab
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
              onAlertUpdated={onAlertUpdated}
              columns={columns}
              filter={filter}
              onAddColumn={onAddColumn}
              onRemoveColumn={onRemoveColumn}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(alertFlyoutOverviewTabFeature);

    const LazyAlertFlyoutHeader = React.lazy(async () => {
      const { AlertFlyoutHeader } = await this.getLazyDiscoverSharedDeps();
      return { default: AlertFlyoutHeader };
    });
    const headerTitleFeature: SecuritySolutionAlertFlyoutHeaderTitleFeature = {
      id: 'security-solution-alert-flyout-header-title',
      renderHeader: ({ hit, onAlertUpdated, columns, filter, onAddColumn, onRemoveColumn }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyAlertFlyoutHeader
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
              onAlertUpdated={onAlertUpdated}
              columns={columns}
              filter={filter}
              onAddColumn={onAddColumn}
              onRemoveColumn={onRemoveColumn}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(headerTitleFeature);

    const LazyAlertFlyoutFooter = React.lazy(async () => {
      const { AlertFlyoutFooter } = await this.getLazyDiscoverSharedDeps();
      return { default: AlertFlyoutFooter };
    });
    const headerFooterFeature: SecuritySolutionAlertFlyoutFooterFeature = {
      id: 'security-solution-alert-flyout-footer',
      renderFooter: ({ hit, onAlertUpdated }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyAlertFlyoutFooter
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
              onAlertUpdated={onAlertUpdated}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(headerFooterFeature);

    const LazyIOCFlyoutOverviewTab = React.lazy(async () => {
      const { IOCFlyoutOverviewTab } = await this.getLazyDiscoverSharedDeps();
      return { default: IOCFlyoutOverviewTab };
    });

    const iocFlyoutOverviewTabFeature: SecuritySolutionIOCFlyoutOverviewTabFeature = {
      id: 'security-solution-ioc-flyout-overview-tab',
      render: ({ hit, columns, filter, onAddColumn, onRemoveColumn }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyIOCFlyoutOverviewTab
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
              columns={columns}
              filter={filter}
              onAddColumn={onAddColumn}
              onRemoveColumn={onRemoveColumn}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(iocFlyoutOverviewTabFeature);

    const LazyIOCFlyoutFooter = React.lazy(async () => {
      const { IOCFlyoutFooter } = await this.getLazyDiscoverSharedDeps();
      return { default: IOCFlyoutFooter };
    });

    const iocFlyoutFooterFeature: SecuritySolutionIOCFlyoutFooterFeature = {
      id: 'security-solution-ioc-flyout-footer',
      renderFooter: ({ hit }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyIOCFlyoutFooter
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(iocFlyoutFooterFeature);

    const LazyIOCFlyoutHeader = React.lazy(async () => {
      const { IOCFlyoutHeader } = await this.getLazyDiscoverSharedDeps();
      return { default: IOCFlyoutHeader };
    });

    const iocFlyoutHeaderFeature: SecuritySolutionIOCFlyoutHeaderFeature = {
      id: 'security-solution-ioc-flyout-header',
      renderHeader: ({ hit, columns, filter, onAddColumn, onRemoveColumn }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyIOCFlyoutHeader
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
              columns={columns}
              filter={filter}
              onAddColumn={onAddColumn}
              onRemoveColumn={onRemoveColumn}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(iocFlyoutHeaderFeature);

    const LazyAttackFlyoutOverviewTab = React.lazy(async () => {
      const { AttackFlyoutOverviewTab } = await this.getLazyDiscoverSharedDeps();
      return { default: AttackFlyoutOverviewTab };
    });

    const attackFlyoutOverviewTabFeature: SecuritySolutionAttackFlyoutOverviewTabFeature = {
      id: 'security-solution-attack-flyout-overview-tab',
      render: ({ hit }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyAttackFlyoutOverviewTab
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(attackFlyoutOverviewTabFeature);

    const LazyAttackFlyoutHeader = React.lazy(async () => {
      const { AttackFlyoutHeader } = await this.getLazyDiscoverSharedDeps();
      return { default: AttackFlyoutHeader };
    });

    const attackFlyoutHeaderFeature: SecuritySolutionAttackFlyoutHeaderFeature = {
      id: 'security-solution-attack-flyout-header',
      renderHeader: ({ hit, onAttackUpdated }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyAttackFlyoutHeader
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
              onAttackUpdated={onAttackUpdated}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(attackFlyoutHeaderFeature);

    const LazyAttackFlyoutFooter = React.lazy(async () => {
      const { AttackFlyoutFooter } = await this.getLazyDiscoverSharedDeps();
      return { default: AttackFlyoutFooter };
    });

    const attackFlyoutFooterFeature: SecuritySolutionAttackFlyoutFooterFeature = {
      id: 'security-solution-attack-flyout-footer',
      renderFooter: ({ hit, onAttackUpdated }) => {
        const servicesPromise = this.getDiscoverFlyoutServices(core);
        const storePromise = this.getDiscoverFlyoutStore(core);

        return (
          <React.Suspense fallback={null}>
            <LazyAttackFlyoutFooter
              hit={hit}
              servicesPromise={servicesPromise}
              storePromise={storePromise}
              onAttackUpdated={onAttackUpdated}
            />
          </React.Suspense>
        );
      },
    };
    discoverFeatureRegistry.register(attackFlyoutFooterFeature);
  }

  public async getLazyDiscoverSharedDeps() {
    /**
     * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
     * See https://webpack.js.org/api/module-methods/#magic-comments
     */
    return import(
      /* webpackChunkName: "one_discover_shared_deps" */
      './one_discover'
    );
  }

  /**
   * SubPlugins are the individual building blocks of the Security Solution plugin.
   * They are lazily instantiated to improve startup time.
   * TODO: Move these functions to ./lazy_sub_plugins.ts
   */
  private async createSubPlugins(): Promise<SubPlugins> {
    if (!this._subPlugins) {
      const { subPluginClasses } = await this.lazySubPlugins();
      this._subPlugins = {
        alerts: new subPluginClasses.Detections(),
        assetInventory: new subPluginClasses.AssetInventory(),
        attackDiscovery: new subPluginClasses.AttackDiscovery(),
        rules: new subPluginClasses.Rules(),
        exceptions: new subPluginClasses.Exceptions(),
        cases: new subPluginClasses.Cases(),
        dashboards: new subPluginClasses.Dashboards(),
        explore: new subPluginClasses.Explore(),
        kubernetes: new subPluginClasses.Kubernetes(),
        onboarding: new subPluginClasses.Onboarding(),
        overview: new subPluginClasses.Overview(),
        timelines: new subPluginClasses.Timelines(),
        management: new subPluginClasses.Management(),
        cloudDefend: new subPluginClasses.CloudDefend(),
        cloudSecurityPosture: new subPluginClasses.CloudSecurityPosture(),
        threatIntelligence: new subPluginClasses.ThreatIntelligence(),
        entityAnalytics: new subPluginClasses.EntityAnalytics(),
        siemMigrations: new subPluginClasses.SiemMigrations(),
        siemReadiness: new subPluginClasses.SiemReadiness(),
        configurations: new subPluginClasses.Configurations(),
        reports: new subPluginClasses.Reports(),
      };
    }
    return this._subPlugins;
  }

  private async startSubPlugins(
    storage: Storage,
    core: CoreStart,
    plugins: StartPlugins
  ): Promise<StartedSubPlugins> {
    const subPlugins = await this.createSubPlugins();
    const alerts = await subPlugins.alerts.start(storage, plugins);
    return {
      alerts,
      assetInventory: subPlugins.assetInventory.start(),
      attackDiscovery: subPlugins.attackDiscovery.start(),
      cases: subPlugins.cases.start(),
      cloudDefend: subPlugins.cloudDefend.start(this.isServerless),
      cloudSecurityPosture: subPlugins.cloudSecurityPosture.start(),
      dashboards: subPlugins.dashboards.start(),
      exceptions: subPlugins.exceptions.start(storage),
      explore: subPlugins.explore.start(storage),
      kubernetes: subPlugins.kubernetes.start(),
      management: subPlugins.management.start(core, plugins),
      onboarding: subPlugins.onboarding.start(),
      overview: subPlugins.overview.start(),
      rules: subPlugins.rules.start(storage),
      threatIntelligence: subPlugins.threatIntelligence.start(),
      timelines: subPlugins.timelines.start(),
      entityAnalytics: subPlugins.entityAnalytics.start(),
      siemMigrations: subPlugins.siemMigrations.start(this.experimentalFeatures),
      siemReadiness: subPlugins.siemReadiness.start(),
      configurations: subPlugins.configurations.start(),
      reports: subPlugins.reports.start(),
    };
  }

  /**
   * Lazily instantiate a `SecurityAppStore`. We lazily instantiate this because it requests large dynamic imports. We instantiate it once because each subPlugin needs to share the same reference.
   */
  private async store(
    coreStart: CoreStart,
    startPlugins: StartPlugins,
    subPlugins: StartedSubPlugins
  ): Promise<SecurityAppStore> {
    if (!this._store) {
      const { createStoreFactory } = await this.lazyApplicationDependencies();

      this._store = await createStoreFactory(
        coreStart,
        startPlugins,
        subPlugins,
        this.storage,
        this.experimentalFeatures
      );
    }
    if (startPlugins.timelines) {
      startPlugins.timelines.setTimelineEmbeddedStore(this._store);
    }
    return this._store;
  }

  private async registerActions(
    store: SecurityAppStore,
    history: H.History,
    coreSetup: CoreSetup,
    services: StartServices
  ) {
    if (!this._actionsRegistered) {
      const { registerActions } = await this.lazyActions();
      await registerActions(store, history, coreSetup, services);
      this._actionsRegistered = true;
    }
  }

  /**
   * Registers the plugin updates including status, visibleIn, and deepLinks via the plugin updater$.
   */
  private async registerPluginUpdates(core: CoreStart, plugins: StartPlugins) {
    const { license$ } = plugins.licensing;
    const { capabilities } = core.application;
    const { upsellingService, solutionNavigationTree$ } = this.contract;

    // When the user does not have any of the capabilities required to access security solution, the plugin should be inaccessible
    // This is necessary to hide security solution from the selectable solutions in the spaces UI
    if (!isSecuritySolutionAccessible(capabilities)) {
      this.appUpdater$.next(() => ({ status: AppStatus.inaccessible, visibleIn: [] }));
      // no need to register the links updater when the plugin is inaccessible. return early
      return;
    }

    // Configuration of AppLinks updater registration based on license and capabilities
    const {
      appLinks: initialAppLinks,
      getFilteredLinks,
      registerDeepLinksUpdater,
    } = await this.lazyApplicationLinks();

    registerDeepLinksUpdater(this.appUpdater$, solutionNavigationTree$);

    const appLinksToUpdate$ = new BehaviorSubject<AppLinkItems>(initialAppLinks);

    appLinksToUpdate$.pipe(combineLatestWith(license$)).subscribe(([appLinks, license]) => {
      const params: ApplicationLinksUpdateParams = {
        experimentalFeatures: this.experimentalFeatures,
        upselling: upsellingService,
        capabilities,
        uiSettingsClient: core.uiSettings,
        ...(license.type != null && { license }),
      };
      applicationLinksUpdater.update(appLinks, params);
    });

    const filteredLinks = await getFilteredLinks(core, plugins, this.experimentalFeatures);
    appLinksToUpdate$.next(filteredLinks);
  }

  private registerFleetExtensions(core: CoreStart, plugins: StartPlugins) {
    if (!plugins.fleet) {
      return;
    }

    const { registerExtension } = plugins.fleet;
    const registerOptions: FleetUiExtensionGetterOptions = {
      coreStart: core,
      depsStart: plugins,
      services: {
        upsellingService: this.contract.upsellingService,
      },
    };

    registerExtension({
      package: 'cloud_asset_inventory',
      view: 'package-policy-replace-define-step',
      Component: LazyAssetInventoryReplaceDefineStepExtension,
    });

    registerExtension({
      package: 'endpoint',
      view: 'package-policy-edit',
      Component: getLazyEndpointPolicyEditExtension(registerOptions),
    });

    registerExtension({
      package: 'endpoint',
      view: 'package-policy-response',
      Component: getLazyEndpointPolicyResponseExtension(registerOptions),
    });

    registerExtension({
      package: 'endpoint',
      view: 'package-generic-errors-list',
      Component: getLazyEndpointGenericErrorsListExtension(registerOptions),
    });

    registerExtension({
      package: 'endpoint',
      view: 'package-policy-create',
      Component: getLazyEndpointPolicyCreateExtension(registerOptions),
    });

    registerExtension({
      package: 'endpoint',
      view: 'package-detail-custom',
      Component: getLazyEndpointPackageCustomExtension(registerOptions),
    });

    registerExtension({
      package: 'endpoint',
      view: 'package-detail-assets',
      Component: LazyEndpointCustomAssetsExtension,
    });

    registerExtension({
      package: 'endpoint',
      view: 'endpoint-agent-tamper-protection',
      Component: getLazyEndpointAgentTamperProtectionExtension(registerOptions),
    });

    registerExtension({
      package: 'cloud_security_posture',
      view: 'pli-auth-block',
      Component: getLazyCloudSecurityPosturePliAuthBlockExtension(registerOptions),
    });

    registerExtension({
      package: 'cribl',
      view: 'package-policy-replace-define-step',
      Component: LazyCustomCriblExtension,
    });
  }

  // Lazy loaded dependencies

  private lazyHelpersForRoutes() {
    /**
     * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
     * See https://webpack.js.org/api/module-methods/#magic-comments
     */
    return import(
      /* webpackChunkName: "lazyHelpersForRoutes" */
      './helpers'
    );
  }

  /**
   * The dependencies needed to mount the applications. These are dynamically loaded for the sake of webpack bundling efficiency.
   * Webpack is smart enough to only request (and download) this even when it is imported multiple times concurrently.
   */
  private lazyApplicationDependencies() {
    /**
     * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
     * See https://webpack.js.org/api/module-methods/#magic-comments
     */
    return import(
      /* webpackChunkName: "lazy_application_dependencies" */
      './lazy_application_dependencies'
    );
  }

  /**
   * The dependencies needed to mount the applications. These are dynamically loaded for the sake of webpack bundling efficiency.
   * Webpack is smart enough to only request (and download) this even when it is imported multiple times concurrently.
   */
  private lazySubPlugins() {
    /**
     * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
     * See https://webpack.js.org/api/module-methods/#magic-comments
     */
    return import(
      /* webpackChunkName: "lazy_sub_plugins" */
      './lazy_sub_plugins'
    );
  }

  private lazyApplicationLinks() {
    /**
     * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
     * See https://webpack.js.org/api/module-methods/#magic-comments
     */
    return import(
      /* webpackChunkName: "lazy_app_links" */
      './app/links'
    );
  }

  private lazyActions() {
    /**
     * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
     * See https://webpack.js.org/api/module-methods/#magic-comments
     */
    return import(
      /* webpackChunkName: "lazy_actions" */
      './lazy_actions'
    );
  }

  private lazyAssistantSettingsManagement() {
    /**
     * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
     * See https://webpack.js.org/api/module-methods/#magic-comments
     */
    return import(
      /* webpackChunkName: "lazy_assistant_settings_management" */
      './lazy_assistant_settings_management'
    );
  }
}
