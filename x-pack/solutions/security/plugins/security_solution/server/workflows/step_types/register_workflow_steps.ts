/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import type { CoreSetup } from '@kbn/core/server';
import { renderAlertNarrativeStepDefinition } from './render_alert_narrative_step';
import { buildAlertEntityGraphStepDefinition } from './build_alert_entity_graph_step';
import { setAlertStatusStepDefinition } from './set_alert_status_step/set_alert_status_step';
import { setAlertTagsStepDefinition } from './set_alert_tags_step/set_alert_tags_step';
import { assignAlertStepDefinition } from './assign_alert_step/assign_alert_step';
import {
  REGISTER_ALERT_VALIDATION_STEPS_FEATURE_FLAG,
  REGISTER_ALERT_VALIDATION_STEP_FEATURE_FLAG_DEFAULT,
} from '../../../common/constants';

/**
 * Registers all security workflow steps with the workflowsExtensions plugin.
 * Registration is synchronous; each step uses an async loader to perform the
 * feature-flag check at resolution time.
 */
export const registerWorkflowSteps = (
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup,
  core: CoreSetup
): void => {
  const isEnabled = core
    .getStartServices()
    .then(([coreStart]) =>
      coreStart.featureFlags.getBooleanValue(
        REGISTER_ALERT_VALIDATION_STEPS_FEATURE_FLAG,
        REGISTER_ALERT_VALIDATION_STEP_FEATURE_FLAG_DEFAULT
      )
    );

  workflowsExtensions.registerStepDefinition(async () => {
    if (!(await isEnabled)) return undefined;
    return renderAlertNarrativeStepDefinition;
  });

  workflowsExtensions.registerStepDefinition(async () => {
    if (!(await isEnabled)) return undefined;
    return buildAlertEntityGraphStepDefinition;
  });

  workflowsExtensions.registerStepDefinition(setAlertStatusStepDefinition);
  workflowsExtensions.registerStepDefinition(setAlertTagsStepDefinition);
  workflowsExtensions.registerStepDefinition(assignAlertStepDefinition);
};
