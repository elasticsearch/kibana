/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { ContextEnginePluginStart } from '@kbn/context-engine-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContextEngineAgentBuilderPluginSetup {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContextEngineAgentBuilderPluginStart {}

export interface ContextEngineAgentBuilderSetupDependencies {
  agentBuilder: AgentBuilderPluginSetup;
  workflowsManagement: WorkflowsServerPluginSetup;
}

export interface ContextEngineAgentBuilderStartDependencies {
  contextEngine: ContextEnginePluginStart;
  security: SecurityPluginStart;
  spaces?: SpacesPluginStart;
}
