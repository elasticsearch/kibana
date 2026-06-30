/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { registerCancelExecutionRoute } from './cancel_execution';
import { registerCancelWorkflowExecutionsRoute } from './cancel_workflow_executions';
import { registerGetChildrenExecutionsRoute } from './get_children_executions';
import { registerGetExecutionRoute } from './get_execution';
import { registerGetExecutionLogsRoute } from './get_execution_logs';
import { registerGetStepExecutionRoute } from './get_step_execution';
import { registerGetWorkflowExecutionsRoute } from './get_workflow_executions';
import { registerGetWorkflowStepExecutionsRoute } from './get_workflow_step_executions';
import { registerResumeExecutionRoute } from './resume_execution';
import { registerExternalResumeExecutionRoute } from './resume_execution_external';
import { registerRunWorkflowRoute } from './run_workflow';
import { registerTestStepRoute } from './test_step';
import { registerTestWorkflowRoute } from './test_workflow';
import type { RouteDependencies } from '../types';

export function registerExecutionRoutes(deps: RouteDependencies) {
  registerRunWorkflowRoute(deps);
  registerTestWorkflowRoute(deps);
  registerTestStepRoute(deps);
  registerGetWorkflowExecutionsRoute(deps);
  registerGetWorkflowStepExecutionsRoute(deps);
  registerGetExecutionRoute(deps);
  registerGetExecutionLogsRoute(deps);
  registerCancelExecutionRoute(deps);
  registerCancelWorkflowExecutionsRoute(deps);
  registerGetStepExecutionRoute(deps);
  registerResumeExecutionRoute(deps);
  registerExternalResumeExecutionRoute(deps);
  registerGetChildrenExecutionsRoute(deps);
}
