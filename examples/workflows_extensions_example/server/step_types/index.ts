/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import { setVarStepDefinition } from './setvar_step';
import { externalStepDefinition } from './external_step';
import { durablePollStepDefinition } from './durable_poll_step';
import { pollOnlyJobStepDefinition } from './poll_only_job_step';

const asyncFeatureFlagExample = () => Promise.resolve(true);

export const registerStepDefinitions = (
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup
) => {
  workflowsExtensions.registerStepDefinition(setVarStepDefinition);
  workflowsExtensions.registerStepDefinition(durablePollStepDefinition);
  workflowsExtensions.registerStepDefinition(pollOnlyJobStepDefinition);
  workflowsExtensions.registerStepDefinition(async () => {
    const isFeatureFlagEnabled = await asyncFeatureFlagExample();
    if (!isFeatureFlagEnabled) {
      return undefined; // Skip step registration
    }
    return externalStepDefinition;
  });
};
