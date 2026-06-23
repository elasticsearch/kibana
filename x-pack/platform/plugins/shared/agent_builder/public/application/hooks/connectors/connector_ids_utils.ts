/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

interface AgentWithConnectorIds {
  configuration?: { connector_ids?: string[] | null } | null;
}

/**
 * Returns true if the given connector is accessible to the agent.
 *
 * connector_ids === undefined/null is the legacy "all connectors" default: agents created before
 * explicit connector assignment had unrestricted access. An explicit empty array means no connectors.
 */
export const agentHasConnector = (agent: AgentWithConnectorIds, connectorId: string): boolean => {
  const { connector_ids: connectorIds } = agent.configuration ?? {};
  return connectorIds == null || connectorIds.includes(connectorId);
};

/**
 * Returns the effective connector IDs for an agent, expanding undefined/null to the full list.
 */
export const getEffectiveConnectorIds = (
  agent: AgentWithConnectorIds,
  allConnectorIds: string[]
): string[] => {
  const { connector_ids: connectorIds } = agent.configuration ?? {};
  return connectorIds ?? allConnectorIds;
};
