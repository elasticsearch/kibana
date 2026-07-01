/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { EncryptedSavedObjectsPluginStart } from '@kbn/encrypted-saved-objects-plugin/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { EvalsRouter } from '../types';
import type { EvaluatorRegistry } from '../evaluators/types';
import { registerGetExperimentsRoute } from './experiments/get_experiments';
import { registerGetExperimentRoute } from './experiments/get_experiment';
import { registerGetExperimentScoresRoute } from './experiments/get_experiment_scores';
import { registerGetExperimentDatasetExamplesRoute } from './experiments/get_experiment_dataset_examples';
import { registerCompareExperimentsRoute } from './experiments/compare_experiments';
import { registerGetExampleScoresRoute } from './examples/get_example_scores';
import { registerGetTraceRoute } from './traces/get_trace';
import { registerListDatasetsRoute } from './datasets/list_datasets';
import { registerCreateDatasetRoute } from './datasets/create_dataset';
import { registerGetDatasetRoute } from './datasets/get_dataset';
import { registerUpdateDatasetRoute } from './datasets/update_dataset';
import { registerDeleteDatasetRoute } from './datasets/delete_dataset';
import { registerAddExamplesRoute } from './datasets/add_examples';
import { registerUpdateExampleRoute } from './datasets/update_example';
import { registerDeleteExampleRoute } from './datasets/delete_example';
import { registerUpsertDatasetRoute } from './datasets/upsert_dataset';
import { registerRemoteConfigsRoutes } from './remotes/register_routes';
import { registerGetTracingProjectsRoute } from './tracing/get_projects';
import { registerGetProjectTracesRoute } from './tracing/get_project_traces';
import { registerIngestScoresRoute } from './scores/ingest_scores';
import { registerListEvaluatorsRoute } from './evaluators/list_evaluators';
import { registerEvaluateRoute } from './evaluators/evaluate';

export interface RouteDependencies {
  router: EvalsRouter;
  logger: Logger;
  canEncrypt: boolean;
  evaluatorRegistry: EvaluatorRegistry;
  getInferenceStart: () => Promise<InferenceServerStart>;
  getEncryptedSavedObjectsStart: () => Promise<EncryptedSavedObjectsPluginStart>;
  getInternalRemoteConfigsSoClient: () => Promise<SavedObjectsClientContract>;
}

export const registerRoutes = (dependencies: RouteDependencies) => {
  registerGetExperimentsRoute(dependencies);
  registerGetExperimentRoute(dependencies);
  registerGetExperimentScoresRoute(dependencies);
  registerGetExperimentDatasetExamplesRoute(dependencies);
  registerCompareExperimentsRoute(dependencies);
  registerGetExampleScoresRoute(dependencies);
  registerGetTraceRoute(dependencies);
  registerGetTracingProjectsRoute(dependencies);
  registerGetProjectTracesRoute(dependencies);
  registerIngestScoresRoute(dependencies);
  registerListDatasetsRoute(dependencies);
  registerCreateDatasetRoute(dependencies);
  registerGetDatasetRoute(dependencies);
  registerUpdateDatasetRoute(dependencies);
  registerDeleteDatasetRoute(dependencies);
  registerAddExamplesRoute(dependencies);
  registerUpdateExampleRoute(dependencies);
  registerDeleteExampleRoute(dependencies);
  registerUpsertDatasetRoute(dependencies);
  registerListEvaluatorsRoute(dependencies);
  registerEvaluateRoute(dependencies);
  registerRemoteConfigsRoutes(dependencies);
};
