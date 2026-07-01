/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { ServerStepDefinition } from '@kbn/workflows-extensions/server';

import type { CasesClient } from '../client';

import { getCaseStepDefinition } from './steps/get_case';
import { createCaseStepDefinition } from './steps/create_case';
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
import { getCasesByAlertIdStepDefinition } from './steps/get_cases_by_alert_id';
import { getAllAttachmentsStepDefinition } from './steps/get_all_attachments';
import { updateObservableStepDefinition } from './steps/update_observable';
import { deleteObservableStepDefinition } from './steps/delete_observable';
import { getCasesStepDefinition } from './steps/get_cases';
import { createCaseFromTemplateStepDefinition } from './steps/create_case_from_template';
import { setCustomFieldStepDefinition } from './steps/set_custom_field';
import { removeTagsStepDefinition } from './steps/remove_tags';
import { pushCasesStepDefinition } from './steps/push_cases';
import {
  assignCaseStepDefinition,
  closeCaseStepDefinition,
  setCategoryStepDefinition,
  setDescriptionStepDefinition,
  setSeverityStepDefinition,
  setStatusStepDefinition,
  setTitleStepDefinition,
} from './steps/simple_steps';

type GetCasesClientFn = (request: KibanaRequest) => Promise<CasesClient>;

type CasesStepFactory = (getCasesClient: GetCasesClientFn) => ServerStepDefinition;

/**
 * Single source of truth for all active Cases workflow steps.
 * Adding a new step here registers it in the workflow engine automatically.
 */
export const casesStepRegistry: CasesStepFactory[] = [
  getCaseStepDefinition,
  createCaseStepDefinition,
  updateCaseStepDefinition,
  updateCasesStepDefinition,
  addCommentStepDefinition,
  findCasesStepDefinition,
  setSeverityStepDefinition,
  setStatusStepDefinition,
  closeCaseStepDefinition,
  deleteCasesStepDefinition,
  assignCaseStepDefinition,
  unassignCaseStepDefinition,
  addAlertsStepDefinition,
  addEventsStepDefinition,
  findSimilarCasesStepDefinition,
  setDescriptionStepDefinition,
  setTitleStepDefinition,
  addObservablesStepDefinition,
  addTagsStepDefinition,
  setCategoryStepDefinition,
  getCasesByAlertIdStepDefinition,
  getAllAttachmentsStepDefinition,
  updateObservableStepDefinition,
  deleteObservableStepDefinition,
  getCasesStepDefinition,
  setCustomFieldStepDefinition,
  createCaseFromTemplateStepDefinition,
  removeTagsStepDefinition,
  pushCasesStepDefinition,
];
