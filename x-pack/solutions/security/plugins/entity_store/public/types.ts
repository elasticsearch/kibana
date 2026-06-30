/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DeveloperExamplesSetup } from '@kbn/developer-examples-plugin/public';
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';

export interface AppPluginSetupDependencies {
  developerExamples: DeveloperExamplesSetup;
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup;
}
