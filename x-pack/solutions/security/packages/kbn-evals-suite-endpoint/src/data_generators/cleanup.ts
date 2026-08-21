/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';

const EVAL_SEEDED_INDICES = [
  'metrics-endpoint.metadata-default',
  'metrics-endpoint.metadata_current_*',
  '.metrics-endpoint.metadata_united_*',
  'logs-elastic_agent.endpoint_security-default',
  'logs-endpoint.alerts-default',
  'logs-endpoint.events.process-default',
  'logs-endpoint.events.file-default',
  'logs-endpoint.events.network-default',
  'logs-endpoint.events.registry-default',
  'metrics-endpoint.metrics-default',
  'metrics-endpoint.policy-default',
];

const RESTRICTED_INDICES = ['.fleet-agents'];

/**
 * Suite id namespaces MUST stay disjoint: neither prefix may be a prefix of the
 * other, or an ES `prefix` delete on one reclaims the other suite's documents.
 */
export const TROUBLESHOOTING_AGENT_ID_PREFIX = 'eval-agent-ts-';
export const FORENSIC_AGENT_ID_PREFIX = 'eval-agent-forensic-';
export const POLICY_MANAGEMENT_AGENT_ID_PREFIX = 'eval-agent-pm-';

interface CleanupClients {
  esClient: Client;
  internalEsClient: Client;
}

async function cleanupSeededData({
  esClient,
  internalEsClient,
  agentIdPrefix,
}: CleanupClients & {
  agentIdPrefix: string;
}): Promise<void> {
  const deleteQuery = { prefix: { 'agent.id': agentIdPrefix } };

  await Promise.all([
    ...EVAL_SEEDED_INDICES.map((index) =>
      esClient
        .deleteByQuery({ index, query: deleteQuery, refresh: true, ignore_unavailable: true })
        .catch(() => {})
    ),
    ...RESTRICTED_INDICES.map((index) =>
      internalEsClient
        .deleteByQuery({ index, query: deleteQuery, refresh: true, ignore_unavailable: true })
        .catch(() => {})
    ),
  ]);
}

export async function cleanupTroubleshootingData(clients: CleanupClients): Promise<void> {
  return cleanupSeededData({ ...clients, agentIdPrefix: TROUBLESHOOTING_AGENT_ID_PREFIX });
}

export async function cleanupForensicData(clients: CleanupClients): Promise<void> {
  return cleanupSeededData({ ...clients, agentIdPrefix: FORENSIC_AGENT_ID_PREFIX });
}

export async function cleanupPolicyManagementSeededData(clients: CleanupClients): Promise<void> {
  return cleanupSeededData({ ...clients, agentIdPrefix: POLICY_MANAGEMENT_AGENT_ID_PREFIX });
}
