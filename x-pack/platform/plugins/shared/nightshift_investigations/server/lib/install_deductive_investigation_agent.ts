/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AgentAccessControlMode } from '@kbn/agent-builder-common';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { AgentAvailabilityConfig } from '@kbn/agent-builder-server/agents';
import {
  DEDUCTIVE_INVESTIGATION_AGENT_DESCRIPTION,
  DEDUCTIVE_INVESTIGATION_AGENT_NAME,
  NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID,
  NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_TYPE_ID,
} from '../agents/deductive_investigation';

export const installDeductiveInvestigationAgent = async ({
  agentBuilder,
  spaceId,
  availability,
}: {
  agentBuilder: AgentBuilderPluginStart;
  spaceId: string;
  availability?: AgentAvailabilityConfig;
}): Promise<void> => {
  await agentBuilder.agents.ensure({
    spaceId,
    availability,
    agent: {
      id: NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID,
      type: NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_TYPE_ID,
      name: DEDUCTIVE_INVESTIGATION_AGENT_NAME,
      description: DEDUCTIVE_INVESTIGATION_AGENT_DESCRIPTION,
      labels: ['observability', 'significant-events', 'investigation', 'cortex', 'sandbox'],
      avatar_symbol: 'ND',
      access_control: { access_mode: AgentAccessControlMode.Public },
      configuration: {
        tools: [],
        skill_ids: [],
        connector_ids: [],
      },
    },
  });
};
