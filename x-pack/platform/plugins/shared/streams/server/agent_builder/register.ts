/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { StreamsServer } from '../types';
import type { GetScopedClients } from '../routes/types';
import type { EbtTelemetryClient } from '../lib/telemetry/ebt';
import type { StreamsKIsOnboardingClient } from '../lib/workflows/onboarding_workflow_client';
import { MemoryServiceImpl } from '../lib/memory';
import type { MemoryToolsOptions } from './tools/memory';
import { registerAgentBuilderTools } from './tools/register_tools';
import { registerAgentBuilderSkills } from './skills/register_skills';
import { registerAgentBuilderAttachments } from './attachments/register_attachments';
import { registerSignificantEventsDiscoveryAgents } from './agents/discovery';
import { registerInvestigationAgents } from './agents/investigation';
import { streamsInvestigationManagementSkill } from './skills/investigation_management';

export const createMemoryToolsOptions = ({
  getScopedClients,
  server,
  logger,
}: {
  getScopedClients: GetScopedClients;
  server: StreamsServer;
  logger: Logger;
}): MemoryToolsOptions => {
  const getMemoryService = (esClient: ElasticsearchClient) =>
    new MemoryServiceImpl({
      logger: logger.get('memory'),
      esClient,
    });

  return {
    getMemoryService,
    getSecurity: () => server.core.security,
    getScopedClients,
    server,
    logger,
  };
};

export const registerStreamsAgentBuilder = async ({
  agentBuilder,
  getScopedClients,
  server,
  logger,
  telemetry,
  streamsKIsOnboardingClient,
  investigationEnabled = false,
}: {
  agentBuilder: AgentBuilderPluginSetup;
  getScopedClients: GetScopedClients;
  server: StreamsServer;
  logger: Logger;
  telemetry: EbtTelemetryClient;
  streamsKIsOnboardingClient?: StreamsKIsOnboardingClient;
  investigationEnabled?: boolean;
}): Promise<void> => {
  const memoryToolsOptions = createMemoryToolsOptions({ getScopedClients, server, logger });

  registerAgentBuilderAttachments({ agentBuilder, getScopedClients, logger });
  registerAgentBuilderTools({ agentBuilder, getScopedClients, server, logger, telemetry });
  registerAgentBuilderSkills({
    agentBuilder,
    telemetry,
    streamsKIsOnboardingClient,
    memoryToolsOptions,
  });
  registerSignificantEventsDiscoveryAgents({ agentBuilder, server });
  if (investigationEnabled) {
    agentBuilder.skills.register(streamsInvestigationManagementSkill);
    registerInvestigationAgents(agentBuilder);
  }
};
