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
  const { WorkflowsExecutionEnginePlugin } = await import('./plugin');
  return new WorkflowsExecutionEnginePlugin(initializerContext);
}

export type {
  DataClient,
  GetStepExecutionsByIdsOptions,
  GetWorkflowExecutionsByIdsOptions,
  StepExecutionsDataClient,
  TriggerEventsContract,
  WorkflowExecutionsDataClient,
  WorkflowsExecutionEnginePluginSetup,
  WorkflowsExecutionEnginePluginStart,
  ExecuteWorkflowOptions,
  ExecuteWorkflowResponse,
  WorkflowExecutionMode,
} from './types';

export { getStepExecutionsByWorkflowExecution } from './repositories/data_access_layer/lib/get_step_executions_by_workflow_execution';
export { classifyWorkflowTriggerMatch } from './trigger_events/filter_workflows_by_trigger_condition';

export {
  registerHitlLifecycleAuditor,
  type HitlLifecycleAuditor,
  type HitlLifecycleEvent,
} from './step/wait_for_input_step/hitl_lifecycle_auditor';

export type {
  LogsRepository,
  WorkflowLogEvent,
  LogSearchResult,
  SearchLogsParams,
} from './repositories/logs_repository';

export type { IWorkflowEventLoggerService } from './workflow_event_logger';

export { resolveWorkflowEventsModeFromOn } from './trigger_events/lib/resolve_workflow_events_mode_from_on';

export type {
  SearchTriggerEventLogHit,
  SearchTriggerEventLogParams,
  SearchTriggerEventLogResult,
} from './trigger_events/event_logs/trigger_event_log_query';
