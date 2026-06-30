/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import { ALERT_ACTION_WORKFLOW_TRIGGERS } from '../events/alert_action_workflow_subscriber/triggers';
import { RULE_WORKFLOW_TRIGGERS } from '../events/rule_workflow_subscriber/triggers';

/**
 * Registers all alerting-v2 server-side workflow trigger definitions.
 *
 * Alert-action and rule-lifecycle triggers are registered from their respective
 * catalogs — the same catalogs the workflow subscribers walk at dispatch time.
 *
 * Call once during plugin setup.
 */
export function registerTriggerDefinitions(
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup
): void {
  for (const trigger of ALERT_ACTION_WORKFLOW_TRIGGERS) {
    workflowsExtensions.registerTriggerDefinition(trigger.definition);
  }

  for (const trigger of RULE_WORKFLOW_TRIGGERS) {
    workflowsExtensions.registerTriggerDefinition(trigger.definition);
  }
}
