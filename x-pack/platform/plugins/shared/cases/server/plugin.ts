/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type IContextProvider,
  type KibanaRequest,
  type Logger,
  type PluginInitializerContext,
  type CoreSetup,
  type CoreStart,
  type Plugin,
  SavedObjectsClient,
} from '@kbn/core/server';

import type { SecurityPluginSetup } from '@kbn/security-plugin/server';
import type { LensServerPluginSetup } from '@kbn/lens-plugin/server';

import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { IUsageCounter } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counter';
import {
  APP_ID,
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  CASE_FIELD_DEFINITION_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  CASE_TEMPLATE_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
  registerOwnerPrefix,
} from '../common/constants';

import type { CasesClient } from './client';
import type {
  CasesRequestHandlerContext,
  CasesServerSetup,
  CasesServerSetupDependencies,
  CasesServerStart,
  CasesServerStartDependencies,
  CloseReasonValidator,
} from './types';
import { CasesClientFactory } from './client/factory';
import type { CasesClientSource } from './client/types';
import { getCasesKibanaFeatures } from './features';
import { registerRoutes } from './routes/api/register_routes';
import { getExternalRoutes } from './routes/api/get_external_routes';
import { createCasesTelemetry, scheduleCasesTelemetryTask } from './telemetry';
import { getInternalRoutes } from './routes/api/get_internal_routes';
import { UnifiedAttachmentTypeRegistry } from './attachment_framework/unified_attachment_registry';
import { UserProfileService } from './services';
import {
  LICENSING_CASE_ASSIGNMENT_FEATURE,
  LICENSING_CASE_OBSERVABLES_FEATURE,
} from './common/constants';
import { registerInternalAttachments } from './internal_attachments';
import { registerCaseFileKinds } from './files';
import type { ConfigType } from './config';
import { registerConnectorTypes } from './connectors';
import { registerSavedObjects } from './saved_object_types';
import type { ServerlessProjectType } from '../common/constants/types';

import { IncrementalIdTaskManager } from './tasks/incremental_id/incremental_id_task_manager';
import { TemplatesMigrationTaskManager } from './tasks/templates_migration/templates_migration_task_manager';
import { createCasesAnalyticsIndexes, registerCasesAnalyticsIndexesTasks } from './cases_analytics';
import { scheduleCAISchedulerTask } from './cases_analytics/tasks/scheduler_task';
import {
  CasesAnalyticsV2Service,
  V2_NOOP_ACTIVITY_WRITER,
  V2_NOOP_ATTACHMENTS_WRITER,
  V2_NOOP_DATA_VIEW_REFRESHER,
  V2_NOOP_WRITER,
} from './cases_analytics_v2';
import { CasesEventBus } from './events/event_bus';
import { registerCaseWorkflowSteps } from './workflows';
import { registerCasesAgentBuilderTools } from './agent_builder';
import { registerCaseWorkflowTriggers } from './workflows/triggers';
import { registerCasesWorkflowEventBridge } from './workflows/triggers/event_bridge';
import { CasesWorkflowRunService } from './workflows/execution/service';
import { initUiSettings } from './ui_settings';

export class CasePlugin
  implements
    Plugin<
      CasesServerSetup,
      CasesServerStart,
      CasesServerSetupDependencies,
      CasesServerStartDependencies
    >
{
  private readonly caseConfig: ConfigType;
  private readonly logger: Logger;
  private readonly kibanaVersion: PluginInitializerContext['env']['packageInfo']['version'];
  private clientFactory: CasesClientFactory;
  private securityPluginSetup?: SecurityPluginSetup;
  private lensEmbeddableFactory?: LensServerPluginSetup['lensEmbeddableFactory'];
  private unifiedAttachmentTypeRegistry: UnifiedAttachmentTypeRegistry;
  private userProfileService: UserProfileService;
  private incrementalIdTaskManager?: IncrementalIdTaskManager;
  private templatesMigrationTaskManager?: TemplatesMigrationTaskManager;
  private usageCounter?: IUsageCounter;
  private readonly isServerless: boolean;
  private casesEventBus?: CasesEventBus;
  private readonly closeReasonValidators: Map<string, CloseReasonValidator> = new Map();
  private casesAnalyticsV2Service?: CasesAnalyticsV2Service;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.caseConfig = initializerContext.config.get<ConfigType>();
    this.kibanaVersion = initializerContext.env.packageInfo.version;
    this.logger = this.initializerContext.logger.get();
    this.clientFactory = new CasesClientFactory(this.logger);
    this.unifiedAttachmentTypeRegistry = new UnifiedAttachmentTypeRegistry();
    this.userProfileService = new UserProfileService(this.logger);
    this.isServerless = initializerContext.env.packageInfo.buildFlavor === 'serverless';
  }

  public setup(
    core: CoreSetup<CasesServerStartDependencies>,
    plugins: CasesServerSetupDependencies
  ): CasesServerSetup {
    this.logger.debug(
      `Setting up Case Workflow with core contract [${Object.keys(
        core
      )}] and plugins [${Object.keys(plugins)}]`
    );

    initUiSettings(core.uiSettings);

    registerInternalAttachments(this.unifiedAttachmentTypeRegistry);

    registerCaseFileKinds(this.caseConfig.files, plugins.files, core.security.fips.isEnabled());
    registerCasesAnalyticsIndexesTasks({
      taskManager: plugins.taskManager,
      logger: this.logger,
      core,
      analyticsConfig: this.caseConfig.analytics,
    });

    // Cases-as-data v2 — independent of v1, gated by its own feature flag;
    // a no-op until `xpack.cases.analyticsV2.enabled` is true. setup()
    // registers the Task Manager task types (must precede start()); start()
    // bootstraps indices, the writer, and the reconciliation task.
    this.casesAnalyticsV2Service = new CasesAnalyticsV2Service({
      logger: this.logger,
      enabled: this.caseConfig.analyticsV2.enabled,
      reconciliationIntervalMinutes: this.caseConfig.analyticsV2.reconciliationIntervalMinutes,
      // Gates the state-mutating admin routes (`/reset`,
      // `/reconcile/run_soon`); default false. See the config schema for the
      // namespace and opt-in rationale.
      enableAdminRoutes: this.caseConfig.analyticsV2.enableAdminRoutes,
      // Reset-task tunables (task `timeout` + reset-path inter-page sleep).
      // Safe defaults; raised on large tenants to keep the post-`/reset`
      // backfill within budget. See the config schema.
      resetTaskTimeoutMinutes: this.caseConfig.analyticsV2.resetTaskTimeoutMinutes,
      resetPageDelayMs: this.caseConfig.analyticsV2.resetPageDelayMs,
    });
    this.casesAnalyticsV2Service.setup({ core, taskManager: plugins.taskManager });

    this.securityPluginSetup = plugins.security;
    this.lensEmbeddableFactory = plugins.lens.lensEmbeddableFactory;

    if (this.caseConfig.stack.enabled) {
      // V1 is deprecated, but has to be maintained for the time being
      // https://github.com/elastic/kibana/pull/186800#issue-2369812818
      const casesFeatures = getCasesKibanaFeatures();
      plugins.features.registerKibanaFeature(casesFeatures.v1);
      plugins.features.registerKibanaFeature(casesFeatures.v2);
      plugins.features.registerKibanaFeature(casesFeatures.v3);
    }

    this.casesEventBus = new CasesEventBus();

    registerSavedObjects({
      core,
      logger: this.logger,
      lensEmbeddableFactory: this.lensEmbeddableFactory,
      config: this.caseConfig,
    });

    core.http.registerRouteHandlerContext<CasesRequestHandlerContext, 'cases'>(
      APP_ID,
      this.createRouteHandlerContext({
        core,
        spaces: plugins.spaces,
      })
    );

    if (plugins.taskManager) {
      if (plugins.usageCollection) {
        createCasesTelemetry({
          core,
          taskManager: plugins.taskManager,
          usageCollection: plugins.usageCollection,
          logger: this.logger,
          kibanaVersion: this.kibanaVersion,
          templatesConfig: this.caseConfig.templates,
        });
      }

      if (this.caseConfig.incrementalId.enabled) {
        this.incrementalIdTaskManager = new IncrementalIdTaskManager(
          plugins.taskManager,
          this.caseConfig.incrementalId,
          this.logger,
          plugins.usageCollection
        );
      }

      if (this.caseConfig.templates.enabled) {
        this.templatesMigrationTaskManager = new TemplatesMigrationTaskManager(
          plugins.taskManager,
          this.logger,
          plugins.usageCollection,
          // When the existing-case `extended_fields` backfill finishes, ask cases-analytics v2 to run
          // a one-time full reconciliation. The backfill bumps only the SO-framework `updated_at`,
          // which analytics-v2's incremental cursor (keyed on `attributes.updated_at`) never sees —
          // so without this nudge the backfilled `extended_fields` would be permanently absent from
          // `.cases`. The callback resolves the service at run time and no-ops when v2 is disabled.
          () => this.casesAnalyticsV2Service?.triggerBackfillReconciliation()
        );
      }
    }

    const router = core.http.createRouter<CasesRequestHandlerContext>();
    this.usageCounter = plugins.usageCollection?.createUsageCounter(APP_ID);
    const getSpaceId = (request?: KibanaRequest) => {
      if (!request) {
        return DEFAULT_SPACE_ID;
      }

      return plugins.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
    };
    const workflowRunService =
      this.caseConfig.runWorkflows.enabled && plugins.workflowsManagement
        ? new CasesWorkflowRunService({
            management: plugins.workflowsManagement.management,
            logger: this.logger,
            audit: plugins.security.audit,
            attachmentTypeRegistry: this.unifiedAttachmentTypeRegistry,
          })
        : undefined;

    // Resolves a request-scoped workflow run context. Defined here and threaded directly into
    // the route so that `getCasesWorkflowRunContext` does not need to live on `CaseRequestContext`
    // (which would expose it to all ~20 plugins that depend on the `cases` context).
    const getWorkflowRunContext = workflowRunService
      ? async (request: KibanaRequest) => {
          const [coreStart] = await core.getStartServices();
          return this.clientFactory.createWorkflowRunContext({
            request,
            scopedClusterClient: coreStart.elasticsearch.client.asScoped(request).asCurrentUser,
            savedObjectsService: coreStart.savedObjects,
            clientSource: 'rest_api',
          });
        }
      : undefined;

    registerRoutes({
      router,
      routes: [
        ...getExternalRoutes({
          isServerless: this.isServerless,
          docLinks: core.docLinks,
          config: this.caseConfig,
        }),
        ...getInternalRoutes(
          this.userProfileService,
          this.caseConfig,
          workflowRunService && getWorkflowRunContext
            ? { service: workflowRunService, getSpaceId, getWorkflowRunContext }
            : undefined
        ),
      ],
      logger: this.logger,
      kibanaVersion: this.kibanaVersion,
      telemetryUsageCounter: this.usageCounter,
    });

    plugins.licensing.featureUsage.register(LICENSING_CASE_ASSIGNMENT_FEATURE, 'platinum');
    plugins.licensing.featureUsage.register(LICENSING_CASE_OBSERVABLES_FEATURE, 'platinum');

    const getCasesClient = (
      clientSource: CasesClientSource
    ): ((request: KibanaRequest) => Promise<CasesClient>) => {
      return async (request: KibanaRequest) => {
        const [coreStart] = await core.getStartServices();
        return this.getCasesClientWithRequest(coreStart, clientSource)(request);
      };
    };

    const getActionsClient = async (request: KibanaRequest) => {
      const [, pluginsStart] = await core.getStartServices();
      return pluginsStart.actions.getActionsClientWithRequest(request);
    };

    const serverlessProjectType = this.isServerless
      ? (plugins.cloud?.serverless.projectType as ServerlessProjectType)
      : undefined;

    registerConnectorTypes({
      actions: plugins.actions,
      alerting: plugins.alerting,
      core,
      logger: this.logger,
      getCasesClient: getCasesClient('connector'),
      getActionsClient,
      getSpaceId,
      serverlessProjectType,
      isCasesAttachmentsEnabled: this.caseConfig.attachments?.enabled === true,
      isTemplatesEnabled: this.caseConfig.templates?.enabled === true,
    });

    registerCaseWorkflowSteps(
      plugins.workflowsExtensions,
      getCasesClient('workflow'),
      this.unifiedAttachmentTypeRegistry,
      this.caseConfig.attachments?.enabled === true,
      this.caseConfig.templates?.enabled === true,
      () => core.getStartServices()
    );
    registerCaseWorkflowTriggers(plugins.workflowsExtensions);

    if (plugins.agentBuilder) {
      registerCasesAgentBuilderTools(
        plugins.agentBuilder,
        getCasesClient('agent_builder'),
        core,
        this.unifiedAttachmentTypeRegistry,
        {
          analyticsV2Enabled: this.caseConfig.analyticsV2.enabled,
          attachmentsEnabled: this.caseConfig.attachments?.enabled === true,
          templatesEnabled: this.caseConfig.templates?.enabled === true,
        },
        this.logger
      );
    }

    return {
      attachmentFramework: {
        registerAttachment: (attachmentType) => {
          this.unifiedAttachmentTypeRegistry.register(attachmentType);
        },
      },
      config: this.caseConfig,
      registerCloseReasonValidator: (owner: string, validator: CloseReasonValidator) => {
        this.closeReasonValidators.set(owner, validator);
      },
      registerOwnerPrefix: (owner: string, prefix: string) => {
        registerOwnerPrefix(owner, prefix);
      },
    };
  }

  public start(core: CoreStart, plugins: CasesServerStartDependencies): CasesServerStart {
    this.logger.debug(`Starting Case Workflow`);

    if (plugins.taskManager) {
      scheduleCasesTelemetryTask(plugins.taskManager, this.logger);

      if (this.caseConfig.incrementalId.enabled) {
        void this.incrementalIdTaskManager?.setupIncrementIdTask(plugins.taskManager, core);
      }

      if (this.caseConfig.templates.enabled && this.templatesMigrationTaskManager) {
        void this.templatesMigrationTaskManager
          .scheduleMigrationTask(plugins.taskManager, core)
          .catch((err) =>
            this.logger.error(
              `Failed to initialize templates migration task: ${
                err instanceof Error ? err.message : String(err)
              }`
            )
          );
      }
      if (this.caseConfig.analytics.index?.enabled) {
        const internalSavedObjectsRepository = core.savedObjects.createInternalRepository([
          CASE_SAVED_OBJECT,
        ]);
        const internalSavedObjectsClient = new SavedObjectsClient(internalSavedObjectsRepository);
        scheduleCAISchedulerTask({
          taskManager: plugins.taskManager,
          logger: this.logger,
        }).catch(() => {}); // it shouldn't reject, but just in case
        createCasesAnalyticsIndexes({
          esClient: core.elasticsearch.client.asInternalUser,
          logger: this.logger,
          isServerless: this.isServerless,
          taskManager: plugins.taskManager,
          savedObjectsClient: internalSavedObjectsClient,
        }).catch(() => {}); // it shouldn't reject, but just in case
      }
    }

    // Cases-as-data v2 start. A no-op when disabled (via the writer/refresher
    // proxies); bootstrap errors are logged inside the service and `void`-ed
    // here to keep plugin start non-blocking. dataViews is an optional dep
    // consumed only by v2 — if v2 is enabled but it's absent, that's an admin
    // config error, so log and skip rather than crash.
    if (this.casesAnalyticsV2Service) {
      if (!this.caseConfig.analyticsV2.enabled) {
        // Disabled: skip building the internal repo entirely — no v2 work to do.
      } else if (plugins.dataViews == null) {
        this.logger.error(
          'cases-analyticsV2 is enabled but the `dataViews` plugin is not installed. ' +
            'Install the dataViews plugin or set `xpack.cases.analyticsV2.enabled: false`. ' +
            'Skipping v2 start.'
        );
      } else {
        // The internal repo serves five consumers:
        //  - The cases-surface reconciliation runner walks `cases` SOs.
        //  - The activity-surface reconciliation runner walks
        //    `cases-user-actions` SOs (created-only, no `updated_at`
        //    filter — see `reconciliation/activity_runner.ts`).
        //  - The attachments-surface reconciliation runner walks BOTH
        //    `cases-comments` (legacy) AND `cases-attachments` (new
        //    unified) SOs into a single analytics index, so the surface
        //    works regardless of where in the in-flight SO migration
        //    (security-team#15066) a tenant sits — see
        //    `reconciliation/attachments_runner.ts`.
        //  - The data view sub-service reads `cases-templates` AND
        //    `cases-field-definitions` SOs per-space to derive runtime
        //    fields (template fields plus global `isGlobal` field-library
        //    fields). Both types are always registered with core (see
        //    `saved_object_types/index.ts`), so they're always opted in
        //    here; when the templates feature is off there simply are no
        //    template/field-definition documents to walk and the runtime
        //    field overlay comes back empty.
        //  - The `/reset` admin route deletes per-space `index-pattern` SOs
        //    across namespaces. A request-scoped SO client can't do this:
        //    the spaces extension scopes `delete` to the request's namespace,
        //    so deleting a data view in space `analytics-1` from a `/reset`
        //    request that arrived in `default` 404s on the existence check
        //    (even with `force: true`).
        // The cases SO types are hidden, so they must be opted in
        // explicitly. `index-pattern` is a globally-registered SO type
        // (data-views plugin); opting it in here grants the internal client
        // the cross-namespace delete it needs.
        //
        // Both attachment SO types are always registered with core (the
        // unified `cases-attachments` type is registered unconditionally
        // since #275225), so both are opted in here and the attachments
        // reconciliation runner always walks both source types.
        const v2InternalRepository = core.savedObjects.createInternalRepository([
          CASE_SAVED_OBJECT,
          CASE_USER_ACTION_SAVED_OBJECT,
          CASE_COMMENT_SAVED_OBJECT,
          CASE_ATTACHMENT_SAVED_OBJECT,
          CASE_TEMPLATE_SAVED_OBJECT,
          CASE_FIELD_DEFINITION_SAVED_OBJECT,
          'index-pattern',
        ]);
        const v2InternalSavedObjectsClient = new SavedObjectsClient(v2InternalRepository);
        void this.casesAnalyticsV2Service.start({
          esClient: core.elasticsearch.client.asInternalUser,
          taskManager: plugins.taskManager,
          internalSavedObjectsClient: v2InternalSavedObjectsClient,
          dataViewsService: plugins.dataViews,
        });
      }
    }

    this.userProfileService.initialize({
      spaces: plugins.spaces,
      // securityPluginSetup will be set to a defined value in the setup() function
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      securityPluginSetup: this.securityPluginSetup!,
      securityPluginStart: plugins.security,
      licensingPluginStart: plugins.licensing,
    });

    // this.casesEventBus will be set to a defined value in the setup() function
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    registerCasesWorkflowEventBridge(this.casesEventBus!, plugins.workflowsExtensions, this.logger);

    this.clientFactory.initialize({
      // securityPluginSetup will be set to a defined value in the setup() function
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      securityPluginSetup: this.securityPluginSetup!,
      securityPluginStart: plugins.security,
      securityServiceStart: core.security,
      spacesPluginStart: plugins.spaces,
      featuresPluginStart: plugins.features,
      actionsPluginStart: plugins.actions,
      licensingPluginStart: plugins.licensing,
      /**
       * Lens will be always defined as
       * it is declared as required plugin in kibana.json
       */
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      lensEmbeddableFactory: this.lensEmbeddableFactory!,
      unifiedAttachmentTypeRegistry: this.unifiedAttachmentTypeRegistry,
      publicBaseUrl: core.http.basePath.publicBaseUrl,
      notifications: plugins.notifications,
      ruleRegistry: plugins.ruleRegistry,
      filesPluginStart: plugins.files,
      // usageCounter will be set to a defined value in the setup() function
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      usageCounter: this.usageCounter!,
      config: this.caseConfig,
      casesEventBus: this.casesEventBus,
      closeReasonValidator:
        this.closeReasonValidators.size > 0
          ? (closeReason, owner, request) => {
              const ownerValidator = this.closeReasonValidators.get(owner);
              if (ownerValidator) {
                return ownerValidator(closeReason, request);
              }
              return Promise.resolve(false);
            }
          : undefined,
      // Stable v2 proxy: no-op until `start()` runs, real writer after; safe
      // to capture before start. The `V2_NOOP_WRITER` fallback is defensive —
      // setup() always precedes start() in production, but it keeps
      // start()-in-isolation test harnesses from crashing.
      analyticsV2Writer: this.casesAnalyticsV2Service?.getWriter() ?? V2_NOOP_WRITER,
      // Activity-surface companion (same lifetime + fallback). Captured by the
      // user-actions service via the cases client factory.
      analyticsV2ActivityWriter:
        this.casesAnalyticsV2Service?.getActivityWriter() ?? V2_NOOP_ACTIVITY_WRITER,
      // Attachments surface companion. Same lifetime + same defensive
      // fallback as `analyticsV2Writer`. Captured by the AttachmentService
      // (write hooks) and by the CasesService (cascade-on-case-delete) via
      // the cases client factory.
      analyticsV2AttachmentsWriter:
        this.casesAnalyticsV2Service?.getAttachmentsWriter() ?? V2_NOOP_ATTACHMENTS_WRITER,
      // Companion refresher proxy (same lifetime + fallback). The templates
      // service calls it fire-and-forget after every template mutation.
      analyticsV2DataViewRefresher:
        this.casesAnalyticsV2Service?.getDataViewRefresher() ?? V2_NOOP_DATA_VIEW_REFRESHER,
    });

    return {
      getCasesClientWithRequest: this.getCasesClientWithRequest(core, 'plugin_contract'),
      getUnifiedAttachmentTypeRegistry: () => this.unifiedAttachmentTypeRegistry,
      getCasesEventBus: () => {
        if (!this.casesEventBus) {
          throw new Error('getCasesEventBus called before casesEventBus was initialized');
        }
        return this.casesEventBus;
      },
      config: this.caseConfig,
    };
  }

  public stop() {
    this.logger.debug(`Stopping Case Workflow`);
    this.casesAnalyticsV2Service?.stop();
  }

  private createRouteHandlerContext = ({
    core,
    spaces,
  }: {
    core: CoreSetup;
    spaces?: CasesServerSetupDependencies['spaces'];
  }): IContextProvider<CasesRequestHandlerContext, 'cases'> => {
    return async (context, request, response) => {
      // Cases-as-data v2 — lazy per-space `Cases` data view bootstrap.
      // Idempotent + in-process cached (a `Set.has()` check after the first
      // ensure per space); errors are swallowed inside the service. Gated on
      // `analyticsV2.enabled` so the disabled default path skips resolving
      // `context.core` + the space id just to reach a no-op.
      if (this.caseConfig.analyticsV2.enabled) {
        const coreContext = await context.core;
        const spaceId = spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
        this.casesAnalyticsV2Service?.ensureDataViewForSpace({
          spaceId,
          request,
          savedObjectsClient: coreContext.savedObjects.client,
        });
      }

      return {
        getCasesClient: async () => {
          const [{ savedObjects }] = await core.getStartServices();
          const coreContext = await context.core;

          return this.clientFactory.create({
            request,
            scopedClusterClient: coreContext.elasticsearch.client.asCurrentUser,
            savedObjectsService: savedObjects,
            clientSource: 'rest_api',
          });
        },
      };
    };
  };

  private getCasesClientWithRequest =
    (core: CoreStart, clientSource: CasesClientSource) =>
    async (request: KibanaRequest): Promise<CasesClient> => {
      const client = core.elasticsearch.client;

      return this.clientFactory.create({
        request,
        scopedClusterClient: client.asScoped(request).asCurrentUser,
        savedObjectsService: core.savedObjects,
        clientSource,
      });
    };
}
