/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/public/mocks';
import { registerThreatIntelligenceWorkflowSteps } from './register_workflow_steps';
import { fetchSourceStepDefinition } from './fetch_source';
import { FETCH_SOURCE_STEP_TYPE } from '../../../../common/threat_intelligence/workflows/step_types/fetch_source/fetch_source_common';

type StepLoader = () => Promise<PublicStepDefinition | undefined>;

describe('registerThreatIntelligenceWorkflowSteps (public)', () => {
  it('registers exactly one step definition for threat_intel.fetch_source', () => {
    const workflowsExtensions = workflowsExtensionsMock.createSetup();

    registerThreatIntelligenceWorkflowSteps(workflowsExtensions);

    expect(workflowsExtensions.registerStepDefinition).toHaveBeenCalledTimes(1);
  });

  it('async loader resolves to the fetch_source step definition', async () => {
    const workflowsExtensions = workflowsExtensionsMock.createSetup();

    registerThreatIntelligenceWorkflowSteps(workflowsExtensions);

    const [loader] = workflowsExtensions.registerStepDefinition.mock.calls.map(
      ([arg]) => arg as StepLoader
    );

    const definition = await loader();
    expect(definition).toBe(fetchSourceStepDefinition);
    // Sanity-check the id matches the YAML-side step type so the editor
    // can find the schema for `type: threat_intel.fetch_source`.
    expect(definition?.id).toBe(FETCH_SOURCE_STEP_TYPE);
  });
});
