/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { OBSERVABLE_TYPE_IPV4 } from '../../common/constants';
import {
  addAlertsStepDefinition,
  addCommentStepDefinition,
  addEventsStepDefinition,
  addObservablesStepDefinition,
  addTagsStepDefinition,
  removeTagsStepDefinition,
  assignCaseStepDefinition,
  closeCaseStepDefinition,
  deleteCasesStepDefinition,
  deleteObservableStepDefinition,
  findSimilarCasesStepDefinition,
  findCasesStepDefinition,
  getAllAttachmentsStepDefinition,
  getCasesByAlertIdStepDefinition,
  getCasesStepDefinition,
  setDescriptionStepDefinition,
  setSeverityStepDefinition,
  setStatusStepDefinition,
  setTitleStepDefinition,
  unassignCaseStepDefinition,
  updateObservableStepDefinition,
} from './simple_steps';
import { setCategoryStepDefinition } from './set_category';

describe('new cases public step definitions', () => {
  const steps = [
    addCommentStepDefinition,
    setSeverityStepDefinition,
    setStatusStepDefinition,
    closeCaseStepDefinition,
    deleteCasesStepDefinition,
    assignCaseStepDefinition,
    unassignCaseStepDefinition,
    addAlertsStepDefinition,
    addEventsStepDefinition,
    findSimilarCasesStepDefinition,
    findCasesStepDefinition,
    setDescriptionStepDefinition,
    setTitleStepDefinition,
    addObservablesStepDefinition,
    addTagsStepDefinition,
    removeTagsStepDefinition,
    setCategoryStepDefinition,
    getCasesByAlertIdStepDefinition,
    getAllAttachmentsStepDefinition,
    updateObservableStepDefinition,
    deleteObservableStepDefinition,
    getCasesStepDefinition,
  ];

  it.each(steps)('returns expected metadata for %s', (definition) => {
    expect(definition.id.startsWith('cases.')).toBe(true);
    expect(definition.category).toBe('kibana.cases');
    expect(definition.documentation?.examples?.length).toBeGreaterThan(0);
  });

  it('uses the shared addObservables built-in typeKey schema', () => {
    expect(
      addObservablesStepDefinition.inputSchema.safeParse({
        case_id: 'case-1',
        observables: [{ typeKey: OBSERVABLE_TYPE_IPV4.key, value: '10.0.0.8' }],
      }).success
    ).toBe(true);

    expect(
      addObservablesStepDefinition.inputSchema.safeParse({
        case_id: 'case-1',
        observables: [{ typeKey: 'ip', value: '10.0.0.8' }],
      }).success
    ).toBe(false);
  });
});
