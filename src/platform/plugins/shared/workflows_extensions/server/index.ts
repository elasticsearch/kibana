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

// This exports static code and TypeScript types,
// as well as, Kibana Platform `plugin()` initializer.

export async function plugin(initializerContext: PluginInitializerContext) {
  const { WorkflowsExtensionsServerPlugin } = await import('./plugin');
  return new WorkflowsExtensionsServerPlugin(initializerContext);
}

export type {
  ServerTriggerDefinition,
  WorkflowsExtensionsRequestHandlerContext,
  WorkflowsExtensionsServerPluginSetup,
  WorkflowsExtensionsServerPluginStart,
  WorkflowsExtensionsServerPluginSetupDeps,
  WorkflowsExtensionsServerPluginStartDeps,
} from './types';

export type { EventChainContext } from './event_chain_context';

export {
  EVENT_CHAIN_DEPTH_HEADER,
  EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER,
  EVENT_CHAIN_VISITED_WORKFLOW_IDS_HEADER,
  EVENT_CHAIN_SOURCE_EXECUTION_HEADER,
  WORKFLOW_EVENT_CHAIN_CONTEXT,
  X_ELASTIC_INTERNAL_ORIGIN_REQUEST,
  getEmitterWorkflowExecutionIdFromRequest,
  getEventChainContext,
  getEventChainDepthFromHeaders,
  getOutboundEventChainHeaders,
  setWorkflowEventChainContext,
} from './event_chain_context';

export type {
  ServerStepDefinition,
  ServerHandlerStepDefinition,
  ServerPollStepDefinition,
  StepHandler,
  StepHandlerContext,
  StepHandlerResult,
  OnCancelHandler,
  StartWithHandoffHandler,
  PollHandler,
  PollHandlerContext,
  PollPolicy,
  PollCeilings,
  PhaseDoneResult,
  PhaseErrorResult,
  DurablePhaseResult,
  PollContinueResult,
  CommonServerStepDefinition,
} from './step_registry/types';

export { isOneShotStepDefinition, isPollStepDefinition } from './step_registry/types';

export { KibanaApiCallError } from './step_registry/call_kibana_api_error';

export {
  createServerStepDefinition,
  createPollServerStepDefinition,
  PollStepDefaults,
} from './step_registry/types';

export { TriggerRegistry } from './trigger_registry';

export { WORKFLOW_EXECUTION_FAILED_TRIGGER_ID } from './triggers';
export type { WorkflowExecutionFailedEvent } from './triggers';
