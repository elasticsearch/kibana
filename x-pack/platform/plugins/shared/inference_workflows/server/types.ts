/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceServerSetup, InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import type {
  SearchInferenceEndpointsPluginSetup,
  SearchInferenceEndpointsPluginStart,
} from '@kbn/search-inference-endpoints/server';

export interface InferenceWorkflowsSetupDeps {
  inference: InferenceServerSetup;
  spaces: SpacesPluginSetup;
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
  workflowsManagement: WorkflowsServerPluginSetup;
  searchInferenceEndpoints?: SearchInferenceEndpointsPluginSetup;
}

export interface InferenceWorkflowsStartDeps {
  inference: InferenceServerStart;
  spaces: SpacesPluginStart;
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  searchInferenceEndpoints?: SearchInferenceEndpointsPluginStart;
}
