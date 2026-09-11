/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { InferenceWorkflowsSetupDeps, InferenceWorkflowsStartDeps } from './types';
import { aiPromptStepDefinition } from './steps/ai/ai_prompt_step/step';
import { aiSummarizeStepDefinition } from './steps/ai/ai_summarize_step/step';
import { aiClassifyStepDefinition } from './steps/ai/ai_classify_step/step';
import { registerInferenceFeatures } from './steps/ai/register_inference_features';
import { aroundCompletionTriggerDefinition } from '../common/workflow_anonymization';
import { aiPiiStepDefinition } from './workflow_anonymization/ai_pii_step';
import { callSiteProceedStepDefinition } from './workflow_anonymization/call_site_proceed_step';
import { piiRestoreStepDefinition } from './workflow_anonymization/pii_restore_step';
import { createWorkflowAnonymizationProvider } from './workflow_anonymization/create_workflow_anonymization_provider';

export class InferenceWorkflowsPlugin
  implements Plugin<{}, {}, InferenceWorkflowsSetupDeps, InferenceWorkflowsStartDeps>
{
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  setup(core: CoreSetup<InferenceWorkflowsStartDeps>, deps: InferenceWorkflowsSetupDeps) {
    deps.workflowsExtensions.registerStepDefinition(aiPromptStepDefinition(core));
    deps.workflowsExtensions.registerStepDefinition(aiSummarizeStepDefinition(core));
    deps.workflowsExtensions.registerStepDefinition(aiClassifyStepDefinition(core));
    deps.workflowsExtensions.registerStepDefinition(aiPiiStepDefinition);
    deps.workflowsExtensions.registerStepDefinition(callSiteProceedStepDefinition);
    deps.workflowsExtensions.registerStepDefinition(piiRestoreStepDefinition);
    deps.workflowsExtensions.registerTriggerDefinition(aroundCompletionTriggerDefinition);
    deps.inference.registerWorkflowAnonymizationProvider(
      createWorkflowAnonymizationProvider({
        management: deps.workflowsManagement.management,
        triggerCacheTtlMs: deps.inference.anonymizationConfig.triggerCacheTtlMs,
        // Managed workflow installation is wired in PR 9. Until then the trigger resolution
        // returns matched:false for all requests because no workflow is installed.
        ensureManagedWorkflow: async () => {},
      })
    );

    if (deps.searchInferenceEndpoints) {
      registerInferenceFeatures(deps.searchInferenceEndpoints);
    }

    return {};
  }

  start(_core: CoreStart, _deps: InferenceWorkflowsStartDeps) {
    return {};
  }
}
