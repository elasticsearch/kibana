/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup } from '@kbn/core/server';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { apiPrivileges } from '@kbn/context-engine-plugin/common/features';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { registerAgentBuilderTools } from './agent_builder/tools';
import { registerAttachmentTypes } from './attachment_types';
import type {
  ContextEngineAgentBuilderPluginStart,
  ContextEngineAgentBuilderStartDependencies,
} from './types';

type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];

export const registerContextEngineAgentBuilderIntegration = ({
  coreSetup,
  agentBuilder,
  workflowsManagement,
}: {
  coreSetup: CoreSetup<
    ContextEngineAgentBuilderStartDependencies,
    ContextEngineAgentBuilderPluginStart
  >;
  agentBuilder: AgentBuilderPluginSetup;
  workflowsManagement: WorkflowsManagementApi;
}): void => {
  registerAttachmentTypes(agentBuilder);

  agentBuilder.agents.registerAiIndexResolver(async ({ ids, request }) => {
    const [coreStart, startDeps] = await coreSetup.getStartServices();
    const { contextEngine, security } = startDeps;

    // Registry reads use the internal user, so re-check CE's read privilege for the caller. One
    // space-aware check covers every id, as in CE's list route.
    const checkPrivileges = security.authz.checkPrivilegesDynamicallyWithRequest(request);
    const { hasAllRequested } = await checkPrivileges({
      kibana: [security.authz.actions.api.get(apiPrivileges.readContextEngine)],
    });
    if (!hasAllRequested) {
      return [];
    }

    // Same visibility rule as the list route; only requested ids are probed.
    const aiIndices = await contextEngine
      .getAiIndexDataReadService({
        esClient: coreStart.elasticsearch.client.asScoped(request).asCurrentUser,
        request,
      })
      .listVisible(ids);
    return aiIndices.map((aiIndex) => ({
      id: aiIndex.id,
      esqlTarget: aiIndex.dest.value,
      description: aiIndex.description,
    }));
  });

  registerAgentBuilderTools({
    agentBuilder,
    getCoreStart: async () => {
      const [coreStart] = await coreSetup.getStartServices();
      return coreStart;
    },
    getSecurityStart: async () => {
      const [, startDeps] = await coreSetup.getStartServices();
      return startDeps.security;
    },
    getWorkflowsManagement: () => workflowsManagement,
    getAiIndexService: async () => {
      const [, startDeps] = await coreSetup.getStartServices();
      return startDeps.contextEngine.getAiIndexService();
    },
  });
};
