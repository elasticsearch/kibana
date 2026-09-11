/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '@kbn/core/server';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import type { DataViewsService } from '@kbn/data-views-plugin/common';

import type { Subscription } from 'rxjs';
import { getInternalSavedObjectsClient } from './utils/get_internal_saved_object_client';
import { upgradeIntegration } from './utils/upgrade_integration';
import { getPackagePolicyCreateCallback } from './lib/create_package_policy_callback';
import { createConfig } from './create_config';
import type { OsqueryPluginSetup, OsqueryPluginStart, SetupPlugins, StartPlugins } from './types';
import { defineRoutes } from './routes';
import { osquerySearchStrategyProvider } from './search_strategy/osquery';
import { OSQUERY_SEARCH_STRATEGY } from './search_strategy/constants';
import { initSavedObjects } from './saved_objects';
import type { OsqueryAppContext } from './lib/osquery_app_context_services';
import { OsqueryAppContextService } from './lib/osquery_app_context_services';
import type { ConfigType } from '../common/config';
import { OSQUERY_INTEGRATION_NAME } from '../common';
import {
  getPackagePolicyDeleteCallback,
  getAgentPolicyPostUpdateCallback,
} from './lib/fleet_integration';
import { TelemetryEventsSender } from './lib/telemetry/sender';
import { TelemetryReceiver } from './lib/telemetry/receiver';
import { initializeTransformsIndices } from './create_indices/create_transforms_indices';
import { initializeTransforms } from './create_transforms/create_transforms';
import { createDataViews } from './create_data_views';

import { registerFeatures } from './utils/register_features';
import { osqueryUnifiedAttachment } from './cases/attachments';
import { createActionService } from './handlers/action/create_action_service';
import {
  RECONCILE_TASK_TYPE,
  runReconcileTask,
  scheduleReconcileTask,
} from './lib/reconcile_schedule_ids_task';
import { checkResponseActionAuthz } from './lib/check_response_action_authz';
import { SchemaService } from './lib/schema_service';

export class OsqueryPlugin implements Plugin<OsqueryPluginSetup, OsqueryPluginStart> {
  private readonly logger: Logger;
  private context: PluginInitializerContext;
  private readonly osqueryAppContextService = new OsqueryAppContextService();
  private readonly telemetryReceiver: TelemetryReceiver;
  private readonly telemetryEventsSender: TelemetryEventsSender;
  private coreStart: CoreStart | null = null;
  private licenseSubscription: Subscription | null = null;
  private createActionService: ReturnType<typeof createActionService> | null = null;
  private readonly schemaService: SchemaService;
  private rruleSchedulingEnabled: boolean = false;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.context = initializerContext;
    this.logger = initializerContext.logger.get();
    this.telemetryEventsSender = new TelemetryEventsSender(this.logger);
    this.telemetryReceiver = new TelemetryReceiver(this.logger);
    this.schemaService = new SchemaService(this.logger);
  }

  public setup(core: CoreSetup<StartPlugins, OsqueryPluginStart>, plugins: SetupPlugins) {
    this.logger.debug('osquery: Setup');
    const config = createConfig(this.initializerContext);
    const experimentalFeatures = config.experimentalFeatures;
    this.rruleSchedulingEnabled = experimentalFeatures.rruleScheduling;

    registerFeatures(plugins.features);

    const router = core.http.createRouter<DataRequestHandlerContext>();

    const osqueryContext: OsqueryAppContext = {
      logFactory: this.context.logger,
      getStartServices: core.getStartServices,
      service: this.osqueryAppContextService,
      config: (): ConfigType => config,
      experimentalFeatures,
      security: plugins.security,
      telemetryEventsSender: this.telemetryEventsSender,
      licensing: plugins.licensing,
      isCpsActive: async (request) => {
        if (!experimentalFeatures.crossProjectSearch) {
          return false;
        }

        const [, startPlugins] = await core.getStartServices();

        // `cps.isCpsActive` is tri-state: `undefined` means the linked projects could not be
        // resolved, which is not the same as there being none. Osquery collapses that to "do not
        // fan out" deliberately. An unresolved scope is one whose index grants we cannot inspect --
        // almost always a custom role missing `read_project_routing` -- and fanning those out would
        // put exactly the principals we know least about on `asCurrentUser`. The cost is that such
        // a role reads origin-only until the predefined roles carry the privilege.
        return (await startPlugins.cps?.isCpsActive(request)) === true;
      },
    };

    initSavedObjects(core.savedObjects);

    // TODO: We do not pass so client here.
    this.createActionService = createActionService(osqueryContext);

    core
      .getStartServices()
      .then(([{ elasticsearch }, depsStart]) => {
        const osquerySearchStrategy = osquerySearchStrategyProvider(
          depsStart.data,
          elasticsearch.client,
          osqueryContext
        );

        plugins.data.search.registerSearchStrategy(OSQUERY_SEARCH_STRATEGY, osquerySearchStrategy);
        defineRoutes(router, osqueryContext, this.schemaService);
      })
      .catch(() => {
        // it shouldn't reject, but just in case
      });

    this.telemetryEventsSender.setup(this.telemetryReceiver, plugins.taskManager, core.analytics);

    plugins.taskManager?.registerTaskDefinitions({
      [RECONCILE_TASK_TYPE]: {
        title: 'Reconcile osquery pack schedule IDs onto the Fleet wire',
        timeout: '5m',
        maxAttempts: 3,
        createTaskRunner: ({ signal, taskInstance }) => ({
          run: async () =>
            runReconcileTask({
              coreStart: this.coreStart,
              osqueryContext: this.osqueryAppContextService,
              logger: this.logger,
              signal,
              isRruleFeatureEnabled: this.rruleSchedulingEnabled,
              taskState: taskInstance?.state,
            }),
        }),
      },
    });

    if (plugins.cases) {
      plugins.cases.attachmentFramework.registerAttachment(osqueryUnifiedAttachment);
    }

    return {
      createActionService: this.createActionService,
      checkResponseActionAuthz: async (request, actionParams) =>
        checkResponseActionAuthz(
          core,
          request,
          actionParams,
          plugins.spaces?.spacesService.getSpaceId(request)
        ),
    } satisfies OsqueryPluginSetup;
  }

  public start(core: CoreStart, plugins: StartPlugins) {
    this.logger.debug('osquery: Started');
    this.coreStart = core;
    const registerIngestCallback = plugins.fleet?.registerExternalCallback;
    this.osqueryAppContextService.start({
      ...plugins.fleet,
      ruleRegistryService: plugins.ruleRegistry,
      // @ts-expect-error update types
      config: this.config!,
      logger: this.logger,
      registerIngestCallback,
      spacesService: plugins.spaces?.spacesService,
    });

    this.telemetryReceiver.start(core, this.osqueryAppContextService);

    this.telemetryEventsSender.start(plugins.taskManager, this.telemetryReceiver);

    plugins.fleet
      ?.fleetSetupCompleted()
      .then(async () => {
        const packageInfo = await plugins.fleet?.packageService.asInternalUser.getInstallation(
          OSQUERY_INTEGRATION_NAME
        );
        const client = await getInternalSavedObjectsClient(core);

        const esClient = core.elasticsearch.client.asInternalUser;
        const dataViewsService = await plugins.dataViews.dataViewsServiceFactory(
          client,
          esClient,
          undefined,
          true
        );

        // If package is installed we want to make sure all needed assets are installed
        if (packageInfo) {
          await this.initialize(core, dataViewsService);
        }

        // Upgrade integration into 1.6.0 and rollover if found 'generic' dataset - we do not want to wait for it
        upgradeIntegration({ packageInfo, client, esClient, logger: this.logger }).catch(() => {
          // we do not want to wait for it
        });

        if (registerIngestCallback) {
          registerIngestCallback(
            'packagePolicyCreate',
            getPackagePolicyCreateCallback(
              core,
              this.osqueryAppContextService,
              () => this.initialize(core, dataViewsService),
              this.rruleSchedulingEnabled
            )
          );

          registerIngestCallback('packagePolicyPostDelete', getPackagePolicyDeleteCallback(core));
          registerIngestCallback('agentPolicyPostUpdate', getAgentPolicyPostUpdateCallback(core));
        }

        // Schedule after Fleet callbacks are registered so create/update/delete
        // events are handled consistently.
        await scheduleReconcileTask(plugins.taskManager, this.logger, new Date());
      })
      .catch(() => {
        // it shouldn't reject, but just in case
      });

    return {};
  }

  public stop() {
    this.logger.debug('osquery: Stopped');
    this.telemetryEventsSender.stop();
    this.osqueryAppContextService.stop();
    this.licenseSubscription?.unsubscribe();
    this.createActionService?.stop();
  }

  async initialize(core: CoreStart, dataViewsService: DataViewsService): Promise<void> {
    this.logger.debug('initialize');
    await initializeTransformsIndices(core.elasticsearch.client.asInternalUser, this.logger);
    await initializeTransforms(core.elasticsearch.client.asInternalUser, this.logger);
    await createDataViews(dataViewsService);
  }
}
