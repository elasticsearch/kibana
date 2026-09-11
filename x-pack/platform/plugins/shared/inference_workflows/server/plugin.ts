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
import {
  createInferenceAnonymizationManagedWorkflowInstaller,
  type InferenceAnonymizationManagedWorkflowInstaller,
} from './workflow_anonymization/managed_workflow_installer';

const MANAGED_WORKFLOW_OWNER = 'inferenceWorkflows';

export class InferenceWorkflowsPlugin
  implements Plugin<{}, {}, InferenceWorkflowsSetupDeps, InferenceWorkflowsStartDeps>
{
  private readonly logger: Logger;

  private managedWorkflowInstaller?: InferenceAnonymizationManagedWorkflowInstaller;

  private workflowDrivenEnabled: boolean = false;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  setup(core: CoreSetup<InferenceWorkflowsStartDeps>, deps: InferenceWorkflowsSetupDeps) {
    this.workflowDrivenEnabled = deps.inference.anonymizationConfig.workflowDrivenEnabled;
    deps.workflowsExtensions.registerStepDefinition(aiPromptStepDefinition(core));
    deps.workflowsExtensions.registerStepDefinition(aiSummarizeStepDefinition(core));
    deps.workflowsExtensions.registerStepDefinition(aiClassifyStepDefinition(core));
    deps.workflowsExtensions.registerStepDefinition(aiPiiStepDefinition);
    deps.workflowsExtensions.registerStepDefinition(callSiteProceedStepDefinition);
    deps.workflowsExtensions.registerStepDefinition(piiRestoreStepDefinition);
    deps.workflowsExtensions.registerTriggerDefinition(aroundCompletionTriggerDefinition);
    deps.workflowsExtensions.registerManagedWorkflowOwner(MANAGED_WORKFLOW_OWNER);
    deps.inference.registerWorkflowAnonymizationProvider(
      createWorkflowAnonymizationProvider({
        management: deps.workflowsManagement.management,
        triggerCacheTtlMs: deps.inference.anonymizationConfig.triggerCacheTtlMs,
        ensureManagedWorkflow: async (spaceId) => {
          if (!this.managedWorkflowInstaller) {
            throw new Error('Inference anonymization managed workflow installer is unavailable');
          }
          await this.managedWorkflowInstaller.ensureInstalled(spaceId);
        },
      })
    );

    if (deps.searchInferenceEndpoints) {
      registerInferenceFeatures(deps.searchInferenceEndpoints);
    }

    return {};
  }

  start(core: CoreStart, deps: InferenceWorkflowsStartDeps) {
    this.managedWorkflowInstaller = createInferenceAnonymizationManagedWorkflowInstaller({
      getClient: () => deps.workflowsExtensions.initManagedWorkflowsClient(MANAGED_WORKFLOW_OWNER),
      logger: this.logger.get('managed_workflow'),
    });

    if (this.workflowDrivenEnabled) {
      const existingSpaceIds = (async () => {
        const repo = core.savedObjects.createInternalRepository();
        const perPage = 1_000;
        let page = 1;
        let fetched = 0;
        let total = 0;
        const ids: string[] = ['default'];
        do {
          const result = await repo.find({ type: 'space', perPage, page });
          total = result.total;
          result.saved_objects.forEach(({ id }) => ids.push(id));
          fetched += result.saved_objects.length;
          page += 1;
        } while (fetched < total);
        return ids;
      })();

      void this.managedWorkflowInstaller.initialize(existingSpaceIds).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to install inference anonymization managed workflow: ${message}`);
      });
    }

    return {};
  }
}
