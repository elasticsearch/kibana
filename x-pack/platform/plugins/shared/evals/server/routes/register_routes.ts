/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { EncryptedSavedObjectsPluginStart } from '@kbn/encrypted-saved-objects-plugin/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { KibanaRequest, SavedObjectsClientContract } from '@kbn/core/server';
import type { EvalsRouter, EvalsWorkflowsManagementSetup } from '../types';
import type { SpaceDependencies } from './shared/resolve_dataset_spaces';
import type { EvaluatorRegistry } from '../evaluators/types';
import type { TaskProviderRegistry } from '../task_providers/types';
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
import { registerCopyDatasetRoute } from './datasets/copy_dataset';
import { registerUpdateExampleRoute } from './datasets/update_example';
import { registerDeleteExampleRoute } from './datasets/delete_example';
import { registerUpsertDatasetRoute } from './datasets/upsert_dataset';
import { registerResolveDatasetRoute } from './datasets/resolve_dataset';
import { registerRemoteConfigsRoutes } from './remotes/register_routes';
import { registerGetTracingProjectsRoute } from './tracing/get_projects';
import { registerGetProjectTracesRoute } from './tracing/get_project_traces';
import { registerIngestScoresRoute } from './scores/ingest_scores';
import { registerIngestOnlineScoresRoute } from './online_scores/ingest_online_scores';
import { registerListOnlineScoresRoute } from './online_scores/list_online_scores';
import { registerListEvaluatorsRoute } from './evaluators/list_evaluators';
import { registerCreateEvaluatorRoute } from './evaluators/create_evaluator';
import { registerGetEvaluatorRoute } from './evaluators/get_evaluator';
import { registerUpdateEvaluatorRoute } from './evaluators/update_evaluator';
import { registerDeleteEvaluatorRoute } from './evaluators/delete_evaluator';
import { registerEvaluateRoute } from './evaluators/evaluate';
import { registerResolveInstrumentationRoute } from './evaluators/resolve_instrumentation';
import { registerValidateRoute } from './evaluators/validate';
import { registerTestEvaluatorRoute } from './evaluators/test_evaluator';
import { registerRunExperimentRoute } from './experiments/run_experiment';
import { registerSaveExperimentWorkflowRoute } from './experiments/save_experiment_workflow';
import { registerPreviewExperimentRoute } from './experiments/preview_experiment';
import { registerGetExperimentTemplatesRoute } from './experiments/get_experiment_templates';
import {
  registerGetExperimentExecutionRoute,
  registerCancelExperimentExecutionRoute,
} from './experiments/experiment_executions';

export interface RouteDependencies extends SpaceDependencies {
  router: EvalsRouter;
  logger: Logger;
  canEncrypt: boolean;
  evaluatorRegistry: EvaluatorRegistry;
  getInferenceStart: () => Promise<InferenceServerStart>;
  getEncryptedSavedObjectsStart: () => Promise<EncryptedSavedObjectsPluginStart>;
  getInternalRemoteConfigsSoClient: () => Promise<SavedObjectsClientContract>;
  getCurrentUsername?: (request: KibanaRequest) => Promise<string | undefined>;
  taskProviderRegistry?: TaskProviderRegistry;
  workflowsManagement?: EvalsWorkflowsManagementSetup;
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
  registerIngestOnlineScoresRoute(dependencies);
  registerListOnlineScoresRoute(dependencies);
  registerListDatasetsRoute(dependencies);
  registerCreateDatasetRoute(dependencies);
  // Registered before the `{datasetId}` route it would otherwise read as an id.
  // Order is for the reader: hapi matches the literal path first regardless.
  registerResolveDatasetRoute(dependencies);
  registerGetDatasetRoute(dependencies);
  registerUpdateDatasetRoute(dependencies);
  registerDeleteDatasetRoute(dependencies);
  registerAddExamplesRoute(dependencies);
  registerCopyDatasetRoute(dependencies);
  registerUpdateExampleRoute(dependencies);
  registerDeleteExampleRoute(dependencies);
  registerUpsertDatasetRoute(dependencies);
  registerListEvaluatorsRoute(dependencies);
  registerCreateEvaluatorRoute(dependencies);
  registerEvaluateRoute(dependencies);
  registerResolveInstrumentationRoute(dependencies);
  registerValidateRoute(dependencies);
  registerTestEvaluatorRoute(dependencies);
  registerGetEvaluatorRoute(dependencies);
  registerUpdateEvaluatorRoute(dependencies);
  registerDeleteEvaluatorRoute(dependencies);
  registerRunExperimentRoute(dependencies);
  registerSaveExperimentWorkflowRoute(dependencies);
  registerPreviewExperimentRoute(dependencies);
  registerGetExperimentTemplatesRoute(dependencies);
  registerGetExperimentExecutionRoute(dependencies);
  registerCancelExperimentExecutionRoute(dependencies);
  registerRemoteConfigsRoutes(dependencies);
};
