/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginInitializerContext } from '@kbn/core/server';
export { config } from './config';

//  This exports static code and TypeScript types,
//  as well as, Kibana Platform `plugin()` initializer.

export async function plugin(initializerContext: PluginInitializerContext) {
  const { WorkflowsPlugin } = await import('./plugin');
  return new WorkflowsPlugin(initializerContext);
}

export type { WorkflowsServerPluginSetup, WorkflowsServerPluginStart } from './types';
export type {
  BulkScheduleWorkflowItem,
  WorkflowsManagementApi,
} from './api/workflows_management_api';
export type { ValidateWorkflowRequestOptions } from '../common/lib/validate_workflow_yaml';
