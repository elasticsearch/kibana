/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import apm from 'elastic-apm-node';
import { firstValueFrom } from 'rxjs';
import type { Logger, LoggerFactory } from '@kbn/logging';
import type { NodeRoles } from '@kbn/core-node-server';
import { CriticalError } from '@kbn/core-base-server-internal';
import type { Env, RawConfigurationProvider } from '@kbn/config';
import { ConfigService } from '@kbn/config';
import { DocLinksService } from '@kbn/core-doc-links-server-internal';
import type { ILoggingSystem } from '@kbn/core-logging-server-internal';
import { LoggingService } from '@kbn/core-logging-server-internal';
import { ensureValidConfiguration } from '@kbn/core-config-server-internal';
import { NodeService } from '@kbn/core-node-server-internal';
import { AnalyticsService } from '@kbn/core-analytics-server-internal';
import { EnvironmentService } from '@kbn/core-environment-server-internal';
import { ExecutionContextService } from '@kbn/core-execution-context-server-internal';
import { FeatureFlagsService } from '@kbn/core-feature-flags-server-internal';
import { PrebootService } from '@kbn/core-preboot-server-internal';
import { ContextService } from '@kbn/core-http-context-server-internal';
import { HttpService } from '@kbn/core-http-server-internal';
import { ElasticsearchService } from '@kbn/core-elasticsearch-server-internal';
import { MetricsService } from '@kbn/core-metrics-server-internal';
import { CapabilitiesService } from '@kbn/core-capabilities-server-internal';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import { SavedObjectsService } from '@kbn/core-saved-objects-server-internal';
import { I18nService } from '@kbn/core-i18n-server-internal';
import { DeprecationsService } from '@kbn/core-deprecations-server-internal';
import { UserActivityService } from '@kbn/core-user-activity-server-internal';
import { CoreUsageDataService } from '@kbn/core-usage-data-server-internal';
import { StatusService } from '@kbn/core-status-server-internal';
import { UiSettingsService } from '@kbn/core-ui-settings-server-internal';
import { CustomBrandingService } from '@kbn/core-custom-branding-server-internal';
import { UserSettingsService } from '@kbn/core-user-settings-server-internal';
import { DataStreamsService } from '@kbn/core-data-streams-server-internal';
import {
  CoreRouteHandlerContext,
  PrebootCoreRouteHandlerContext,
} from '@kbn/core-http-request-handler-context-server-internal';
import type {
  RequestHandlerContext,
  PrebootRequestHandlerContext,
} from '@kbn/core-http-request-handler-context-server';
import { RenderingService } from '@kbn/core-rendering-server-internal';
import { HttpRateLimiterService } from '@kbn/core-http-rate-limiter-server-internal';
import { HttpResourcesService } from '@kbn/core-http-resources-server-internal';
import type {
  InternalCorePreboot,
  InternalCoreSetup,
  InternalCoreStart,
} from '@kbn/core-lifecycle-server-internal';
import type { DiscoveredPlugins } from '@kbn/core-plugins-server-internal';
import { PluginsService } from '@kbn/core-plugins-server-internal';
import { CoreAppsService } from '@kbn/core-apps-server-internal';
import { SecurityService } from '@kbn/core-security-server-internal';
import { UserProfileService } from '@kbn/core-user-profile-server-internal';
import { PricingService } from '@kbn/core-pricing-server-internal';
import { CoreInjectionService } from '@kbn/core-di-server-internal';
import { SpanStatusCode } from '@opentelemetry/api';
import { withActiveSpan } from '@kbn/tracing-utils';
import { UserStorageService } from '@kbn/core-user-storage-server-internal';
import { setLazySchemaDisabled } from '@kbn/zod';
import { registerServiceConfig } from './register_service_config';
import { MIGRATION_EXCEPTION_CODE } from './constants';
import { coreConfig, type CoreConfigType } from './core_config';
import { registerRootEvents, reportKibanaStartedEvent, type UptimeSteps } from './events';

const coreId = Symbol('core');

/** @internal */

export class Server {
  public readonly configService: ConfigService;
  private readonly analytics: AnalyticsService;
  private readonly capabilities: CapabilitiesService;
  private readonly context: ContextService;
  private readonly elasticsearch: ElasticsearchService;
  private readonly featureFlags: FeatureFlagsService;
  private readonly http: HttpService;
  private readonly rendering: RenderingService;
  private readonly log: Logger;
  private readonly plugins: PluginsService;
  private readonly savedObjects: SavedObjectsService;
  private readonly uiSettings: UiSettingsService;
  private readonly environment: EnvironmentService;
  private readonly node: NodeService;
  private readonly metrics: MetricsService;
  private readonly httpRateLimiter: HttpRateLimiterService;
  private readonly httpResources: HttpResourcesService;
  private readonly status: StatusService;
  private readonly logging: LoggingService;
  private readonly coreApp: CoreAppsService;
  private readonly coreUsageData: CoreUsageDataService;
  private readonly i18n: I18nService;
  private readonly deprecations: DeprecationsService;
  private readonly userActivity: UserActivityService;
  private readonly executionContext: ExecutionContextService;
  private readonly prebootService: PrebootService;
  private readonly pricing: PricingService;
  private readonly docLinks: DocLinksService;
  private readonly customBranding: CustomBrandingService;
  private readonly userSettingsService: UserSettingsService;
  private readonly security: SecurityService;
  private readonly userProfile: UserProfileService;
  private readonly injection: CoreInjectionService;
  private readonly dataStreams: DataStreamsService;
  private readonly userStorage: UserStorageService;

  private readonly savedObjectsStartPromise: Promise<SavedObjectsServiceStart>;
  private resolveSavedObjectsStartPromise?: (value: SavedObjectsServiceStart) => void;

  #pluginsInitialized?: boolean;
  private coreStart?: InternalCoreStart;
  private discoveredPlugins?: DiscoveredPlugins;
  private readonly logger: LoggerFactory;
  private nodeRoles?: NodeRoles;

  private readonly uptimePerStep: Partial<UptimeSteps> = {};

  constructor(
    rawConfigProvider: RawConfigurationProvider,
    public readonly env: Env,
    private readonly loggingSystem: ILoggingSystem
  ) {
    const constructorStartUptime = performance.now();

    const serviceVersion =
      env.packageInfo.buildFlavor === 'serverless'
        ? env.packageInfo.buildShaShort
        : env.packageInfo.version;
    this.loggingSystem.setGlobalContext({
      service: { version: serviceVersion, type: 'kibana', state: 'initializing' },
    });
    this.logger = this.loggingSystem.asLoggerFactory();
    this.log = this.logger.get('server');
    this.configService = new ConfigService(rawConfigProvider, env, this.logger);

    const core = { coreId, configService: this.configService, env, logger: this.logger };
    this.analytics = new AnalyticsService(core);
    this.injection = new CoreInjectionService();
    this.context = new ContextService(core);
    this.featureFlags = new FeatureFlagsService(core);
    this.http = new HttpService(core);
    this.rendering = new RenderingService(core);
    this.plugins = new PluginsService(core);
    this.elasticsearch = new ElasticsearchService(core);
    this.savedObjects = new SavedObjectsService(core);
    this.uiSettings = new UiSettingsService(core);
    this.capabilities = new CapabilitiesService(core);
    this.environment = new EnvironmentService(core);
    this.node = new NodeService(core);
    this.metrics = new MetricsService(core);
    this.status = new StatusService(core);
    this.coreApp = new CoreAppsService(core);
    this.httpRateLimiter = new HttpRateLimiterService();
    this.httpResources = new HttpResourcesService(core);
    this.logging = new LoggingService(core);
    this.coreUsageData = new CoreUsageDataService(core);
    this.i18n = new I18nService(core);
    this.deprecations = new DeprecationsService(core);
    this.userActivity = new UserActivityService(core);
    this.executionContext = new ExecutionContextService(core);
    this.prebootService = new PrebootService(core);
    this.pricing = new PricingService(core);
    this.docLinks = new DocLinksService(core);
    this.customBranding = new CustomBrandingService(core);
    this.userSettingsService = new UserSettingsService(core);
    this.security = new SecurityService(core);
    this.userProfile = new UserProfileService(core);
    this.dataStreams = new DataStreamsService(core);
    this.userStorage = new UserStorageService(core);

    this.savedObjectsStartPromise = new Promise((resolve) => {
      this.resolveSavedObjectsStartPromise = resolve;
    });

    this.uptimePerStep.constructor = { start: constructorStartUptime, end: performance.now() };
  }

  public async preboot(): Promise<InternalCorePreboot | undefined> {
    this.log.debug('prebooting server');

    const config = await firstValueFrom(this.configService.atPath<CoreConfigType>(coreConfig.path));
    const { disablePreboot } = config.lifecycle;
    if (disablePreboot) {
      this.log.info('preboot phase is disabled - skipping');
    }

    const prebootStartUptime = performance.now();
    const prebootTransaction = apm.startTransaction('server-preboot', 'kibana-platform');

    return withActiveSpan(
      'server-preboot',
      { attributes: { 'transaction.type': 'kibana-platform' } },
      async () => {
        try {
          const corePreboot = await this.#preboot(disablePreboot);
          prebootTransaction.end();
          this.uptimePerStep.preboot = { start: prebootStartUptime, end: performance.now() };
          return corePreboot;
        } catch (error) {
          prebootTransaction.end('error');
          throw error;
        }
      }
    );
  }

  async #preboot(disablePreboot: boolean) {
    // service required for plugin discovery
    const analyticsPreboot = this.analytics.preboot();
    const environmentPreboot = await this.environment.preboot({
      analytics: analyticsPreboot,
    });
    const nodePreboot = await this.node.preboot({ loggingSystem: this.loggingSystem });
    this.nodeRoles = nodePreboot.roles;

    // Apply the `disableLazyZodSchemas` static override for `@kbn/zod` before plugin
    // discovery so that `lazySchema` calls evaluated at plugin-module-load time observe it.
    await this.#applyLazyZodSchemaOverride();

    // Discover any plugins before continuing. This allows other systems to utilize the plugin dependency graph.
    this.discoveredPlugins = await this.plugins.discover({
      environment: environmentPreboot,
      node: nodePreboot,
    });

    if (!disablePreboot) {
      // Immediately terminate in case of invalid configuration. This needs to be done after plugin discovery. We also
      // silent deprecation warnings until `setup` stage where we'll validate config once again.
      await ensureValidConfiguration(this.configService, { logDeprecations: false });
    }

    // services we need to preboot even when preboot is disabled
    const uiSettingsPreboot = await this.uiSettings.preboot();
    const loggingPreboot = this.logging.preboot({ loggingSystem: this.loggingSystem });

    let corePreboot: InternalCorePreboot | undefined;

    if (!disablePreboot) {
      const { uiPlugins, pluginTree, pluginPaths } = this.discoveredPlugins.preboot;

      const contextServicePreboot = this.context.preboot({
        pluginDependencies: new Map([...pluginTree.asOpaqueIds]),
      });
      const docLinksPreboot = this.docLinks.setup();

      const httpPreboot = await this.http.preboot({
        context: contextServicePreboot,
        docLinks: docLinksPreboot,
      });

      // setup i18n prior to any other service, to have translations ready
      const i18nPreboot = await this.i18n.preboot({ http: httpPreboot, pluginPaths });

      this.pricing.preboot({ http: httpPreboot });

      this.capabilities.preboot({ http: httpPreboot });

      const elasticsearchServicePreboot = await this.elasticsearch.preboot();

      await this.status.preboot({ http: httpPreboot });

      const renderingPreboot = await this.rendering.preboot({
        http: httpPreboot,
        uiPlugins,
        i18n: i18nPreboot,
      });

      const httpResourcesPreboot = this.httpResources.preboot({
        http: httpPreboot,
        rendering: renderingPreboot,
      });

      corePreboot = {
        analytics: analyticsPreboot,
        context: contextServicePreboot,
        elasticsearch: elasticsearchServicePreboot,
        http: httpPreboot,
        uiSettings: uiSettingsPreboot,
        httpResources: httpResourcesPreboot,
        logging: loggingPreboot,
        preboot: this.prebootService.preboot(),
      };

      await this.plugins.preboot(corePreboot);

      httpPreboot.registerRouteHandlerContext<PrebootRequestHandlerContext, 'core'>(
        coreId,
        'core',
        () => {
          return new PrebootCoreRouteHandlerContext(corePreboot!);
        }
      );

      this.coreApp.preboot(corePreboot, uiPlugins);
    }
    return corePreboot;
  }

  public async setup() {
    this.log.debug('setting up server');
    const setupStartUptime = performance.now();
    const setupTransaction = apm.startTransaction('server-setup', 'kibana-platform');

    return withActiveSpan(
      'server-setup',
      { attributes: { 'transaction.type': 'kibana-platform' } },
      async () => {
        try {
          const coreSetup = await this.#setup();
          setupTransaction.end();
          this.uptimePerStep.setup = { start: setupStartUptime, end: performance.now() };
          return coreSetup;
        } catch (error) {
          setupTransaction.end('error');
          throw error;
        }
      }
    );
  }

  async #setup() {
    const analyticsSetup = this.analytics.setup();

    registerRootEvents(analyticsSetup);

    const environmentSetup = this.environment.setup();

    // Configuration could have changed after preboot.
    await this.ensureValidConfiguration();

    const { uiPlugins, pluginPaths, pluginTree } = this.discoveredPlugins!.standard;
    const contextServiceSetup = this.context.setup({
      pluginDependencies: new Map([...pluginTree.asOpaqueIds]),
    });
    const executionContextSetup = this.executionContext.setup();
    const docLinksSetup = this.docLinks.setup();
    const securitySetup = this.security.setup();
    const userProfileSetup = this.userProfile.setup();

    const injectionSetup = this.injection.setup();

    const loggingSetup = this.logging.setup();

    const userActivitySetup = this.userActivity.setup({ logging: loggingSetup });

    const httpSetup = await this.http.setup({
      context: contextServiceSetup,
      executionContext: executionContextSetup,
      userActivity: userActivitySetup,
    });

    // setup i18n prior to any other service, to have translations ready
    const i18nServiceSetup = await this.i18n.setup({ http: httpSetup, pluginPaths });

    const capabilitiesSetup = this.capabilities.setup({ http: httpSetup });

    const elasticsearchServiceSetup = await this.elasticsearch.setup({
      analytics: analyticsSetup,
      http: httpSetup,
      executionContext: executionContextSetup,
      security: securitySetup,
      loggingSystem: this.loggingSystem,
    });

    const dataStreamsSetup = await this.dataStreams.setup();

    const metricsSetup = await this.metrics.setup({
      http: httpSetup,
      elasticsearchService: elasticsearchServiceSetup,
    });

    const httpRateLimiterSetup = this.httpRateLimiter.setup({
      http: httpSetup,
      metrics: metricsSetup,
    });

    const coreUsageDataSetup = this.coreUsageData.setup({
      http: httpSetup,
      metrics: metricsSetup,
      savedObjectsStartPromise: this.savedObjectsStartPromise,
      changedDeprecatedConfigPath$: this.configService.getDeprecatedConfigPath$(),
    });

    const deprecationsSetup = await this.deprecations.setup({
      http: httpSetup,
      coreUsageData: coreUsageDataSetup,
      logging: loggingSetup,
      docLinks: docLinksSetup,
    });

    const savedObjectsSetup = await this.savedObjects.setup({
      http: httpSetup,
      elasticsearch: elasticsearchServiceSetup,
      deprecations: deprecationsSetup,
      coreUsageData: coreUsageDataSetup,
      docLinks: docLinksSetup,
    });

    const uiSettingsSetup = await this.uiSettings.setup({
      http: httpSetup,
      savedObjects: savedObjectsSetup,
    });

    const userStorageSetup = this.userStorage.setup({
      http: httpSetup,
      savedObjects: savedObjectsSetup,
    });

    const statusSetup = await this.status.setup({
      analytics: analyticsSetup,
      elasticsearch: elasticsearchServiceSetup,
      pluginDependencies: pluginTree.asNames,
      savedObjects: savedObjectsSetup,
      environment: environmentSetup,
      http: httpSetup,
      httpRateLimiter: httpRateLimiterSetup,
      metrics: metricsSetup,
      coreUsageData: coreUsageDataSetup,
      loggingSystem: this.loggingSystem,
    });

    const customBrandingSetup = this.customBranding.setup();
    const userSettingsServiceSetup = this.userSettingsService.setup();
    const featureFlagsSetup = this.featureFlags.setup({
      http: httpSetup,
    });

    const renderingSetup = await this.rendering.setup({
      elasticsearch: elasticsearchServiceSetup,
      featureFlags: featureFlagsSetup,
      http: httpSetup,
      status: statusSetup,
      uiPlugins,
      customBranding: customBrandingSetup,
      userSettings: userSettingsServiceSetup,
      i18n: i18nServiceSetup,
    });

    const httpResourcesSetup = this.httpResources.setup({
      http: httpSetup,
      rendering: renderingSetup,
    });

    const pricingSetup = await this.pricing.setup({ http: httpSetup });

    const coreSetup: InternalCoreSetup = {
      analytics: analyticsSetup,
      capabilities: capabilitiesSetup,
      context: contextServiceSetup,
      customBranding: customBrandingSetup,
      docLinks: docLinksSetup,
      elasticsearch: elasticsearchServiceSetup,
      environment: environmentSetup,
      executionContext: executionContextSetup,
      featureFlags: featureFlagsSetup,
      http: httpSetup,
      i18n: i18nServiceSetup,
      savedObjects: savedObjectsSetup,
      status: statusSetup,
      uiSettings: uiSettingsSetup,
      rendering: renderingSetup,
      httpResources: httpResourcesSetup,
      logging: loggingSetup,
      metrics: metricsSetup,
      deprecations: deprecationsSetup,
      userActivity: userActivitySetup,
      coreUsageData: coreUsageDataSetup,
      pricing: pricingSetup,
      userSettings: userSettingsServiceSetup,
      security: securitySetup,
      userProfile: userProfileSetup,
      injection: injectionSetup,
      dataStreams: dataStreamsSetup,
      userStorage: userStorageSetup,
    };

    const { contracts, initialized } = await this.plugins.setup(coreSetup);
    coreSetup._plugins = contracts;
    this.#pluginsInitialized = initialized;
    /**
     * This is a necessary step to ensure that the pricing service is ready to be used.
     * It must be called after all plugins have been setup.
     * This guarantee that all plugins checking for a feature availability with isFeatureAvailable
     * in the server setup contract get the right access to the feature availability.
     */
    pricingSetup.evaluateProductFeatures();

    this.registerCoreContext(coreSetup);
    await this.coreApp.setup(coreSetup, uiPlugins);

    return coreSetup;
  }

  public async start() {
    this.log.debug('starting server');
    const startStartUptime = performance.now();
    const startTransaction = apm.startTransaction('server-start', 'kibana-platform');
    return withActiveSpan(
      'server-start',
      { attributes: { 'transaction.type': 'kibana-platform' } },
      async (span) => {
        try {
          const coreStart = await this.#start(startTransaction);
          startTransaction.end();
          this.uptimePerStep.start = { start: startStartUptime, end: performance.now() };

          reportKibanaStartedEvent({
            uptimeSteps: this.uptimePerStep as UptimeSteps,
            analytics: coreStart.analytics,
          });

          return coreStart;
        } catch (error) {
          if (error instanceof CriticalError && error.code === MIGRATION_EXCEPTION_CODE) {
            // Intentionally setting this span as sucessful as this is not an error condition.
            // The `withActiveSpan` wrapper utility won't reset it to error because we're ending the span (and it checks that it's still recording before setting anything else).
            span?.setStatus({ code: SpanStatusCode.OK });
            span?.end();
            startTransaction.end();
          } else {
            startTransaction.end('error');
          }
          throw error;
        }
      }
    );
  }

  async #start(startTransaction: apm.Transaction) {
    const injectionStart = this.injection.start();
    const analyticsStart = this.analytics.start();
    const securityStart = this.security.start();
    const userProfileStart = this.userProfile.start();
    this.userSettingsService.start({ userProfile: userProfileStart });
    const executionContextStart = this.executionContext.start();
    const docLinkStart = this.docLinks.start();

    const elasticsearchStart = await this.elasticsearch.start();
    this.uptimePerStep.elasticsearch = {
      waitTime: elasticsearchStart.metrics.elasticsearchWaitTime,
    };

    const dataStreamsStart = await this.dataStreams.start({
      elasticsearch: elasticsearchStart,
    });

    const deprecationsStart = this.deprecations.start();
    const userActivityStart = this.userActivity.start();
    const soStartSpan = startTransaction.startSpan('saved_objects.migration', 'migration');
    const savedObjectsStart = await withActiveSpan(
      'saved_objects.migration',
      {
        attributes: {
          'transaction.type': 'migration',
        },
      },
      async () => {
        try {
          const _savedObjectsStart = await this.savedObjects.start({
            elasticsearch: elasticsearchStart,
            pluginsInitialized: this.#pluginsInitialized,
            docLinks: docLinkStart,
            node: await this.node.start(),
          });
          this.uptimePerStep.savedObjects = {
            migrationTime: _savedObjectsStart.metrics.migrationDuration,
          };
          await this.resolveSavedObjectsStartPromise!(_savedObjectsStart);
          soStartSpan?.end();
          return _savedObjectsStart;
        } catch (error) {
          soStartSpan?.setOutcome('failure');
          soStartSpan?.end();
          throw error;
        }
      }
    );

    if (this.nodeRoles?.migrator === true) {
      this.log.info('Detected migrator node role; shutting down Kibana...');
      throw new CriticalError(
        'Migrations completed, shutting down Kibana',
        MIGRATION_EXCEPTION_CODE,
        0
      );
    }

    const capabilitiesStart = this.capabilities.start();
    const uiSettingsStart = await this.uiSettings.start();
    const userStorageStart = this.userStorage.start({
      savedObjects: savedObjectsStart,
      security: securityStart,
    });
    const customBrandingStart = this.customBranding.start();
    const metricsStart = await this.metrics.start();
    const httpStart = this.http.getStartContract();
    httpStart.setRedactedSessionIdGetter((request) =>
      securityStart.authc.getRedactedSessionId(request)
    );
    const coreUsageDataStart = this.coreUsageData.start({
      elasticsearch: elasticsearchStart,
      savedObjects: savedObjectsStart,
      exposedConfigsToUsage: this.plugins.getExposedPluginConfigsToUsage(),
    });

    const featureFlagsStart = this.featureFlags.start();

    const pricingStart = this.pricing.start();

    this.httpRateLimiter.start();
    this.status.start();

    this.rendering.start({
      featureFlags: featureFlagsStart,
      userStorage: userStorageStart,
    });

    this.coreStart = {
      analytics: analyticsStart,
      capabilities: capabilitiesStart,
      customBranding: customBrandingStart,
      docLinks: docLinkStart,
      elasticsearch: elasticsearchStart,
      executionContext: executionContextStart,
      featureFlags: featureFlagsStart,
      http: httpStart,
      metrics: metricsStart,
      savedObjects: savedObjectsStart,
      uiSettings: uiSettingsStart,
      coreUsageData: coreUsageDataStart,
      userActivity: userActivityStart,
      deprecations: deprecationsStart,
      security: securityStart,
      userProfile: userProfileStart,
      pricing: pricingStart,
      injection: injectionStart,
      dataStreams: dataStreamsStart,
      userStorage: userStorageStart,
    };

    this.coreApp.start(this.coreStart);

    await this.plugins.start(this.coreStart);

    await this.http.start();

    return this.coreStart;
  }

  public async stop() {
    this.log.debug('stopping server');

    this.coreApp.stop();
    this.httpRateLimiter.stop();
    await this.analytics.stop();
    await this.http.stop(); // HTTP server has to stop before savedObjects and ES clients are closed to be able to gracefully attempt to resolve any pending requests
    await this.plugins.stop();
    await this.savedObjects.stop();
    await this.elasticsearch.stop();
    await this.uiSettings.stop();
    await this.rendering.stop();
    await this.metrics.stop();
    await this.status.stop();
    await this.logging.stop();
    await this.customBranding.stop();
    await this.featureFlags.stop();
    this.node.stop();
    this.deprecations.stop();
    this.security.stop();
    this.userProfile.stop();
    this.userStorage.stop();
  }

  private async ensureValidConfiguration() {
    try {
      await ensureValidConfiguration(this.configService);
    } catch (validationError) {
      const config = await firstValueFrom(
        this.configService.atPath<CoreConfigType>(coreConfig.path)
      );
      if (!config.enableStripUnknownConfigWorkaround) {
        throw validationError;
      }
      // When running on serverless, we may allow unknown keys, but stripping them from the final config object.
      this.configService.setGlobalStripUnknownKeys(true);
      await ensureValidConfiguration(this.configService, {
        logDeprecations: true,
        stripUnknownKeys: true,
      });
      this.log
        .get('config-validation')
        .error(
          `Strict config validation failed! Extra unknown keys removed in Serverless-compatible mode. Original error: ${validationError}`
        );
    }
  }

  async #applyLazyZodSchemaOverride() {
    const featureFlagsCfg = await firstValueFrom(
      this.configService.atPath<{ overrides?: Record<string, unknown> }>('feature_flags')
    );
    const override = featureFlagsCfg.overrides?.disableLazyZodSchemas;

    if (typeof override === 'boolean') {
      setLazySchemaDisabled(override);
    }
  }

  private registerCoreContext(coreSetup: InternalCoreSetup) {
    coreSetup.http.registerRouteHandlerContext<RequestHandlerContext, 'core'>(
      coreId,
      'core',
      (context, req) => {
        return new CoreRouteHandlerContext(this.coreStart!, req);
      }
    );
  }

  public setupCoreConfig() {
    registerServiceConfig(this.configService);
  }
}
