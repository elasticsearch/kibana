/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { CoreStart } from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { ContextEnginePluginStart } from '@kbn/context-engine-plugin/server';
import { createSaveAutomationTool } from './save_automation/tool';
import { createListAiIndicesTool } from './list_ai_indices/tool';
import { createDescribeAiIndexTool } from './describe_ai_index/tool';
import { createQueryAiIndicesTool } from './query_ai_indices/tool';

type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];

export const registerAgentBuilderTools = ({
  agentBuilder,
  getContextEngineStart,
  getCoreStart,
  getSecurityStart,
  getWorkflowsManagement,
}: {
  agentBuilder: AgentBuilderPluginSetup;
  getContextEngineStart: () => Promise<ContextEnginePluginStart>;
  getCoreStart: () => Promise<CoreStart>;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
  getWorkflowsManagement: () => WorkflowsManagementApi;
}): void => {
  agentBuilder.tools.register(
    createSaveAutomationTool({
      getAiIndexService: async () => (await getContextEngineStart()).getAiIndexService(),
      getCoreStart,
      getSecurityStart,
      getWorkflowsManagement,
    })
  );

  const aiIndexToolDeps = { getContextEngineStart, getSecurityStart };
  agentBuilder.tools.register(createListAiIndicesTool(aiIndexToolDeps));
  agentBuilder.tools.register(createDescribeAiIndexTool(aiIndexToolDeps));
  agentBuilder.tools.register(createQueryAiIndicesTool(aiIndexToolDeps));
};
