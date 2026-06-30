/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AddAlertsStepTypeId, addAlertsStepCommonDefinition } from './add_alerts';
import { AddEventsStepTypeId, addEventsStepCommonDefinition } from './add_events';
import { AddObservablesStepTypeId, addObservablesStepCommonDefinition } from './add_observables';
import { AddTagsStepTypeId, addTagsStepCommonDefinition } from './add_tags';
import { RemoveTagsStepTypeId, removeTagsStepCommonDefinition } from './remove_tags';
import { AssignCaseStepTypeId, assignCaseStepCommonDefinition } from './assign_case';
import { CloseCaseStepTypeId, closeCaseStepCommonDefinition } from './close_case';
import { DeleteCasesStepTypeId, deleteCasesStepCommonDefinition } from './delete_cases';
import {
  FindSimilarCasesStepTypeId,
  findSimilarCasesStepCommonDefinition,
} from './find_similar_cases';
import { SetCategoryStepTypeId, setCategoryStepCommonDefinition } from './set_category';
import { SetDescriptionStepTypeId, setDescriptionStepCommonDefinition } from './set_description';
import { SetSeverityStepTypeId, setSeverityStepCommonDefinition } from './set_severity';
import { SetStatusStepTypeId, setStatusStepCommonDefinition } from './set_status';
import { SetTitleStepTypeId, setTitleStepCommonDefinition } from './set_title';
import { UnassignCaseStepTypeId, unassignCaseStepCommonDefinition } from './unassign_case';
import {
  GetCasesByAlertIdStepTypeId,
  getCasesByAlertIdStepCommonDefinition,
} from './get_cases_by_alert_id';
import {
  GetAllAttachmentsStepTypeId,
  getAllAttachmentsStepCommonDefinition,
} from './get_all_attachments';
import {
  UpdateObservableStepTypeId,
  updateObservableStepCommonDefinition,
} from './update_observable';
import {
  DeleteObservableStepTypeId,
  deleteObservableStepCommonDefinition,
} from './delete_observable';
import { GetCasesStepTypeId, getCasesStepCommonDefinition } from './get_cases';
import { PushCasesStepTypeId, pushCasesStepCommonDefinition } from './push_cases';
import {
  addAlertsInputFixture,
  addCategoryInputFixture,
  addEventsInputFixture,
  addObservablesInputFixture,
  addTagInputFixture,
  assignCaseInputFixture,
  closeCaseInputFixture,
  deleteCasesInputFixture,
  deleteCasesOutputFixture,
  createCaseResponseFixture,
  findSimilarCasesInputFixture,
  findSimilarCasesOutputFixture,
  setDescriptionInputFixture,
  setSeverityInputFixture,
  setStatusInputFixture,
  setTitleInputFixture,
  unassignCaseInputFixture,
  getCasesByAlertIdInputFixture,
  getCasesByAlertIdOutputFixture,
  getAllAttachmentsInputFixture,
  getAllAttachmentsOutputFixture,
  updateObservableInputFixture,
  deleteObservableInputFixture,
  deleteObservableOutputFixture,
  getCasesInputFixture,
  getCasesOutputFixture,
  pushCasesInputFixture,
  pushCasesOutputFixture,
} from './test_fixtures';

const singleCaseOutput = { case: createCaseResponseFixture };

const stepDefinitions = [
  {
    typeId: SetSeverityStepTypeId,
    definition: setSeverityStepCommonDefinition,
    input: setSeverityInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: SetStatusStepTypeId,
    definition: setStatusStepCommonDefinition,
    input: setStatusInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: CloseCaseStepTypeId,
    definition: closeCaseStepCommonDefinition,
    input: closeCaseInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: DeleteCasesStepTypeId,
    definition: deleteCasesStepCommonDefinition,
    input: deleteCasesInputFixture,
    output: deleteCasesOutputFixture,
  },
  {
    typeId: AssignCaseStepTypeId,
    definition: assignCaseStepCommonDefinition,
    input: assignCaseInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: UnassignCaseStepTypeId,
    definition: unassignCaseStepCommonDefinition,
    input: unassignCaseInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: AddAlertsStepTypeId,
    definition: addAlertsStepCommonDefinition,
    input: addAlertsInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: AddEventsStepTypeId,
    definition: addEventsStepCommonDefinition,
    input: addEventsInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: FindSimilarCasesStepTypeId,
    definition: findSimilarCasesStepCommonDefinition,
    input: findSimilarCasesInputFixture,
    output: findSimilarCasesOutputFixture,
  },
  {
    typeId: SetDescriptionStepTypeId,
    definition: setDescriptionStepCommonDefinition,
    input: setDescriptionInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: SetTitleStepTypeId,
    definition: setTitleStepCommonDefinition,
    input: setTitleInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: AddObservablesStepTypeId,
    definition: addObservablesStepCommonDefinition,
    input: addObservablesInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: AddTagsStepTypeId,
    definition: addTagsStepCommonDefinition,
    input: addTagInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: RemoveTagsStepTypeId,
    definition: removeTagsStepCommonDefinition,
    input: addTagInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: SetCategoryStepTypeId,
    definition: setCategoryStepCommonDefinition,
    input: addCategoryInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: GetCasesByAlertIdStepTypeId,
    definition: getCasesByAlertIdStepCommonDefinition,
    input: getCasesByAlertIdInputFixture,
    output: getCasesByAlertIdOutputFixture,
  },
  {
    typeId: GetAllAttachmentsStepTypeId,
    definition: getAllAttachmentsStepCommonDefinition,
    input: getAllAttachmentsInputFixture,
    output: getAllAttachmentsOutputFixture,
  },
  {
    typeId: UpdateObservableStepTypeId,
    definition: updateObservableStepCommonDefinition,
    input: updateObservableInputFixture,
    output: singleCaseOutput,
  },
  {
    typeId: DeleteObservableStepTypeId,
    definition: deleteObservableStepCommonDefinition,
    input: deleteObservableInputFixture,
    output: deleteObservableOutputFixture,
  },
  {
    typeId: GetCasesStepTypeId,
    definition: getCasesStepCommonDefinition,
    input: getCasesInputFixture,
    output: getCasesOutputFixture,
  },
  {
    typeId: PushCasesStepTypeId,
    definition: pushCasesStepCommonDefinition,
    input: pushCasesInputFixture,
    output: pushCasesOutputFixture,
  },
] as const;

describe('cases common step definitions', () => {
  it.each(stepDefinitions)('exposes expected id for $typeId', ({ typeId, definition }) => {
    expect(definition.id).toBe(typeId);
  });

  it.each(stepDefinitions)('accepts valid input payload for $typeId', ({ definition, input }) => {
    expect(definition.inputSchema.safeParse(input).success).toBe(true);
  });

  it.each(stepDefinitions)('accepts valid output payload for $typeId', ({ definition, output }) => {
    expect(definition.outputSchema.safeParse(output).success).toBe(true);
  });

  it('rejects non built-in observable type keys for addObservables', () => {
    expect(
      addObservablesStepCommonDefinition.inputSchema.safeParse({
        ...addObservablesInputFixture,
        observables: [{ typeKey: 'ip', value: '10.0.0.8' }],
      }).success
    ).toBe(false);
  });
});
