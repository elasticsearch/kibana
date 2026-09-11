/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';
import type { ExperimentalFeatures } from '../../../common/experimental_features';

/**
 * Registers all security workflow steps with the workflowsExtensions plugin.
 */
export const registerWorkflowSteps = (
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup,
  experimentalFeatures: ExperimentalFeatures
): void => {
  workflowsExtensions.registerStepDefinition(() =>
    import('./render_alert_narrative_step').then((m) => m.renderAlertNarrativeStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./build_alert_entity_graph_step').then((m) => m.buildAlertEntityGraphStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./assign_alert_step/assign_alert_step').then((m) => m.assignAlertStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./set_alert_status_step/set_alert_status_step').then(
      (m) => m.setAlertStatusStepDefinition
    )
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./set_alert_tags_step/set_alert_tags_step').then((m) => m.setAlertTagsStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./assign_attack_step/assign_attack_step').then((m) => m.assignAttackStepDefinition)
  );
  workflowsExtensions.registerStepDefinition(() =>
    import('./set_attack_status_step/set_attack_status_step').then(
      (m) => m.setAttackStatusStepDefinition
    )
  );
  workflowsExtensions.registerStepDefinition(() =>
    import('./set_attack_tags_step/set_attack_tags_step').then((m) => m.setAttackTagsStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./enable_rule_step/enable_rule_step').then((m) => m.enableRuleStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./disable_rule_step/disable_rule_step').then((m) => m.disableRuleStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./create_rule_exception_step/create_rule_exception_step').then(
      (m) => m.createRuleExceptionStepDefinition
    )
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./create_exception_list_item_step/create_exception_list_item_step').then(
      (m) => m.createExceptionListItemStepDefinition
    )
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./create_note_step/create_note_step').then((m) => m.createNoteStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./delete_note_step/delete_note_step').then((m) => m.deleteNoteStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./get_notes_step/get_notes_step').then((m) => m.getNotesStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./update_note_step/update_note_step').then((m) => m.updateNoteStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./create_rule_step/create_rule_step').then((m) => m.createRuleStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./patch_rule_step/patch_rule_step').then((m) => m.patchRuleStepDefinition)
  );

  if (experimentalFeatures.endpointResponseActionsWorkflowStepsEnabled) {
    workflowsExtensions.registerStepDefinition(() =>
      import('./isolate_host_step/isolate_host_step').then((m) => m.isolateHostStepDefinition)
    );

    workflowsExtensions.registerStepDefinition(() =>
      import('./kill_process_step/kill_process_step').then((m) => m.killProcessStepDefinition)
    );

    workflowsExtensions.registerStepDefinition(() =>
      import('./suspend_process_step/suspend_process_step').then(
        (m) => m.suspendProcessStepDefinition
      )
    );
  }
};
