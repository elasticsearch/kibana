/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import { map } from 'rxjs';

import type { CloudSetup, CloudStart } from '@kbn/cloud-plugin/server';
import type { TypeOf } from '@kbn/config-schema';
import type {
  CoreSetup,
  CoreStart,
  ISavedObjectTypeRegistry,
  KibanaRequest,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { FeaturesPluginSetup, FeaturesPluginStart } from '@kbn/features-plugin/server';
import type { LicensingPluginSetup, LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type {
  AuditServiceSetup,
  AuthorizationServiceSetup,
  SecurityPluginSetup as SecurityPluginSetupWithoutDeprecatedMembers,
  SecurityPluginStart,
} from '@kbn/security-plugin-types-server';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';

import { AnalyticsService } from './analytics';
import type { AnonymousAccessServiceStart } from './anonymous_access';
import { AnonymousAccessService } from './anonymous_access';
import { AuditService } from './audit';
import type { InternalAuthenticationServiceStart } from './authentication';
import { AuthenticationService } from './authentication';
import type { AuthorizationServiceSetupInternal } from './authorization';
import { AuthorizationService } from './authorization';
import { buildSecurityApi, buildUserProfileApi } from './build_delegate_apis';
import type { ConfigSchema, ConfigType } from './config';
import { createConfig } from './config';
import { getPrivilegeDeprecationsService, registerKibanaUserRoleDeprecation } from './deprecations';
import { ElasticsearchService } from './elasticsearch';
import type { SecurityFeatureUsageServiceStart } from './feature_usage';
import { SecurityFeatureUsageService } from './feature_usage';
import { securityFeatures } from './features';
import type { FipsServiceSetupInternal } from './fips';
import { FipsService } from './fips';
import { defineRoutes } from './routes';
import { setupSavedObjects } from './saved_objects';
import type { Session } from './session_management';
import { SessionManagementService } from './session_management';
import { setupSpacesClient } from './spaces';
import { UiamService } from './uiam';
import { registerSecurityUsageCollector } from './usage_collector';
import { UserProfileService } from './user_profile';
import type { UserProfileServiceStartInternal } from './user_profile';
import type { AuthenticatedUser, SecurityLicense } from '../common';
import { SecurityLicenseService } from '../common/licensing';

export type SpacesService = Pick<
  SpacesPluginSetup['spacesService'],
  'getSpaceId' | 'namespaceToSpaceId'
>;

/**
 * Describes public Security plugin contract returned at the `setup` stage.
 */
export interface SecurityPluginSetup extends SecurityPluginSetupWithoutDeprecatedMembers {
  /**
   * @deprecated Use `authc` methods from the `SecurityServiceStart` contract instead.
   */
  authc: {
    getCurrentUser: (request: KibanaRequest) => AuthenticatedUser | null;
  };
  /**
   * @deprecated Use `authz` methods from the `SecurityServiceStart` contract instead.
   */
  authz: AuthorizationServiceSetup;
}

export interface PluginSetupDependencies {
  features: FeaturesPluginSetup;
  licensing: LicensingPluginSetup;
  taskManager: TaskManagerSetupContract;
  usageCollection?: UsageCollectionSetup;
  spaces?: SpacesPluginSetup;
  cloud?: CloudSetup;
}

export interface PluginStartDependencies {
  cloud?: CloudStart;
  features: FeaturesPluginStart;
  licensing: LicensingPluginStart;
  taskManager: TaskManagerStartContract;
  spaces?: SpacesPluginStart;
}

/**
 * Represents Security Plugin instance that will be managed by the Kibana plugin system.
 */
export class SecurityPlugin
  implements Plugin<SecurityPluginSetup, SecurityPluginStart, PluginSetupDependencies>
{
  private readonly logger: Logger;
  private authorizationSetup?: AuthorizationServiceSetupInternal;
  private auditSetup?: AuditServiceSetup;

  private configSubscription?: Subscription;

  private config?: ConfigType;
  private readonly getConfig = () => {
    if (!this.config) {
      throw new Error('Config is not available.');
    }
    return this.config;
  };

  private session?: Session;
  private readonly getSession = () => {
    if (!this.session) {
      throw new Error('Session is not available.');
    }
    return this.session;
  };

  private kibanaIndexName?: string;
  private readonly getKibanaIndexName = () => {
    if (!this.kibanaIndexName) {
      throw new Error('Kibana index name is not available.');
    }
    return this.kibanaIndexName;
  };

  private readonly authenticationService: AuthenticationService;
  private authenticationStart?: InternalAuthenticationServiceStart;
  private readonly getAuthentication = () => {
    if (!this.authenticationStart) {
      throw new Error(`authenticationStart is not registered!`);
    }
    return this.authenticationStart;
  };

  private readonly featureUsageService = new SecurityFeatureUsageService();
  private featureUsageServiceStart?: SecurityFeatureUsageServiceStart;
  private readonly getFeatureUsageService = () => {
    if (!this.featureUsageServiceStart) {
      throw new Error(`featureUsageServiceStart is not registered!`);
    }
    return this.featureUsageServiceStart;
  };

  private readonly auditService: AuditService;
  private readonly securityLicenseService = new SecurityLicenseService();
  private readonly analyticsService: AnalyticsService;
  private readonly authorizationService = new AuthorizationService();
  private readonly elasticsearchService: ElasticsearchService;
  private readonly sessionManagementService: SessionManagementService;
  private readonly anonymousAccessService: AnonymousAccessService;
  private anonymousAccessStart?: AnonymousAccessServiceStart;
  private readonly getAnonymousAccess = () => {
    if (!this.anonymousAccessStart) {
      throw new Error(`anonymousAccessStart is not registered!`);
    }
    return this.anonymousAccessStart;
  };

  private readonly userProfileService: UserProfileService;
  private userProfileStart?: UserProfileServiceStartInternal;

  private readonly getUserProfileService = () => {
    if (!this.userProfileStart) {
      throw new Error(`userProfileStart is not registered!`);
    }
    return this.userProfileStart;
  };

  private readonly fipsService: FipsService;
  private fipsServiceSetup?: FipsServiceSetupInternal;

  private elasticsearchUrl?: string;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.logger = this.initializerContext.logger.get();

    this.authenticationService = new AuthenticationService(
      this.initializerContext.logger.get('authentication')
    );
    this.auditService = new AuditService(this.initializerContext.logger.get('audit'));

    this.elasticsearchService = new ElasticsearchService(
      this.initializerContext.logger.get('elasticsearch')
    );
    this.sessionManagementService = new SessionManagementService(
      this.initializerContext.logger.get('session')
    );
    this.anonymousAccessService = new AnonymousAccessService(
      this.initializerContext.logger.get('anonymous-access'),
      this.getConfig
    );
    this.userProfileService = new UserProfileService(
      this.initializerContext.logger.get('user-profile')
    );

    this.analyticsService = new AnalyticsService(this.initializerContext.logger.get('analytics'));

    this.fipsService = new FipsService(this.initializerContext.logger.get('fips'));
  }

  public setup(
    core: CoreSetup<PluginStartDependencies, SecurityPluginStart>,
    { features, licensing, taskManager, usageCollection, spaces, cloud }: PluginSetupDependencies
  ) {
    this.kibanaIndexName = core.savedObjects.getDefaultIndex();
    const config$ = this.initializerContext.config.create<TypeOf<typeof ConfigSchema>>().pipe(
      map((rawConfig) =>
        createConfig(rawConfig, this.initializerContext.logger.get('config'), {
          isTLSEnabled: core.http.getServerInfo().protocol === 'https',
        })
      )
    );
    this.configSubscription = config$.subscribe((config) => {
      this.config = config;
    });

    const config = this.getConfig();
    const kibanaIndexName = this.getKibanaIndexName();

    // A subset of `start` services we need during `setup`.
    const startServicesPromise = core.getStartServices().then(([coreServices, depsServices]) => ({
      elasticsearch: coreServices.elasticsearch,
      features: depsServices.features,
    }));

    const { license } = this.securityLicenseService.setup({
      license$: licensing.license$,
    });

    securityFeatures.forEach((securityFeature) =>
      features.registerElasticsearchFeature(securityFeature)
    );

    if (cloud?.cloudId) {
      this.elasticsearchUrl = this.decodeElasticsearchUrlFromCloudId(cloud.cloudId);
    }

    this.elasticsearchService.setup({ license, status: core.status });
    this.featureUsageService.setup({ featureUsage: licensing.featureUsage });
    this.sessionManagementService.setup({ config, http: core.http, taskManager });
    this.authenticationService.setup({
      http: core.http,
      elasticsearch: core.elasticsearch,
      config,
      license,
      customBranding: core.customBranding,
    });

    registerSecurityUsageCollector({ usageCollection, config, license });

    const getCurrentUser = (request: KibanaRequest) =>
      this.getAuthentication().getCurrentUser(request);

    this.auditSetup = this.auditService.setup({
      license,
      config: config.audit,
      logging: core.logging,
      http: core.http,
      getSpaceId: (request) => spaces?.spacesService.getSpaceId(request),
      getSID: (request) => this.getSession().getSID(request),
      getCurrentUser,
      recordAuditLoggingUsage: () => this.getFeatureUsageService().recordAuditLoggingUsage(),
    });

    this.anonymousAccessService.setup();

    this.authorizationSetup = this.authorizationService.setup({
      http: core.http,
      capabilities: core.capabilities,
      getClusterClient: () =>
        startServicesPromise.then(({ elasticsearch }) => elasticsearch.client),
      license,
      loggers: this.initializerContext.logger,
      kibanaIndexName,
      packageVersion: this.initializerContext.env.packageInfo.version,
      getSpacesService: () => spaces?.spacesService,
      features,
      getCurrentUser,
      customBranding: core.customBranding,
    });

    this.userProfileService.setup({ authz: this.authorizationSetup, license });

    this.fipsServiceSetup = this.fipsService.setup({ config, license });
    this.fipsServiceSetup.validateLicenseForFips();

    let getTypeRegistrySync: (() => ISavedObjectTypeRegistry) | undefined;
    void core.getStartServices().then(([coreStart]) => {
      getTypeRegistrySync = () => coreStart.savedObjects.getTypeRegistry();
    });

    setupSpacesClient({
      spaces,
      audit: this.auditSetup,
      authz: this.authorizationSetup,
      getCurrentUser,
      getTypeRegistry: () => {
        /**
         * The setup spaces client just registers the callback during setup using `registerClientWrapper` but doesn't invoke it.
         * When `createSpacesClient` is run during `start`, startServices is guaranteed to be passed in
         * and we can use the type registry from there.
         */
        if (!getTypeRegistrySync) {
          throw new Error('Type registry is not available');
        }
        return getTypeRegistrySync();
      },
    });

    setupSavedObjects({
      audit: this.auditSetup,
      authz: this.authorizationSetup,
      savedObjects: core.savedObjects,
      getCurrentUser,
    });

    this.registerDeprecations(core, license);

    core.security.registerSecurityDelegate(
      buildSecurityApi({
        getAuthc: this.getAuthentication.bind(this),
        getSession: this.getSession,
        audit: this.auditSetup,
        config,
        logger: this.logger,
      })
    );
    core.userProfile.registerUserProfileDelegate(
      buildUserProfileApi({
        getUserProfile: this.getUserProfileService.bind(this),
      })
    );

    defineRoutes({
      router: core.http.createRouter(),
      basePath: core.http.basePath,
      httpResources: core.http.resources,
      logger: this.initializerContext.logger.get('routes'),
      config,
      config$,
      authz: this.authorizationSetup,
      license,
      getSession: this.getSession,
      getFeatures: () =>
        startServicesPromise.then((services) => services.features.getKibanaFeatures()),
      subFeaturePrivilegeIterator: features.subFeaturePrivilegeIterator,
      getFeatureUsageService: this.getFeatureUsageService,
      getAuthenticationService: this.getAuthentication,
      getAnonymousAccessService: this.getAnonymousAccess,
      getUserProfileService: this.getUserProfileService,
      serverlessProjectId: cloud?.serverless?.projectId,
      analyticsService: this.analyticsService.setup({ analytics: core.analytics }),
      buildFlavor: this.initializerContext.env.packageInfo.buildFlavor,
      docLinks: core.docLinks,
      i18n: core.i18n,
    });

    return Object.freeze<SecurityPluginSetup>({
      audit: this.auditSetup,
      authc: {
        getCurrentUser,
      },
      authz: {
        actions: this.authorizationSetup.actions,
        checkPrivilegesWithRequest: this.authorizationSetup.checkPrivilegesWithRequest,
        checkPrivilegesDynamicallyWithRequest:
          this.authorizationSetup.checkPrivilegesDynamicallyWithRequest,
        checkSavedObjectsPrivilegesWithRequest:
          this.authorizationSetup.checkSavedObjectsPrivilegesWithRequest,
        mode: this.authorizationSetup.mode,
      },
      license,
      privilegeDeprecationsService: getPrivilegeDeprecationsService({
        authz: this.authorizationSetup,
        getFeatures: () =>
          startServicesPromise.then((services) => services.features.getKibanaFeatures()),
        license,
        logger: this.logger.get('deprecations'),
      }),
    });
  }

  public start(
    core: CoreStart,
    { cloud, features, licensing, taskManager, spaces }: PluginStartDependencies
  ) {
    this.logger.debug('Starting plugin');

    this.featureUsageServiceStart = this.featureUsageService.start({
      featureUsage: licensing.featureUsage,
    });

    const clusterClient = core.elasticsearch.client;
    const { watchOnlineStatus$ } = this.elasticsearchService.start();
    const { session } = this.sessionManagementService.start({
      audit: this.auditSetup!,
      elasticsearchClient: clusterClient.asInternalUser,
      kibanaIndexName: this.getKibanaIndexName(),
      online$: watchOnlineStatus$(),
      taskManager,
    });
    this.session = session;

    this.userProfileStart = this.userProfileService.start({
      clusterClient,
      session,
      getCurrentUser: core.security.authc.getCurrentUser,
    });

    // In serverless, we want to redirect users to the list of projects instead of standard "Logged Out" page.
    const customLogoutURL =
      this.initializerContext.env.packageInfo.buildFlavor === 'serverless'
        ? cloud?.projectsUrl
        : undefined;

    const config = this.getConfig();

    const { protocol, hostname, port } = core.http.getServerInfo();
    const serverBaseUrl = `${protocol}://${hostname}:${port}`;

    const kibanaServerResourceURL =
      config.mcp?.oauth2?.metadata?.resource ?? core.http.basePath.publicBaseUrl ?? serverBaseUrl;

    this.authenticationStart = this.authenticationService.start({
      audit: this.auditSetup!,
      clusterClient,
      config,
      featureUsageService: this.featureUsageServiceStart,
      userProfileService: this.userProfileStart,
      http: core.http,
      loggers: this.initializerContext.logger,
      session,
      uiam: config.uiam?.enabled
        ? new UiamService(this.logger.get('uiam'), config.uiam, {
            kibanaServerResourceURL,
            elasticsearchUrl: this.elasticsearchUrl,
            kibanaVersion: this.initializerContext.env.packageInfo.version,
          })
        : undefined,
      applicationName: this.authorizationSetup!.applicationName,
      kibanaFeatures: features.getKibanaFeatures(),
      isElasticCloudDeployment: () => cloud?.isCloudEnabled === true,
      customLogoutURL,
      buildFlavor: this.initializerContext.env.packageInfo.buildFlavor,
      userActivity: core.userActivity,
    });

    this.authorizationService.start({
      features,
      clusterClient,
      online$: watchOnlineStatus$(),
    });

    this.anonymousAccessStart = this.anonymousAccessService.start({
      capabilities: core.capabilities,
      clusterClient,
      spaces: spaces?.spacesService,
    });

    // Destructure to exclude 'uiam' from the public API
    const { uiam: _uiam, ...publicApiKeys } = this.authenticationStart.apiKeys;

    return Object.freeze<SecurityPluginStart>({
      authc: {
        getCurrentUser: this.authenticationStart.getCurrentUser,
        apiKeys: publicApiKeys,
      },
      authz: {
        actions: this.authorizationSetup!.actions,
        checkPrivilegesWithRequest: this.authorizationSetup!.checkPrivilegesWithRequest,
        checkPrivilegesDynamicallyWithRequest:
          this.authorizationSetup!.checkPrivilegesDynamicallyWithRequest,
        checkSavedObjectsPrivilegesWithRequest:
          this.authorizationSetup!.checkSavedObjectsPrivilegesWithRequest,
        mode: this.authorizationSetup!.mode,
      },
      userProfiles: {
        getCurrent: this.userProfileStart.getCurrent,
        bulkGet: this.userProfileStart.bulkGet,
        suggest: this.userProfileStart.suggest,
      },
    });
  }

  public stop() {
    this.logger.debug('Stopping plugin');

    if (this.configSubscription) {
      this.configSubscription.unsubscribe();
      this.configSubscription = undefined;
    }

    if (this.featureUsageServiceStart) {
      this.featureUsageServiceStart = undefined;
    }

    if (this.authenticationStart) {
      this.authenticationStart = undefined;
    }

    if (this.anonymousAccessStart) {
      this.anonymousAccessStart = undefined;
    }

    this.securityLicenseService.stop();
    this.auditService.stop();
    this.authorizationService.stop();
    this.sessionManagementService.stop();
  }

  private registerDeprecations(core: CoreSetup, license: SecurityLicense) {
    const logger = this.logger.get('deprecations');
    registerKibanaUserRoleDeprecation({
      deprecationsService: core.deprecations,
      license,
      logger,
      packageInfo: this.initializerContext.env.packageInfo,
      docLinks: core.docLinks,
    });
  }

  private decodeElasticsearchUrlFromCloudId(cloudId: string): string | undefined {
    this.logger.debug(`CloudId: ${cloudId}`);

    const id = cloudId.split(':').pop();
    if (!id) {
      return undefined;
    }

    try {
      const decoded = Buffer.from(id, 'base64').toString('utf8');
      const parts = decoded.split('$');
      if (parts.length < 2) {
        return undefined;
      }

      const [hostWithPort, esIdWithPort] = parts;
      const [host, defaultPort = '443'] = hostWithPort.split(':');
      const [esId, esPort = defaultPort] = esIdWithPort.split(':');

      const esHost = esId ? `${esId}.${host}` : host;
      const endpoint = `https://${esHost}:${esPort}`;
      this.logger.debug(`Endpoint: ${endpoint}`);
      return endpoint;
    } catch {
      this.logger.debug(`Failed to decode cloud.id: ${cloudId}`);
      return undefined;
    }
  }
}
