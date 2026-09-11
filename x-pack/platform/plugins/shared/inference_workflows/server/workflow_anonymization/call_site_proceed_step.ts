/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { callSiteProceedCommonDefinition } from '../../common/workflow_anonymization';
import { getInferenceProceedCapability } from './capabilities';

export const callSiteProceedStepDefinition = createServerStepDefinition({
  ...callSiteProceedCommonDefinition,
  handler: async ({ input, capabilities, abortSignal }) => {
    const proceed = getInferenceProceedCapability(capabilities);
    const output = await proceed.invoke({ ...input, abortSignal });
    return { output };
  },
});
