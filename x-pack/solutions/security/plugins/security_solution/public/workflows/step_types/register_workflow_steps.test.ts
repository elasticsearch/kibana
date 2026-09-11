/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/public/mocks';
import { allowedExperimentalValues } from '../../../common/experimental_features';
import { registerWorkflowSteps } from './register_workflow_steps';
import { renderAlertNarrativeStepDefinition } from './render_alert_narrative_step';
import { buildAlertEntityGraphStepDefinition } from './build_alert_entity_graph_step';
import { assignAlertStepDefinition } from './assign_alert_step/assign_alert_step';
import { setAlertStatusStepDefinition } from './set_alert_status_step/set_alert_status_step';
import { setAlertTagsStepDefinition } from './set_alert_tags_step/set_alert_tags_step';
import { assignAttackStepDefinition } from './assign_attack_step/assign_attack_step';
import { setAttackStatusStepDefinition } from './set_attack_status_step/set_attack_status_step';
import { setAttackTagsStepDefinition } from './set_attack_tags_step/set_attack_tags_step';
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
import { isolateHostStepDefinition } from './isolate_host_step/isolate_host_step';
import { killProcessStepDefinition } from './kill_process_step/kill_process_step';
import { suspendProcessStepDefinition } from './suspend_process_step/suspend_process_step';

type StepLoader = () => Promise<PublicStepDefinition | undefined>;

const createWorkflowsExtensionsMock = workflowsExtensionsMock.createSetup;

const flagOff = {
  ...allowedExperimentalValues,
  endpointResponseActionsWorkflowStepsEnabled: false,
};
const flagOn = { ...allowedExperimentalValues, endpointResponseActionsWorkflowStepsEnabled: true };

describe('registerWorkflowSteps (public)', () => {
  describe('endpointResponseActionsWorkflowStepsEnabled: false (default)', () => {
    it('registers only the base 18 steps', () => {
      const workflowsExtensions = createWorkflowsExtensionsMock();

      registerWorkflowSteps(workflowsExtensions, flagOff);

      expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledTimes(18);
      expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(expect.any(Function));
    });

    it('async loaders resolve to each base step definition', async () => {
      const workflowsExtensions = createWorkflowsExtensionsMock();

      registerWorkflowSteps(workflowsExtensions, flagOff);

      const [
        loader1,
        loader2,
        loader3,
        loader4,
        loader5,
        loader6,
        loader7,
        loader8,
        loader9,
        loader10,
        loader11,
        loader12,
        loader13,
        loader14,
        loader15,
        loader16,
        loader17,
        loader18,
      ] = workflowsExtensions.registerStepDefinition.mock.calls.map(([arg]) => arg as StepLoader);

      await expect(loader1()).resolves.toBe(renderAlertNarrativeStepDefinition);
      await expect(loader2()).resolves.toBe(buildAlertEntityGraphStepDefinition);
      await expect(loader3()).resolves.toBe(assignAlertStepDefinition);
      await expect(loader4()).resolves.toBe(setAlertStatusStepDefinition);
      await expect(loader5()).resolves.toBe(setAlertTagsStepDefinition);
      await expect(loader6()).resolves.toBe(assignAttackStepDefinition);
      await expect(loader7()).resolves.toBe(setAttackStatusStepDefinition);
      await expect(loader8()).resolves.toBe(setAttackTagsStepDefinition);
      await expect(loader9()).resolves.toBe(enableRuleStepDefinition);
      await expect(loader10()).resolves.toBe(disableRuleStepDefinition);
      await expect(loader11()).resolves.toBe(createRuleExceptionStepDefinition);
      await expect(loader12()).resolves.toBe(createExceptionListItemStepDefinition);
      await expect(loader13()).resolves.toBe(createNoteStepDefinition);
      await expect(loader14()).resolves.toBe(deleteNoteStepDefinition);
      await expect(loader15()).resolves.toBe(getNotesStepDefinition);
      await expect(loader16()).resolves.toBe(updateNoteStepDefinition);
      await expect(loader17()).resolves.toBe(createRuleStepDefinition);
      await expect(loader18()).resolves.toBe(patchRuleStepDefinition);
    });
  });

  describe('endpointResponseActionsWorkflowStepsEnabled: true', () => {
    it('registers all 21 steps including the endpoint response-action steps', () => {
      const workflowsExtensions = createWorkflowsExtensionsMock();

      registerWorkflowSteps(workflowsExtensions, flagOn);

      expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledTimes(21);
      expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(expect.any(Function));
    });

    it('async loaders resolve to all step definitions including endpoint response-action steps', async () => {
      const workflowsExtensions = createWorkflowsExtensionsMock();

      registerWorkflowSteps(workflowsExtensions, flagOn);

      const [
        loader1,
        loader2,
        loader3,
        loader4,
        loader5,
        loader6,
        loader7,
        loader8,
        loader9,
        loader10,
        loader11,
        loader12,
        loader13,
        loader14,
        loader15,
        loader16,
        loader17,
        loader18,
        loader19,
        loader20,
        loader21,
      ] = workflowsExtensions.registerStepDefinition.mock.calls.map(([arg]) => arg as StepLoader);

      await expect(loader1()).resolves.toBe(renderAlertNarrativeStepDefinition);
      await expect(loader2()).resolves.toBe(buildAlertEntityGraphStepDefinition);
      await expect(loader3()).resolves.toBe(assignAlertStepDefinition);
      await expect(loader4()).resolves.toBe(setAlertStatusStepDefinition);
      await expect(loader5()).resolves.toBe(setAlertTagsStepDefinition);
      await expect(loader6()).resolves.toBe(assignAttackStepDefinition);
      await expect(loader7()).resolves.toBe(setAttackStatusStepDefinition);
      await expect(loader8()).resolves.toBe(setAttackTagsStepDefinition);
      await expect(loader9()).resolves.toBe(enableRuleStepDefinition);
      await expect(loader10()).resolves.toBe(disableRuleStepDefinition);
      await expect(loader11()).resolves.toBe(createRuleExceptionStepDefinition);
      await expect(loader12()).resolves.toBe(createExceptionListItemStepDefinition);
      await expect(loader13()).resolves.toBe(createNoteStepDefinition);
      await expect(loader14()).resolves.toBe(deleteNoteStepDefinition);
      await expect(loader15()).resolves.toBe(getNotesStepDefinition);
      await expect(loader16()).resolves.toBe(updateNoteStepDefinition);
      await expect(loader17()).resolves.toBe(createRuleStepDefinition);
      await expect(loader18()).resolves.toBe(patchRuleStepDefinition);
      await expect(loader19()).resolves.toBe(isolateHostStepDefinition);
      await expect(loader20()).resolves.toBe(killProcessStepDefinition);
      await expect(loader21()).resolves.toBe(suspendProcessStepDefinition);
    });
  });
});
