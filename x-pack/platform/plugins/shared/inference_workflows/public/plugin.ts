/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';

interface InferenceWorkflowsPublicSetupDeps {
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup;
}

export class InferenceWorkflowsPublicPlugin
  implements Plugin<{}, {}, InferenceWorkflowsPublicSetupDeps>
{
  setup(_core: CoreSetup, deps: InferenceWorkflowsPublicSetupDeps) {
    deps.workflowsExtensions.registerStepDefinition(() =>
      import('./steps/ai/ai_prompt_step').then((m) => m.AiPromptStepDefinition)
    );
    deps.workflowsExtensions.registerStepDefinition(() =>
      import('./steps/ai/ai_summarize_step').then((m) => m.AiSummarizeStepDefinition)
    );
    deps.workflowsExtensions.registerStepDefinition(() =>
      import('./steps/ai/ai_classify_step').then((m) => m.AiClassifyStepDefinition)
    );
    deps.workflowsExtensions.registerStepDefinition(() =>
      import('./workflow_anonymization').then((module) => module.aiPiiStepDefinition)
    );
    deps.workflowsExtensions.registerStepDefinition(() =>
      import('./workflow_anonymization').then((module) => module.callSiteProceedStepDefinition)
    );
    deps.workflowsExtensions.registerStepDefinition(() =>
      import('./workflow_anonymization').then((module) => module.piiRestoreStepDefinition)
    );
    deps.workflowsExtensions.registerTriggerDefinition(() =>
      import('./workflow_anonymization').then(
        (module) => module.aroundCompletionPublicTriggerDefinition
      )
    );
    return {};
  }

  start(_core: CoreStart) {
    return {};
  }
}
