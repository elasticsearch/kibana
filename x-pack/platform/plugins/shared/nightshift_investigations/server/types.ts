/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { AgentBuilderPluginSetup, AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import type { ContextEnginePluginSetup } from '@kbn/context-engine-plugin/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type {
  WorkflowsExtensionsServerPluginSetup,
  WorkflowsExtensionsServerPluginStart,
} from '@kbn/workflows-extensions/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import type { RuleRegistryPluginStartContract } from '@kbn/rule-registry-plugin/server';
import type { NightshiftInvestigationsClient } from './client/investigations_client';
import type { TriggerEmitter } from './workflows/triggers/emit';

export type NightshiftInvestigationsServerSetup = void;

export interface NightshiftInvestigationsServerStart {
  getInvestigationsClient: (request: KibanaRequest) => NightshiftInvestigationsClient;
  isInvestigationAvailable: (request: KibanaRequest) => Promise<boolean>;
}

export interface NightshiftInvestigationsSetupDeps {
  agentBuilder?: AgentBuilderPluginSetup;
  contextEngine?: ContextEnginePluginSetup;
  taskManager: TaskManagerSetupContract;
  workflowsExtensions?: WorkflowsExtensionsServerPluginSetup;
  workflowsManagement?: WorkflowsServerPluginSetup;
}

export interface NightshiftInvestigationsStartDeps {
  actions?: ActionsPluginStart;
  agentBuilder?: AgentBuilderPluginStart;
  inference?: InferenceServerStart;
  ruleRegistry?: RuleRegistryPluginStartContract;
  searchInferenceEndpoints?: SearchInferenceEndpointsPluginStart;
  spaces?: SpacesPluginStart;
  taskManager: TaskManagerStartContract;
  workflowsExtensions?: WorkflowsExtensionsServerPluginStart;
}

export type GetTriggerEmitter = (request: KibanaRequest) => TriggerEmitter | undefined;
