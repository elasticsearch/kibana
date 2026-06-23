/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { CasesServerSetupDependencies } from '../types';
import type { CasesClient } from '../client';

import { getCaseStepDefinition } from './steps/get_case';
import { createCaseStepDefinition } from './steps/create_case';
import { createCaseFromTemplateStepDefinition } from './steps/create_case_from_template';
import { updateCaseStepDefinition } from './steps/update_case';
import { updateCasesStepDefinition } from './steps/update_cases';
import { addCommentStepDefinition } from './steps/add_comment';
import { findCasesStepDefinition } from './steps/find_cases';
import { deleteCasesStepDefinition } from './steps/delete_cases';
import { unassignCaseStepDefinition } from './steps/unassign_case';
import { addAlertsStepDefinition } from './steps/add_alerts';
import { addEventsStepDefinition } from './steps/add_events';
import { findSimilarCasesStepDefinition } from './steps/find_similar_cases';
import { addObservablesStepDefinition } from './steps/add_observables';
import { addTagsStepDefinition } from './steps/add_tags';
import { removeTagsStepDefinition } from './steps/remove_tags';
import { getCasesByAlertIdStepDefinition } from './steps/get_cases_by_alert_id';
import { getAllAttachmentsStepDefinition } from './steps/get_all_attachments';
import { updateObservableStepDefinition } from './steps/update_observable';
import { deleteObservableStepDefinition } from './steps/delete_observable';
import { setCustomFieldStepDefinition } from './steps/set_custom_field';
import { getCasesStepDefinition } from './steps/get_cases';
import {
  assignCaseStepDefinition,
  closeCaseStepDefinition,
  setCategoryStepDefinition,
  setDescriptionStepDefinition,
  setSeverityStepDefinition,
  setStatusStepDefinition,
  setTitleStepDefinition,
} from './steps/simple_steps';

export function registerCaseWorkflowSteps(
  workflowsExtensions: CasesServerSetupDependencies['workflowsExtensions'],
  getCasesClient: (request: KibanaRequest) => Promise<CasesClient>
) {
  if (!workflowsExtensions) {
    return;
  }

  workflowsExtensions.registerStepDefinition(getCaseStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(createCaseStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(createCaseFromTemplateStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(setCustomFieldStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(updateCaseStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(updateCasesStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(addCommentStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(findCasesStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(setSeverityStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(setStatusStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(closeCaseStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(deleteCasesStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(assignCaseStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(unassignCaseStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(addAlertsStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(addEventsStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(findSimilarCasesStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(setDescriptionStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(setTitleStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(addObservablesStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(addTagsStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(removeTagsStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(setCategoryStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(getCasesByAlertIdStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(getAllAttachmentsStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(updateObservableStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(deleteObservableStepDefinition(getCasesClient));
  workflowsExtensions.registerStepDefinition(getCasesStepDefinition(getCasesClient));
}
