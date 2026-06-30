/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';

export const registerTriggerDefinitions = (
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup
): void => {
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./asset_criticality_updated').then(
      (m) => m.entityAssetCriticalityUpdatedPublicDefinition
    )
  );
  workflowsExtensions.registerTriggerDefinition(() =>
    import('./risk_score_changed').then((m) => m.entityRiskScoreChangedPublicDefinition)
  );
};
