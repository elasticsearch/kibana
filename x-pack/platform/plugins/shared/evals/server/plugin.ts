/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import {
  type CoreSetup,
  type CoreStart,
  type Plugin,
  type PluginInitializerContext,
} from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { PLUGIN_ID, PLUGIN_NAME, EVALS_API_PRIVILEGES, EVALS_UI_PRIVILEGES } from '../common';
import type { EvalsConfig } from './config';
import { createEvaluatorRegistry } from './evaluators/registry';
import type { EvaluatorRegistry } from './evaluators/types';
import {
  EVALS_REMOTE_KIBANA_CONFIG_SAVED_OBJECT_TYPE,
  evalsRemoteKibanaConfigSavedObjectType,
} from './saved_objects/remote_kibana_config';
import type {
  EvalsRequestHandlerContext,
  EvalsPluginSetup,
  EvalsPluginStart,
  EvalsSetupDependencies,
  EvalsStartDependencies,
} from './types';
import { registerRoutes } from './routes/register_routes';
import { DatasetService } from './storage/dataset_service';
import { EvaluationScoreService } from './storage/evaluation_score_service';
import { evaluationsDataStreamDefinition } from './storage/scores_index_template';

export class EvalsPlugin
  implements
    Plugin<EvalsPluginSetup, EvalsPluginStart, EvalsSetupDependencies, EvalsStartDependencies>
{
  private readonly logger: Logger;
  private readonly config: EvalsConfig;
  private readonly isServerless: boolean;
  private evaluatorRegistry?: EvaluatorRegistry;
  private datasetService?: DatasetService;
  private evaluationScoreService?: EvaluationScoreService;

  constructor(context: PluginInitializerContext<EvalsConfig>) {
    this.logger = context.logger.get();
    this.config = context.config.get();
    this.isServerless = context.env.packageInfo.buildFlavor === 'serverless';
  }

  setup(
    coreSetup: CoreSetup<EvalsStartDependencies, EvalsPluginStart>,
    { features, encryptedSavedObjects }: EvalsSetupDependencies
  ): EvalsPluginSetup {
    if (!this.config.enabled) {
      this.logger.info('Evals plugin is disabled');
      return {};
    }

    this.logger.info('Setting up Evals plugin');
    coreSetup.dataStreams.registerDataStream(evaluationsDataStreamDefinition);

    coreSetup.savedObjects.registerType(evalsRemoteKibanaConfigSavedObjectType);
    encryptedSavedObjects.registerType({
      type: EVALS_REMOTE_KIBANA_CONFIG_SAVED_OBJECT_TYPE,
      attributesToEncrypt: new Set(['apiKey']),
      attributesToIncludeInAAD: new Set(['createdAt', 'url']),
    });
    this.evaluatorRegistry = createEvaluatorRegistry();

    coreSetup.http.registerRouteHandlerContext<EvalsRequestHandlerContext, 'evals'>(
      'evals',
      async () => {
        if (!this.datasetService || !this.evaluationScoreService || !this.evaluatorRegistry) {
          throw new Error('Evals storage services have not been initialized');
        }

        return {
          datasetService: this.datasetService,
          evaluationScoreService: this.evaluationScoreService,
          evaluatorRegistry: this.evaluatorRegistry,
        };
      }
    );

    features.registerKibanaFeature({
      id: PLUGIN_ID,
      name: PLUGIN_NAME,
      order: 9000,
      category: DEFAULT_APP_CATEGORIES.kibana,
      app: ['kibana', PLUGIN_ID],
      management: { ai: [PLUGIN_ID] },
      privileges: {
        all: {
          app: ['kibana', PLUGIN_ID],
          api: [EVALS_API_PRIVILEGES.read, EVALS_API_PRIVILEGES.manage],
          management: { ai: [PLUGIN_ID] },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [EVALS_UI_PRIVILEGES.show, EVALS_UI_PRIVILEGES.manage],
        },
        read: {
          app: ['kibana', PLUGIN_ID],
          api: [EVALS_API_PRIVILEGES.read],
          management: { ai: [PLUGIN_ID] },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [EVALS_UI_PRIVILEGES.show],
        },
      },
    });

    const router = coreSetup.http.createRouter<EvalsRequestHandlerContext>();
    const internalRemoteConfigsSoClientPromise = coreSetup.getStartServices().then(([coreStart]) =>
      coreStart.savedObjects.getUnsafeInternalClient({
        includedHiddenTypes: [EVALS_REMOTE_KIBANA_CONFIG_SAVED_OBJECT_TYPE],
      })
    );

    registerRoutes({
      router,
      logger: this.logger,
      canEncrypt: encryptedSavedObjects.canEncrypt,
      evaluatorRegistry: this.evaluatorRegistry,
      getInferenceStart: () =>
        coreSetup.getStartServices().then(([, pluginsStart]) => pluginsStart.inference),
      getEncryptedSavedObjectsStart: () =>
        coreSetup.getStartServices().then(([, pluginsStart]) => pluginsStart.encryptedSavedObjects),
      getInternalRemoteConfigsSoClient: () => internalRemoteConfigsSoClientPromise,
    });

    return {};
  }

  start(coreStart: CoreStart, _plugins: EvalsStartDependencies): EvalsPluginStart {
    if (!this.config.enabled) {
      return {};
    }

    this.datasetService = new DatasetService(
      this.logger,
      coreStart.elasticsearch.client.asInternalUser,
      this.isServerless
    );
    this.evaluationScoreService = new EvaluationScoreService(this.logger, coreStart.dataStreams);

    // Fire-and-forget backfill of the denormalized `examples_count` for datasets
    // created before the field existed. Idempotent and a no-op once complete (and
    // on fresh/empty deployments), so it is safe to run on every start. Only runs
    // when the plugin is enabled, since we early-return above otherwise.
    this.datasetService
      .getClient()
      .backfillDatasetCounts()
      .then(({ updated }) => {
        if (updated > 0) {
          this.logger.info(`Backfilled examples_count for ${updated} evaluation dataset(s)`);
        }
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to backfill evaluation dataset example counts: ${
            error instanceof Error ? error.message : error
          }`
        );
      });

    return {
      datasetService: this.datasetService,
      evaluationScoreService: this.evaluationScoreService,
    };
  }

  stop() {}
}
