/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import type { ExperimentalFeatures } from '../../../common/experimental_features';
import type { EndpointAppContextService } from '../../endpoint/endpoint_app_context_services';
import { renderAlertNarrativeStepDefinition } from './render_alert_narrative_step';
import { buildAlertEntityGraphStepDefinition } from './build_alert_entity_graph_step';
import { setAlertStatusStepDefinition } from './set_alert_status_step/set_alert_status_step';
import { setAlertTagsStepDefinition } from './set_alert_tags_step/set_alert_tags_step';
import { setAttackTagsStepDefinition } from './set_attack_tags_step/set_attack_tags_step';
import { assignAlertStepDefinition } from './assign_alert_step/assign_alert_step';
import { assignAttackStepDefinition } from './assign_attack_step/assign_attack_step';
import { setAttackStatusStepDefinition } from './set_attack_status_step/set_attack_status_step';
import { enableRuleStepDefinition } from './enable_rule_step/enable_rule_step';
import { disableRuleStepDefinition } from './disable_rule_step/disable_rule_step';
import { createRuleExceptionStepDefinition } from './create_rule_exception_step/create_rule_exception_step';
import { createExceptionListItemStepDefinition } from './create_exception_list_item_step/create_exception_list_item_step';
import { createNoteStepDefinition } from './create_note_step/create_note_step';
import { deleteNoteStepDefinition } from './delete_note_step/delete_note_step';
import { getNotesStepDefinition } from './get_notes_step/get_notes_step';
import { updateNoteStepDefinition } from './update_note_step/update_note_step';
import { createRuleStepDefinition } from './create_rule_step/create_rule_step';
import { patchRuleStepDefinition } from './patch_rule_step/patch_rule_step';
import { createIsolateHostStepDefinition } from './isolate_host_step/isolate_host_step';
import { createKillProcessStepDefinition } from './kill_process_step/kill_process_step';
import { createSuspendProcessStepDefinition } from './suspend_process_step/suspend_process_step';

/**
 * Registers all security workflow steps with the workflowsExtensions plugin.
 */
export const registerWorkflowSteps = (
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup,
  endpointAppContextService: EndpointAppContextService,
  experimentalFeatures: ExperimentalFeatures
): void => {
  workflowsExtensions.registerStepDefinition(renderAlertNarrativeStepDefinition);
  workflowsExtensions.registerStepDefinition(buildAlertEntityGraphStepDefinition);
  workflowsExtensions.registerStepDefinition(setAlertStatusStepDefinition);
  workflowsExtensions.registerStepDefinition(setAlertTagsStepDefinition);
  workflowsExtensions.registerStepDefinition(assignAlertStepDefinition);
  workflowsExtensions.registerStepDefinition(assignAttackStepDefinition);
  workflowsExtensions.registerStepDefinition(setAttackStatusStepDefinition);
  workflowsExtensions.registerStepDefinition(setAttackTagsStepDefinition);
  workflowsExtensions.registerStepDefinition(enableRuleStepDefinition);
  workflowsExtensions.registerStepDefinition(disableRuleStepDefinition);
  workflowsExtensions.registerStepDefinition(createRuleExceptionStepDefinition);
  workflowsExtensions.registerStepDefinition(createExceptionListItemStepDefinition);
  workflowsExtensions.registerStepDefinition(createNoteStepDefinition);
  workflowsExtensions.registerStepDefinition(deleteNoteStepDefinition);
  workflowsExtensions.registerStepDefinition(getNotesStepDefinition);
  workflowsExtensions.registerStepDefinition(updateNoteStepDefinition);
  workflowsExtensions.registerStepDefinition(createRuleStepDefinition);
  workflowsExtensions.registerStepDefinition(patchRuleStepDefinition);
  if (experimentalFeatures.endpointResponseActionsWorkflowStepsEnabled) {
    workflowsExtensions.registerStepDefinition(
      createIsolateHostStepDefinition(endpointAppContextService)
    );
    workflowsExtensions.registerStepDefinition(
      createKillProcessStepDefinition(endpointAppContextService)
    );
    workflowsExtensions.registerStepDefinition(
      createSuspendProcessStepDefinition(endpointAppContextService)
    );
  }
};
