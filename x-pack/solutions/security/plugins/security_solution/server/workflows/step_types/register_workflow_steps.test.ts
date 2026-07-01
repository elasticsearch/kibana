/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import type { ServerStepDefinition } from '@kbn/workflows-extensions/server';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';
import { registerWorkflowSteps } from './register_workflow_steps';
import { renderAlertNarrativeStepDefinition } from './render_alert_narrative_step';
import { buildAlertEntityGraphStepDefinition } from './build_alert_entity_graph_step';
import { setAlertStatusStepDefinition } from './set_alert_status_step/set_alert_status_step';
import { setAlertTagsStepDefinition } from './set_alert_tags_step/set_alert_tags_step';
import { assignAlertStepDefinition } from './assign_alert_step/assign_alert_step';
import { setAttackStatusStepDefinition } from './set_attack_status_step/set_attack_status_step';
import {
  REGISTER_ALERT_VALIDATION_STEPS_FEATURE_FLAG,
  REGISTER_ALERT_VALIDATION_STEP_FEATURE_FLAG_DEFAULT,
} from '../../../common/constants';
import type { ExperimentalFeatures } from '../../../common/experimental_features';

type StepLoader = () => Promise<ServerStepDefinition | undefined>;

const createWorkflowsExtensionsMock = workflowsExtensionsMock.createSetup;

describe('registerWorkflowSteps (server)', () => {
  const buildCoreMock = (featureFlagEnabled: boolean) => {
    const core = coreMock.createSetup();
    const coreStart = coreMock.createStart();
    coreStart.featureFlags.getBooleanValue.mockResolvedValue(featureFlagEnabled);
    core.getStartServices.mockResolvedValue([coreStart, {}, {}]);
    return { core, coreStart };
  };

  it('calls registerStepDefinition synchronously for all steps', () => {
    const { core } = buildCoreMock(true);
    const workflowsExtensions = createWorkflowsExtensionsMock();

    registerWorkflowSteps(workflowsExtensions, core, {
      publicAttacksApiEnabled: true,
    } as unknown as ExperimentalFeatures);

    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(
      setAlertStatusStepDefinition
    );
    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(
      setAlertTagsStepDefinition
    );
    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(
      assignAlertStepDefinition
    );
    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(
      setAttackStatusStepDefinition
    );
    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledTimes(6);
    // getStartServices is called once eagerly to create the shared memoized promise
    expect(core.getStartServices).toHaveBeenCalledTimes(1);
  });

  it('does not register setAttackStatusStepDefinition when publicAttacksApiEnabled is false', () => {
    const { core } = buildCoreMock(true);
    const workflowsExtensions = createWorkflowsExtensionsMock();

    registerWorkflowSteps(workflowsExtensions, core, {
      publicAttacksApiEnabled: false,
    } as unknown as ExperimentalFeatures);

    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(
      setAlertStatusStepDefinition
    );
    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(
      setAlertTagsStepDefinition
    );
    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledWith(
      assignAlertStepDefinition
    );
    expect(workflowsExtensions.registerStepDefinition).not.toHaveBeenCalledWith(
      setAttackStatusStepDefinition
    );
    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledTimes(5);
  });

  it('async loader returns step definitions when feature flag is enabled', async () => {
    const { core } = buildCoreMock(true);
    const workflowsExtensions = createWorkflowsExtensionsMock();

    registerWorkflowSteps(workflowsExtensions, core, {
      publicAttacksApiEnabled: true,
    } as unknown as ExperimentalFeatures);

    const loaders = workflowsExtensions.registerStepDefinition.mock.calls
      .map(([arg]) => arg)
      .filter((arg) => typeof arg === 'function') as StepLoader[];

    await expect(loaders[0]()).resolves.toBe(renderAlertNarrativeStepDefinition);
    await expect(loaders[1]()).resolves.toBe(buildAlertEntityGraphStepDefinition);
  });

  it('async loader returns undefined when feature flag is disabled', async () => {
    const { core } = buildCoreMock(false);
    const workflowsExtensions = createWorkflowsExtensionsMock();

    registerWorkflowSteps(workflowsExtensions, core, {
      publicAttacksApiEnabled: true,
    } as unknown as ExperimentalFeatures);

    const loaders = workflowsExtensions.registerStepDefinition.mock.calls
      .map(([arg]) => arg)
      .filter((arg) => typeof arg === 'function') as StepLoader[];

    await expect(loaders[0]()).resolves.toBeUndefined();
    await expect(loaders[1]()).resolves.toBeUndefined();
  });

  it('checks the feature flag exactly once even when both loaders resolve', async () => {
    const { core, coreStart } = buildCoreMock(true);
    const workflowsExtensions = createWorkflowsExtensionsMock();

    registerWorkflowSteps(workflowsExtensions, core, {
      publicAttacksApiEnabled: true,
    } as unknown as ExperimentalFeatures);

    const loaders = workflowsExtensions.registerStepDefinition.mock.calls
      .map(([arg]) => arg)
      .filter((arg) => typeof arg === 'function') as StepLoader[];

    await Promise.all([loaders[0](), loaders[1]()]);

    expect(coreStart.featureFlags.getBooleanValue).toHaveBeenCalledTimes(1);
    expect(coreStart.featureFlags.getBooleanValue).toHaveBeenCalledWith(
      REGISTER_ALERT_VALIDATION_STEPS_FEATURE_FLAG,
      REGISTER_ALERT_VALIDATION_STEP_FEATURE_FLAG_DEFAULT
    );
  });
});
