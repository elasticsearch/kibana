/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { CasesServerSetupDependencies } from '../types';
import type { CasesClient } from '../client';

import { casesStepRegistry } from './registry';

export function registerCaseWorkflowSteps(
  workflowsExtensions: CasesServerSetupDependencies['workflowsExtensions'],
  getCasesClient: (request: KibanaRequest) => Promise<CasesClient>
) {
  if (!workflowsExtensions) {
    return;
  }

  for (const factory of casesStepRegistry) {
    workflowsExtensions.registerStepDefinition(factory(getCasesClient));
  }
}
