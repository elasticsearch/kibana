/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { backOff } from 'exponential-backoff';
import type { Observable } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import { filter, take } from 'rxjs';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type {
  CoreSetup,
  CoreStart,
  ElasticsearchClient,
  ElasticsearchServiceStart,
  HttpServiceSetup,
  KibanaRequest,
  Logger,
  Plugin,
  PluginInitializerContext,
  SavedObjectsClientContract,
  SavedObjectsServiceStart,
  SecurityServiceStart,
  ServiceStatus,
} from '@kbn/core/server';
import { DEFAULT_APP_CATEGORIES, ServiceStatusLevels } from '@kbn/core/server';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import { LockManagerService } from '@kbn/lock-manager';
import type { TelemetryPluginSetup, TelemetryPluginStart } from '@kbn/telemetry-plugin/server';
import type { PluginStart as DataPluginStart } from '@kbn/data-plugin/server';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type {
  EncryptedSavedObjectsPluginSetup,
  EncryptedSavedObjectsPluginStart,
} from '@kbn/encrypted-saved-objects-plugin/server';
import type {
  AuditLogger,
  SecurityPluginSetup,
  SecurityPluginStart,
} from '@kbn/security-plugin/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { FieldsMetadataServerSetup } from '@kbn/fields-metadata-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { AlertingServerStart } from '@kbn/alerting-plugin/server/plugin';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { SavedObjectTaggingStart } from '@kbn/saved-objects-tagging-plugin/server';
import type { ReportingStart } from '@kbn/reporting-plugin/server';

import { SECURITY_EXTENSION_ID, SPACES_EXTENSION_ID } from '@kbn/core-saved-objects-server';

import type { FleetConfigType } from '../common/types';
import type { FleetAuthz } from '../common';
import {
  INTEGRATIONS_PLUGIN_ID,
  MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE,
  UNINSTALL_TOKENS_SAVED_OBJECT_TYPE,
} from '../common';
import type { ExperimentalFeatures } from '../common/experimental_features';
import { parseExperimentalConfigValue } from '../common/experimental_features';
import {
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  AGENT_POLICY_SAVED_OBJECT_TYPE,
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
} from '../common/constants';

import { runWithCache } from './services/epm/packages/cache';

import { getFilesClientFactory } from './services/files/get_files_client_factory';

import type { MessageSigningServiceInterface } from './services/security';
import {
  calculateRouteAuthz,
  getAuthzFromRequest,
  getRouteRequiredAuthz,
  makeRouterWithFleetAuthz,
  MessageSigningService,
} from './services/security';

import { OutputClient, type OutputClientInterface } from './services/output_client';

import {
  ASSETS_SAVED_OBJECT_TYPE,
  DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE,
  FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
  OUTPUT_SAVED_OBJECT_TYPE,
  PACKAGES_SAVED_OBJECT_TYPE,
  PLUGIN_ID,
  PRECONFIGURATION_DELETION_RECORD_SAVED_OBJECT_TYPE,
  FLEET_PROXY_SAVED_OBJECT_TYPE,
  SPACE_SETTINGS_SAVED_OBJECT_TYPE,
  CLOUD_CONNECTOR_SAVED_OBJECT_TYPE,
} from './constants';
import { registerEncryptedSavedObjects, registerSavedObjects } from './saved_objects';
import { registerRoutes } from './routes';

import type { ExternalCallback, FleetRequestHandlerContext } from './types';
import type {
  AgentPolicyServiceInterface,
  AgentService,
  ArtifactsClientInterface,
  PackageService,
  CloudConnectorServiceInterface,
} from './services';
import {
  agentPolicyService,
  AgentServiceImpl,
  appContextService,
  FleetUsageSender,
  licenseService,
  packagePolicyService,
  PackageServiceImpl,
  cloudConnectorService,
} from './services';
import {
  fetchAgentsUsage,
  fetchFleetUsage,
  type FleetUsage,
  registerFleetUsageCollector,
} from './collectors/register';
import { FleetArtifactsClient } from './services/artifacts';
import type { FleetRouter } from './types/request_context';
import { TelemetryEventsSender } from './telemetry/sender';
import { setupFleet } from './services/setup';
import { BulkActionsResolver } from './services/agents';
import type { PackagePolicyService } from './services/package_policy_service';
import { PackagePolicyServiceImpl } from './services/package_policy';
import { registerFleetUsageLogger, startFleetUsageLogger } from './services/fleet_usage_logger';
import { CheckDeletedFilesTask } from './tasks/check_deleted_files_task';
import { UnenrollInactiveAgentsTask } from './tasks/unenroll_inactive_agents_task';
import {
  UninstallTokenService,
  type UninstallTokenServiceInterface,
} from './services/security/uninstall_token_service';
import { FleetActionsClient, type FleetActionsClientInterface } from './services/actions';
import type { FilesClientFactory } from './services/files/types';
import { PolicyWatcher } from './services/agent_policy_watch';
import { getPackageSpecTagId } from './services/epm/kibana/assets/tag_assets';
import { FleetMetricsTask } from './services/metrics/fleet_metrics_task';
import { fetchAgentMetrics } from './services/metrics/fetch_agent_metrics';
import { registerFieldsMetadataExtractors } from './services/register_fields_metadata_extractors';
import { registerUpgradeManagedPackagePoliciesTask } from './services/setup/managed_package_policies';
import { registerDeployAgentPoliciesTask } from './services/agent_policies/deploy_agent_policies_task';
import { DeleteUnenrolledAgentsTask } from './tasks/delete_unenrolled_agents_task';
import { registerBumpMigratedAgentPoliciesTask } from './services/agent_policies/bump_migrated_agent_policies_task';
import { registerBumpAgentPoliciesByIdTask } from './services/agent_policies/bump_agent_policies_by_id_task';
import { UpgradeAgentlessDeploymentsTask } from './tasks/agentless/upgrade_agentless_deployment';
import { SyncIntegrationsTask } from './tasks/sync_integrations/sync_integrations_task';
import { AutomaticAgentUpgradeTask } from './tasks/automatic_agent_upgrade_task';
import { registerPackagesBulkOperationTask } from './tasks/packages_bulk_operations';
import { AutoInstallContentPackagesTask } from './tasks/auto_install_content_packages_task';
import { AgentStatusChangeTask } from './tasks/agent_status_change_task';
import { FleetPolicyRevisionsCleanupTask } from './tasks/fleet_policy_revisions_cleanup/fleet_policy_revisions_cleanup_task';
import { registerSetupTasks } from './tasks/setup';
import {
  registerAgentlessDeploymentSyncTask,
  scheduleAgentlessDeploymentSyncTask,
} from './tasks/agentless/deployment_sync_task';
import {
  registerVerifierPolicyCleanupTask,
  scheduleVerifierPolicyCleanupTask,
} from './tasks/agentless/verifier_policy_cleanup_task';
import {
  registerVerifyPermissionsTask,
  scheduleVerifyPermissionsTask,
} from './tasks/agentless/verify_permissions_task';
import { registerReindexIntegrationKnowledgeTask } from './tasks/reindex_integration_knowledge_task';
import { registerSyncNamespaceTemplatesTask } from './tasks/sync_namespace_templates_task';
import { registerSyncIlmPolicyTask } from './tasks/sync_ilm_policy_task';
import {
  type AgentlessPoliciesService,
  AgentlessPoliciesServiceImpl,
} from './services/agentless/agentless_policies';
import { registerReassignAgentsToVersionSpecificPoliciesTask } from './services/agent_policies/reassign_agents_to_version_specific_policies_task';
import { VersionSpecificPolicyAssignmentTask } from './tasks/version_specific_policy_assignment_task';

export interface FleetSetupDeps {
  security: SecurityPluginSetup;
  features?: FeaturesPluginSetup;
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
  cloud?: CloudSetup;
  usageCollection?: UsageCollectionSetup;
  spaces?: SpacesPluginStart;
  telemetry?: TelemetryPluginSetup;
  taskManager: TaskManagerSetupContract;
  fieldsMetadata: FieldsMetadataServerSetup;
}

export interface FleetStartDeps {
  data: DataPluginStart;
  licensing: LicensingPluginStart;
  encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
  security: SecurityPluginStart;
  telemetry?: TelemetryPluginStart;
  savedObjectsTagging: SavedObjectTaggingStart;
  taskManager: TaskManagerStartContract;
  spaces: SpacesPluginStart;
  alerting: AlertingServerStart;
  reporting: ReportingStart;
}

export interface FleetAppContext {
  elasticsearch: ElasticsearchServiceStart;
  data: DataPluginStart;
  encryptedSavedObjectsStart?: EncryptedSavedObjectsPluginStart;
  encryptedSavedObjectsSetup?: EncryptedSavedObjectsPluginSetup;
  securityCoreStart: SecurityServiceStart;
  securitySetup: SecurityPluginSetup;
  securityStart: SecurityPluginStart;
  config$?: Observable<FleetConfigType>;
  configInitialValue: FleetConfigType;
  experimentalFeatures: ExperimentalFeatures;
  savedObjects: SavedObjectsServiceStart;
  savedObjectsTagging?: SavedObjectTaggingStart;
  isProductionMode: PluginInitializerContext['env']['mode']['prod'];
  kibanaVersion: PluginInitializerContext['env']['packageInfo']['version'];
  kibanaBranch: PluginInitializerContext['env']['packageInfo']['branch'];
  kibanaInstanceId: PluginInitializerContext['env']['instanceUuid'];
  cloud?: CloudSetup;
  logger?: Logger;
  httpSetup?: HttpServiceSetup;
  telemetryEventsSender: TelemetryEventsSender;
  bulkActionsResolver: BulkActionsResolver;
  messageSigningService: MessageSigningServiceInterface;
  auditLogger?: AuditLogger;
  uninstallTokenService: UninstallTokenServiceInterface;
  unenrollInactiveAgentsTask: UnenrollInactiveAgentsTask;
  deleteUnenrolledAgentsTask: DeleteUnenrolledAgentsTask;
  updateAgentlessDeploymentsTask: UpgradeAgentlessDeploymentsTask;
  automaticAgentUpgradeTask: AutomaticAgentUpgradeTask;
  autoInstallContentPackagesTask: AutoInstallContentPackagesTask;
  agentStatusChangeTask?: AgentStatusChangeTask;
  fleetPolicyRevisionsCleanupTask?: FleetPolicyRevisionsCleanupTask;
  taskManagerStart?: TaskManagerStartContract;
  fetchUsage?: (abortController: AbortController) => Promise<FleetUsage | undefined>;
  syncIntegrationsTask: SyncIntegrationsTask;
  lockManagerService?: LockManagerService;
  alertingStart?: AlertingServerStart;
  reportingStart?: ReportingStart;
}

export type FleetSetupContract = void;

const allSavedObjectTypes = [
  OUTPUT_SAVED_OBJECT_TYPE,
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
  AGENT_POLICY_SAVED_OBJECT_TYPE,
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGES_SAVED_OBJECT_TYPE,
  ASSETS_SAVED_OBJECT_TYPE,
  PRECONFIGURATION_DELETION_RECORD_SAVED_OBJECT_TYPE,
  DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE,
  FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
  FLEET_PROXY_SAVED_OBJECT_TYPE,
  SPACE_SETTINGS_SAVED_OBJECT_TYPE,
  CLOUD_CONNECTOR_SAVED_OBJECT_TYPE,
];

/**
 * Describes public Fleet plugin contract returned at the `startup` stage.
 */
export interface FleetStartContract {
  /**
   * returns a promise that resolved when fleet setup has been completed regardless if it was successful or failed).
   * Any consumer of fleet start services should first `await` for this promise to be resolved before using those
   * services
   */
  fleetSetupCompleted: () => Promise<void>;
  agentless: {
    enabled: boolean;
  };
  authz: {
    fromRequest(request: KibanaRequest): Promise<FleetAuthz>;
  };
  packageService: PackageService;
  agentService: AgentService;
  /**
   * Services for Fleet's package policies
   */
  packagePolicyService: typeof packagePolicyService;
  agentlessPoliciesService: AgentlessPoliciesService;
  runWithCache: typeof runWithCache;
  agentPolicyService: AgentPolicyServiceInterface;
  cloudConnectorService: CloudConnectorServiceInterface;
  /**
   * Register callbacks for inclusion in fleet API processing
   * @param args
   */
  registerExternalCallback: (...args: ExternalCallback) => void;

  /**
   * Create a Fleet Artifact Client instance
   * @param packageName
   */
  createArtifactsClient: (packageName: string) => ArtifactsClientInterface;

  /**
   * Create a Fleet Files client instance
   * @param packageName
   * @param type
   * @param maxSizeBytes
   */
  createFilesClient: Readonly<FilesClientFactory>;

  messageSigningService: MessageSigningServiceInterface;
  uninstallTokenService: UninstallTokenServiceInterface;
  createFleetActionsClient: (packageName: string) => FleetActionsClientInterface;
  /*
  Function exported to allow creating unique ids for saved object tags
   */
  getPackageSpecTagId: (spaceId: string, pkgName: string, tagName: string) => string;

  /**
   * Create a Fleet Output Client instance
   * @param packageName
   */
  createOutputClient: (request: KibanaRequest) => Promise<OutputClientInterface>;
}

export class FleetPlugin
  implements Plugin<FleetSetupContract, FleetStartContract, FleetSetupDeps, FleetStartDeps>
{
  private config$: Observable<FleetConfigType>;
  private configInitialValue: FleetConfigType;
  private cloud?: CloudSetup;
  private logger?: Logger;

  private isProductionMode: FleetAppContext['isProductionMode'];
  private kibanaVersion: FleetAppContext['kibanaVersion'];
  private kibanaBranch: FleetAppContext['kibanaBranch'];
  private kibanaInstanceId: FleetAppContext['kibanaInstanceId'];
  private httpSetup?: HttpServiceSetup;
  private securitySetup!: SecurityPluginSetup;
  private spacesPluginsStart?: SpacesPluginStart;
  private encryptedSavedObjectsSetup?: EncryptedSavedObjectsPluginSetup;
  private readonly telemetryEventsSender: TelemetryEventsSender;
  private readonly fleetStatus$: BehaviorSubject<ServiceStatus>;
  private bulkActionsResolver?: BulkActionsResolver;
  private fleetUsageSender?: FleetUsageSender;
  private checkDeletedFilesTask?: CheckDeletedFilesTask;
  private fleetMetricsTask?: FleetMetricsTask;
  private unenrollInactiveAgentsTask?: UnenrollInactiveAgentsTask;
  private deleteUnenrolledAgentsTask?: DeleteUnenrolledAgentsTask;
  private updateAgentlessDeploymentsTask?: UpgradeAgentlessDeploymentsTask;
  private syncIntegrationsTask?: SyncIntegrationsTask;
  private automaticAgentUpgradeTask?: AutomaticAgentUpgradeTask;
  private autoInstallContentPackagesTask?: AutoInstallContentPackagesTask;
  private agentStatusChangeTask?: AgentStatusChangeTask;
  private fleetPolicyRevisionsCleanupTask?: FleetPolicyRevisionsCleanupTask;
  private versionSpecificPolicyAssignmentTask?: VersionSpecificPolicyAssignmentTask;

  private agentService?: AgentService;
  private packageService?: PackageService;
  private packagePolicyService?: PackagePolicyService;
  private policyWatcher?: PolicyWatcher;
  private fetchUsage?: (abortController: AbortController) => Promise<FleetUsage | undefined>;
  private lockManagerService?: LockManagerService;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.config$ = this.initializerContext.config.create<FleetConfigType>();
    this.isProductionMode = this.initializerContext.env.mode.prod;
    this.kibanaVersion = this.initializerContext.env.packageInfo.version;
    this.kibanaBranch = this.initializerContext.env.packageInfo.branch;
    this.kibanaInstanceId = this.initializerContext.env.instanceUuid;
    this.logger = this.initializerContext.logger.get();
    this.configInitialValue = this.initializerContext.config.get();
    this.telemetryEventsSender = new TelemetryEventsSender(this.logger.get('telemetry_events'));

    this.fleetStatus$ = new BehaviorSubject<ServiceStatus>({
      level: ServiceStatusLevels.unavailable,
      summary: 'Fleet is unavailable',
    });
  }

  public setup(core: CoreSetup<FleetStartDeps, FleetStartContract>, deps: FleetSetupDeps) {
    this.httpSetup = core.http;
    this.encryptedSavedObjectsSetup = deps.encryptedSavedObjects;
    this.cloud = deps.cloud;
    this.securitySetup = deps.security;
    const config = this.configInitialValue;

    core.status.set(this.fleetStatus$.asObservable());

    const experimentalFeatures = parseExperimentalConfigValue(
      config.enableExperimental ?? [],
      config.experimentalFeatures || {}
    );
    const requireAllSpaces = experimentalFeatures.useSpaceAwareness ? false : true;

    registerSavedObjects(core.savedObjects, {
      useSpaceAwareness: experimentalFeatures.useSpaceAwareness,
    });
    registerEncryptedSavedObjects(deps.encryptedSavedObjects);

    // Register feature
    if (deps.features) {
      deps.features.registerKibanaFeature({
        id: `fleetv2`,
        name: 'Fleet',
        category: DEFAULT_APP_CATEGORIES.management,
        app: [PLUGIN_ID],
        catalogue: ['fleet'],
        reserved: {
          description:
            'Privilege to setup Fleet packages and configured policies. Intended for use by the elastic/fleet-server service account only.',
          privileges: [
            {
              id: 'fleet-setup',
              privilege: {
                excludeFromBasePrivileges: true,
                api: ['fleet-setup'],
                savedObject: {
                  all: [],
                  read: [],
                },
                ui: [],
              },
            },
          ],
        },
        subFeatures: [
          {
            name: 'Agents',
            requireAllSpaces,
            privilegeGroups: [
              {
                groupType: 'mutually_exclusive',
                privileges: [
                  {
                    id: `agents_all`,
                    api: [`${PLUGIN_ID}-agents-read`, `${PLUGIN_ID}-agents-all`],
                    name: 'All',
                    ui: ['agents_read', 'agents_all'],
                    savedObject: {
                      all: allSavedObjectTypes,
                      read: allSavedObjectTypes,
                    },
                    includeIn: 'all',
                  },
                  {
                    id: `agents_read`,
                    api: [`${PLUGIN_ID}-agents-read`],
                    name: 'Read',
                    ui: ['agents_read'],
                    savedObject: {
                      all: [],
                      read: allSavedObjectTypes,
                    },
                    includeIn: 'read',
                    alerting: {},
                  },
                ],
              },
            ],
          },
          {
            name: 'Agent policies',
            requireAllSpaces,
            privilegeGroups: [
              {
                groupType: 'mutually_exclusive',
                privileges: [
                  {
                    id: `agent_policies_all`,
                    api: [`${PLUGIN_ID}-agent-policies-read`, `${PLUGIN_ID}-agent-policies-all`],
                    name: 'All',
                    ui: ['agent_policies_read', 'agent_policies_all'],
                    savedObject: {
                      all: allSavedObjectTypes,
                      read: allSavedObjectTypes,
                    },
                    includeIn: 'all',
                  },
                  {
                    id: `agent_policies_read`,
                    api: [`${PLUGIN_ID}-agent-policies-read`],
                    name: 'Read',
                    ui: ['agent_policies_read'],
                    savedObject: {
                      all: [],
                      read: allSavedObjectTypes,
                    },
                    includeIn: 'read',
                    alerting: {},
                  },
                ],
              },
            ],
          },
          {
            name: 'Settings',
            requireAllSpaces,
            privilegeGroups: [
              {
                groupType: 'mutually_exclusive',
                privileges: [
                  {
                    id: `settings_all`,
                    api: [`${PLUGIN_ID}-settings-read`, `${PLUGIN_ID}-settings-all`],
                    name: 'All',
                    ui: ['settings_read', 'settings_all'],
                    savedObject: {
                      all: allSavedObjectTypes,
                      read: allSavedObjectTypes,
                    },
                    includeIn: 'all',
                  },
                  {
                    id: `settings_read`,
                    api: [`${PLUGIN_ID}-settings-read`],
                    name: 'Read',
                    ui: ['settings_read'],
                    savedObject: {
                      all: [],
                      read: allSavedObjectTypes,
                    },
                    includeIn: 'read',
                    alerting: {},
                  },
                ],
              },
            ],
          },
          {
            name: 'Generate reports',
            requireAllSpaces,
            privilegeGroups: [
              {
                groupType: 'mutually_exclusive',
                privileges: [
                  {
                    id: `generate_report`,
                    api: [`${PLUGIN_ID}-generate-report`],
                    name: 'All',
                    ui: ['generate_report'],
                    savedObject: {
                      all: allSavedObjectTypes,
                      read: allSavedObjectTypes,
                    },
                    includeIn: 'all',
                  },
                ],
              },
            ],
          },
        ],
        privileges: {
          all: {
            api: [`${PLUGIN_ID}-read`, `${PLUGIN_ID}-all`],
            app: [PLUGIN_ID],
            requireAllSpaces,
            catalogue: ['fleet'],
            savedObject: {
              all: allSavedObjectTypes,
              read: [],
            },
            ui: ['read', 'all'],
          },
          read: {
            api: [`${PLUGIN_ID}-read`],
            app: [PLUGIN_ID],
            catalogue: ['fleet'],
            requireAllSpaces,
            savedObject: {
              all: [],
              read: allSavedObjectTypes,
            },
            ui: ['read'],
          },
        },
      });

      deps.features.registerKibanaFeature({
        id: 'fleet', // for BWC
        name: 'Integrations',
        category: DEFAULT_APP_CATEGORIES.management,
        app: [INTEGRATIONS_PLUGIN_ID],
        catalogue: ['fleet'],
        privileges: {
          all: {
            api: [`${INTEGRATIONS_PLUGIN_ID}-read`, `${INTEGRATIONS_PLUGIN_ID}-all`],
            app: [INTEGRATIONS_PLUGIN_ID],
            catalogue: ['fleet'],
            savedObject: {
              all: allSavedObjectTypes,
              read: [],
            },
            ui: ['read', 'all'],
          },
          read: {
            api: [`${INTEGRATIONS_PLUGIN_ID}-read`],
            app: [INTEGRATIONS_PLUGIN_ID],
            catalogue: ['fleet'],
            savedObject: {
              all: [],
              read: allSavedObjectTypes,
            },
            ui: ['read'],
          },
        },
        subFeatures: [],
      });
    }

    core.http.registerRouteHandlerContext<FleetRequestHandlerContext, typeof PLUGIN_ID>(
      PLUGIN_ID,
      async (context, request) => {
        const plugin = this;
        const coreContext = await context.core;
        const authz = await getAuthzFromRequest(request);
        const esClient = coreContext.elasticsearch.client;
        const soClient = coreContext.savedObjects.getClient();
        const routeRequiredAuthz = getRouteRequiredAuthz(request.route.method, request.route.path);
        const routeAuthz = routeRequiredAuthz
          ? calculateRouteAuthz(authz, routeRequiredAuthz)
          : undefined;

        const getInternalSoClient = (): SavedObjectsClientContract =>
          appContextService
            .getSavedObjects()
            .getScopedClient(request, { excludedExtensions: [SECURITY_EXTENSION_ID] });

        const spacesPluginsStart = this.spacesPluginsStart;
        return {
          get agentClient() {
            const agentService = plugin.setupAgentService(esClient.asInternalUser, soClient);

            return {
              asCurrentUser: agentService.asScoped(request),
              asInternalUser: agentService.asInternalUser,
            };
          },
          get uninstallTokenService() {
            const uninstallTokenService = new UninstallTokenService(
              appContextService.getEncryptedSavedObjectsStart()!.getClient({
                includedHiddenTypes: [UNINSTALL_TOKENS_SAVED_OBJECT_TYPE],
              }),
              appContextService.getInternalUserSOClientForSpaceId(soClient.getCurrentNamespace())
            );

            return {
              asCurrentUser: uninstallTokenService,
            };
          },
          get packagePolicyService() {
            const service = plugin.setupPackagePolicyService();

            return {
              asCurrentUser: service.asScoped(request),
              asInternalUser: service.asInternalUser,
            };
          },
          authz,
          get internalSoClient() {
            // Use a lazy getter to avoid constructing this client when not used by a request handler
            return getInternalSoClient();
          },
          get spaceId() {
            return deps.spaces?.spacesService?.getSpaceId(request) ?? DEFAULT_SPACE_ID;
          },
          getAllSpaces() {
            return spacesPluginsStart!.spacesService.createSpacesClient(request).getAll();
          },
          get limitedToPackages() {
            if (routeAuthz && routeAuthz.granted) {
              return routeAuthz.scopeDataToPackages;
            }
          },
        };
      }
    );

    // Register usage collection
    registerFleetUsageCollector(core, config, deps.usageCollection);
    this.fetchUsage = async (abortController: AbortController) =>
      await fetchFleetUsage(core, config, abortController);
    this.fleetUsageSender = new FleetUsageSender(deps.taskManager, core, this.fetchUsage);
    registerFleetUsageLogger(deps.taskManager, async () => fetchAgentsUsage(core, config));

    const fetchAgents = async (abortController: AbortController) =>
      await fetchAgentMetrics(core, abortController);
    this.fleetMetricsTask = new FleetMetricsTask(deps.taskManager, fetchAgents);

    const router: FleetRouter = core.http.createRouter<FleetRequestHandlerContext>();
    // Allow read-only users access to endpoints necessary for Integrations UI
    // Only some endpoints require superuser so we pass a raw IRouter here

    // For all the routes we enforce the user to have role superuser
    const fleetAuthzRouter = makeRouterWithFleetAuthz(
      router,
      this.initializerContext.logger.get('fleet_authz_router')
    );

    const isServerless = this.initializerContext.env.packageInfo.buildFlavor === 'serverless';
    registerRoutes(fleetAuthzRouter, config, isServerless);

    this.telemetryEventsSender.setup(deps.telemetry);
    // Register tasks
    registerUpgradeManagedPackagePoliciesTask(deps.taskManager);
    registerDeployAgentPoliciesTask(deps.taskManager);
    registerBumpMigratedAgentPoliciesTask(deps.taskManager);
    registerBumpAgentPoliciesByIdTask(deps.taskManager);
    registerPackagesBulkOperationTask(deps.taskManager);
    registerSetupTasks(deps.taskManager);
    registerAgentlessDeploymentSyncTask(deps.taskManager, this.configInitialValue);
    registerVerifyPermissionsTask(deps.taskManager);
    registerVerifierPolicyCleanupTask(deps.taskManager);
    registerReindexIntegrationKnowledgeTask(deps.taskManager);
    registerSyncNamespaceTemplatesTask(deps.taskManager);
    registerSyncIlmPolicyTask(deps.taskManager);
    registerReassignAgentsToVersionSpecificPoliciesTask(deps.taskManager);

    this.bulkActionsResolver = new BulkActionsResolver(deps.taskManager, core);
    this.checkDeletedFilesTask = new CheckDeletedFilesTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
    });
    this.unenrollInactiveAgentsTask = new UnenrollInactiveAgentsTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
      config: {
        taskInterval: config.unenrollInactiveAgents?.taskInterval,
        gracePeriodMs: config.unenrollInactiveAgents?.gracePeriodMs,
      },
    });
    this.deleteUnenrolledAgentsTask = new DeleteUnenrolledAgentsTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
    });
    this.updateAgentlessDeploymentsTask = new UpgradeAgentlessDeploymentsTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
    });
    this.syncIntegrationsTask = new SyncIntegrationsTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
      config: {
        taskInterval: config.syncIntegrations?.taskInterval,
      },
    });
    this.automaticAgentUpgradeTask = new AutomaticAgentUpgradeTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
      config: {
        taskInterval: config.autoUpgrades?.taskInterval,
        retryDelays: config.autoUpgrades?.retryDelays,
      },
    });
    this.autoInstallContentPackagesTask = new AutoInstallContentPackagesTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
      config: {
        taskInterval: config.autoInstallContentPackages?.taskInterval,
      },
    });
    this.agentStatusChangeTask = new AgentStatusChangeTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
      config: {
        taskInterval: config.agentStatusChange?.taskInterval,
      },
    });
    this.fleetPolicyRevisionsCleanupTask = new FleetPolicyRevisionsCleanupTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
      config: {
        maxRevisions: config.fleetPolicyRevisionsCleanup?.maxRevisions,
        interval: config.fleetPolicyRevisionsCleanup?.interval,
        maxPoliciesPerRun: config.fleetPolicyRevisionsCleanup?.maxPoliciesPerRun,
      },
    });
    this.versionSpecificPolicyAssignmentTask = new VersionSpecificPolicyAssignmentTask({
      core,
      taskManager: deps.taskManager,
      logFactory: this.initializerContext.logger,
      config: {
        taskInterval: config.versionSpecificPolicyAssignment?.taskInterval,
      },
    });
    this.lockManagerService = new LockManagerService(core, this.initializerContext.logger.get());

    // Register fields metadata extractors
    registerFieldsMetadataExtractors({ core, fieldsMetadata: deps.fieldsMetadata });
  }

  public start(core: CoreStart, plugins: FleetStartDeps): FleetStartContract {
    this.spacesPluginsStart = plugins.spaces;

    const messageSigningService = new MessageSigningService(
      this.initializerContext.logger,
      plugins.encryptedSavedObjects.getClient({
        includedHiddenTypes: [MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE],
      })
    );

    const uninstallTokenService = new UninstallTokenService(
      plugins.encryptedSavedObjects.getClient({
        includedHiddenTypes: [UNINSTALL_TOKENS_SAVED_OBJECT_TYPE],
      })
    );

    appContextService.start({
      elasticsearch: core.elasticsearch,
      data: plugins.data,
      encryptedSavedObjectsStart: plugins.encryptedSavedObjects,
      encryptedSavedObjectsSetup: this.encryptedSavedObjectsSetup,
      securityCoreStart: core.security,
      securitySetup: this.securitySetup,
      securityStart: plugins.security,
      configInitialValue: this.configInitialValue,
      config$: this.config$,
      experimentalFeatures: parseExperimentalConfigValue(
        this.configInitialValue.enableExperimental || [],
        this.configInitialValue.experimentalFeatures || {}
      ),
      savedObjects: core.savedObjects,
      savedObjectsTagging: plugins.savedObjectsTagging,
      isProductionMode: this.isProductionMode,
      kibanaVersion: this.kibanaVersion,
      kibanaBranch: this.kibanaBranch,
      kibanaInstanceId: this.kibanaInstanceId,
      httpSetup: this.httpSetup,
      cloud: this.cloud,
      logger: this.logger,
      telemetryEventsSender: this.telemetryEventsSender,
      bulkActionsResolver: this.bulkActionsResolver!,
      messageSigningService,
      uninstallTokenService,
      unenrollInactiveAgentsTask: this.unenrollInactiveAgentsTask!,
      deleteUnenrolledAgentsTask: this.deleteUnenrolledAgentsTask!,
      updateAgentlessDeploymentsTask: this.updateAgentlessDeploymentsTask!,
      automaticAgentUpgradeTask: this.automaticAgentUpgradeTask!,
      taskManagerStart: plugins.taskManager,
      fetchUsage: this.fetchUsage,
      syncIntegrationsTask: this.syncIntegrationsTask!,
      lockManagerService: this.lockManagerService,
      autoInstallContentPackagesTask: this.autoInstallContentPackagesTask!,
      agentStatusChangeTask: this.agentStatusChangeTask,
      fleetPolicyRevisionsCleanupTask: this.fleetPolicyRevisionsCleanupTask,
      alertingStart: plugins.alerting,
      reportingStart: plugins.reporting,
    });
    licenseService.start(plugins.licensing.license$);
    this.telemetryEventsSender.start(plugins.telemetry, core).catch(() => {});
    this.bulkActionsResolver?.start(plugins.taskManager).catch(() => {});
    this.fleetUsageSender?.start(plugins.taskManager).catch(() => {});
    this.checkDeletedFilesTask?.start({ taskManager: plugins.taskManager }).catch(() => {});
    this.unenrollInactiveAgentsTask?.start({ taskManager: plugins.taskManager }).catch(() => {});
    this.deleteUnenrolledAgentsTask?.start({ taskManager: plugins.taskManager }).catch(() => {});
    this.updateAgentlessDeploymentsTask
      ?.start({ taskManager: plugins.taskManager })
      .catch(() => {});
    this.automaticAgentUpgradeTask?.start({ taskManager: plugins.taskManager }).catch(() => {});

    startFleetUsageLogger(plugins.taskManager).catch(() => {});
    this.fleetMetricsTask
      ?.start(plugins.taskManager, core.elasticsearch.client.asInternalUser)
      .catch(() => {});
    this.syncIntegrationsTask?.start({ taskManager: plugins.taskManager }).catch(() => {});
    this.autoInstallContentPackagesTask
      ?.start({ taskManager: plugins.taskManager })
      .catch(() => {});
    this.agentStatusChangeTask?.start({ taskManager: plugins.taskManager }).catch(() => {});
    scheduleAgentlessDeploymentSyncTask(
      plugins.taskManager,
      this.configInitialValue as FleetConfigType
    ).catch(() => {});
    scheduleVerifyPermissionsTask(plugins.taskManager).catch(() => {});
    scheduleVerifierPolicyCleanupTask(plugins.taskManager).catch((error) => {});
    this.fleetPolicyRevisionsCleanupTask
      ?.start({ taskManager: plugins.taskManager })
      .catch(() => {});
    this.versionSpecificPolicyAssignmentTask
      ?.start({ taskManager: plugins.taskManager })
      .catch(() => {});

    const logger = appContextService.getLogger();

    this.policyWatcher = new PolicyWatcher(logger);

    this.policyWatcher.start(licenseService);

    const setupAttempts = this.configInitialValue.internal?.retrySetupOnBoot ? 25 : 1;

    const fleetSetupPromise = (async () => {
      try {
        // Fleet remains `available` during setup as to excessively delay Kibana's boot process.
        // This should be reevaluated as Fleet's setup process is optimized and stabilized.
        this.fleetStatus$.next({
          level: ServiceStatusLevels.available,
          summary: 'Fleet is setting up',
        });

        // We need to wait for the licence feature to be available,
        // to have our internal saved object client with encrypted saved object working properly
        await plugins.licensing.license$
          .pipe(
            filter(
              (licence) =>
                licence.getFeature('security').isEnabled &&
                licence.getFeature('security').isAvailable
            ),
            take(1)
          )
          .toPromise();

        const randomIntFromInterval = (min: number, max: number) => {
          return Math.floor(Math.random() * (max - min + 1) + min);
        };

        // Retry Fleet setup w/ backoff
        await backOff(
          async () => {
            await setupFleet(
              core.savedObjects.getUnsafeInternalClient({
                excludedExtensions: [SPACES_EXTENSION_ID],
              }),
              core.elasticsearch.client.asInternalUser,
              { useLock: true }
            );
          },
          {
            numOfAttempts: setupAttempts,
            delayFirstAttempt: true,
            // 1s initial backoff
            startingDelay: randomIntFromInterval(100, 1000),
            // 5m max backoff
            maxDelay: 60000 * 5,
            timeMultiple: 2,
            // avoid HA contention with other Kibana instances
            jitter: 'full',
            retry: (error: any, attemptCount: number) => {
              const summary = `Fleet setup attempt ${attemptCount} failed, will retry after backoff`;
              logger.warn(summary, { error });

              this.fleetStatus$.next({
                level: ServiceStatusLevels.available,
                summary,
                meta: {
                  attemptCount,
                  error,
                },
              });
              return true;
            },
          }
        );

        // initialize (generate/encrypt/validate) Uninstall Tokens asynchronously
        this.initializeUninstallTokens().catch(() => {});

        this.fleetStatus$.next({
          level: ServiceStatusLevels.available,
          summary: 'Fleet is available',
        });
      } catch (error) {
        logger.warn(`Fleet setup failed after ${setupAttempts} attempts`, {
          error,
        });

        this.fleetStatus$.next({
          // As long as Fleet has a dependency on EPR, we can't reliably set Kibana status to `unavailable` here.
          // See https://github.com/elastic/kibana/issues/120237
          level: ServiceStatusLevels.available,
          summary: 'Fleet setup failed',
          meta: {
            error: error.message,
          },
        });
      }
    })();

    const internalSoClient = core.savedObjects.getUnsafeInternalClient({
      excludedExtensions: [SPACES_EXTENSION_ID],
    });
    return {
      authz: {
        fromRequest: getAuthzFromRequest,
      },
      agentless: {
        enabled: this.configInitialValue.agentless?.enabled ?? false,
      },
      fleetSetupCompleted: () => fleetSetupPromise,
      packageService: this.setupPackageService(
        core.elasticsearch.client.asInternalUser,
        internalSoClient
      ),
      agentService: this.setupAgentService(
        core.elasticsearch.client.asInternalUser,
        internalSoClient
      ),
      agentPolicyService,
      packagePolicyService,
      agentlessPoliciesService: new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        internalSoClient,
        core.elasticsearch.client.asInternalUser,
        logger
      ),
      registerExternalCallback: (type: ExternalCallback[0], callback: ExternalCallback[1]) => {
        return appContextService.addExternalCallback(type, callback);
      },
      createArtifactsClient(packageName: string) {
        return new FleetArtifactsClient(core.elasticsearch.client.asInternalUser, packageName);
      },
      createFilesClient: Object.freeze(
        getFilesClientFactory({
          esClient: core.elasticsearch.client.asInternalUser,
          logger: this.initializerContext.logger,
        })
      ),
      messageSigningService,
      uninstallTokenService,
      createFleetActionsClient(packageName: string) {
        return new FleetActionsClient(core.elasticsearch.client.asInternalUser, packageName);
      },
      getPackageSpecTagId,
      async createOutputClient(request: KibanaRequest) {
        const authz = await getAuthzFromRequest(request);
        return new OutputClient(authz);
      },
      cloudConnectorService,
      runWithCache,
    };
  }

  public stop() {
    appContextService.stop();
    this.policyWatcher?.stop();
    licenseService.stop();
    this.telemetryEventsSender.stop();
    this.fleetStatus$.complete();
  }

  private setupAgentService(
    internalEsClient: ElasticsearchClient,
    internalSoClient: SavedObjectsClientContract
  ): AgentService {
    if (this.agentService) {
      return this.agentService;
    }

    this.agentService = new AgentServiceImpl(internalEsClient, internalSoClient);
    return this.agentService;
  }

  private setupPackagePolicyService(): PackagePolicyService {
    if (this.packagePolicyService) {
      return this.packagePolicyService;
    }
    this.packagePolicyService = new PackagePolicyServiceImpl();
    return this.packagePolicyService;
  }

  private setupPackageService(
    internalEsClient: ElasticsearchClient,
    internalSoClient: SavedObjectsClientContract
  ): PackageService {
    if (this.packageService) {
      return this.packageService;
    }

    this.packageService = new PackageServiceImpl(
      internalEsClient,
      internalSoClient,
      this.getLogger()
    );
    return this.packageService!;
  }

  private getLogger(): Logger {
    if (!this.logger) {
      this.logger = this.initializerContext.logger.get();
    }

    return this.logger;
  }

  private async initializeUninstallTokens() {
    try {
      await this.generateUninstallTokens();
    } catch (error) {
      appContextService
        .getLogger()
        .error('Error happened during uninstall token generation.', { error });
    }

    try {
      await this.validateUninstallTokens();
    } catch (error) {
      appContextService
        .getLogger()
        .error('Error happened during uninstall token validation.', { error });
    }
  }

  private async generateUninstallTokens() {
    const logger = appContextService.getLogger();

    logger.debug('Generating Agent uninstall tokens');
    if (!appContextService.getEncryptedSavedObjectsSetup()?.canEncrypt) {
      logger.warn(
        'xpack.encryptedSavedObjects.encryptionKey is not configured, agent uninstall tokens are being stored in plain text'
      );
    }
    await appContextService.getUninstallTokenService()?.generateTokensForAllPolicies();

    if (appContextService.getEncryptedSavedObjectsSetup()?.canEncrypt) {
      logger.debug('Checking for and encrypting plain text uninstall tokens');
      await appContextService.getUninstallTokenService()?.encryptTokens();
    }
  }

  private async validateUninstallTokens() {
    const logger = appContextService.getLogger();
    logger.debug('Validating uninstall tokens');

    const unintallTokenValidationError = await appContextService
      .getUninstallTokenService()
      ?.checkTokenValidityForAllPolicies();

    if (unintallTokenValidationError) {
      logger.warn(unintallTokenValidationError.error.message);
    } else {
      logger.debug('Uninstall tokens validation successful.');
    }
  }
}
