/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// import { createCreateCaseFromTemplateStepDefinition } from './create_case_from_template';
import type { CasesPublicSetupDependencies } from '../types';
import { registerCasesTriggerDefinitions } from './triggers';

export function registerCasesSteps(
  workflowsExtensions: CasesPublicSetupDependencies['workflowsExtensions']
) {
  if (!workflowsExtensions) {
    return;
  }

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.getCaseStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./create_case').then((m) => m.createCaseStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.updateCaseStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.addCommentStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.updateCasesStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./set_custom_field').then((m) => m.setCustomFieldStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.findCasesStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.setSeverityStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.setStatusStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.closeCaseStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.deleteCasesStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.assignCaseStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.unassignCaseStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.addAlertsStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.addEventsStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.findSimilarCasesStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.setDescriptionStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.setTitleStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.addObservablesStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.addTagsStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.removeTagsStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./set_category').then((m) => m.setCategoryStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.getCasesByAlertIdStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.getAllAttachmentsStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.updateObservableStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.deleteObservableStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./simple_steps').then((m) => m.getCasesStepDefinition)
  );

  workflowsExtensions.registerStepDefinition(() =>
    import('./create_case_from_template').then((m) => m.createCreateCaseFromTemplateStepDefinition)
  );
}

export function registerCasesWorkflowTriggers(
  workflowsExtensions: CasesPublicSetupDependencies['workflowsExtensions']
) {
  registerCasesTriggerDefinitions(workflowsExtensions);
}
