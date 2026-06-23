/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { registerDisableAllWorkflowsRoute } from './disable';
import { registerExecutionFieldsRoute } from './execution_fields';
import { registerExecutionOptionsListRoute } from './execution_options_list';
import { registerGetConfigRoute } from './get_config';
import { registerGetWorkflowHistoryRoute } from './get_workflow_history';
import { registerInternalSearchExecutionsRoute } from './search_executions';
import { registerTriggerEventsLogRoutes } from './trigger_events_log';
import type { RouteDependencies } from '../types';

export function registerInternalRoutes(deps: RouteDependencies) {
  registerGetConfigRoute(deps);
  registerDisableAllWorkflowsRoute(deps);
  registerExecutionOptionsListRoute(deps);
  registerExecutionFieldsRoute(deps);
  registerInternalSearchExecutionsRoute(deps);
  registerGetWorkflowHistoryRoute(deps);
  registerTriggerEventsLogRoutes(deps);
}
