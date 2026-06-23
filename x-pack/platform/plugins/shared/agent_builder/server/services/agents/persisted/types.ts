/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentDefinition } from '@kbn/agent-builder-common';
import type { AgentDefinitionWithPermissions } from '../../../../common/http_api/agents';
import type { AgentRef } from '../../../../common/http_api/tools';

export type PersistedAgentDefinition = Omit<AgentDefinition, 'readonly'>;
export type PersistedAgentDefinitionWithPermissions = Omit<
  AgentDefinitionWithPermissions,
  'readonly'
>;

export interface AgentsUsingToolsResult {
  agents: AgentRef[];
}

export interface AgentsUsingSkillsResult {
  agents: AgentRef[];
}
