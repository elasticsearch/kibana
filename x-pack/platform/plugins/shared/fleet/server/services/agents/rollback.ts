/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';

import type { Agent } from '../../types';
import {
  AgentRollbackError,
  FleetUnauthorizedError,
  HostedAgentPolicyRestrictionRelatedError,
} from '../../errors';
import { AgentNotFoundError } from '../../errors';
import { SO_SEARCH_LIMIT } from '../../constants';
import { agentsKueryNamespaceFilter, buildFilterWithNamespace } from '../spaces/agent_namespaces';
import { getCurrentNamespace } from '../spaces/get_current_namespace';
import { licenseService } from '../license';
import { LICENSE_FOR_AGENT_ROLLBACK } from '../../../common/constants';
import { isAgentUpgrading } from '../../../common/services';

import {
  getAgentPolicyForAgent,
  getAgentsById,
  getAgentsByKuery,
  type GetAgentsOptions,
  openPointInTime,
  updateAgent,
} from './crud';
import { RollbackActionRunner } from './rollback_action_runner';
import { rollbackBatch } from './rollback_action_runner';
import { createAgentAction } from './actions';

export const NO_ROLLBACK_ERROR_MESSAGE = 'upgrade rollback not available for agent';
export const EXPIRED_ROLLBACK_ERROR_MESSAGE = 'upgrade rollback window has expired';

function checkLicense() {
  if (!licenseService.hasAtLeast(LICENSE_FOR_AGENT_ROLLBACK)) {
    throw new FleetUnauthorizedError(
      `Agent upgrade rollback requires an ${LICENSE_FOR_AGENT_ROLLBACK} license.`
    );
  }
}

export function getValidRollbacks(agent: Agent) {
  const now = new Date();
  return (agent.upgrade?.rollbacks || []).filter((rollback) => {
    const validUntil = new Date(rollback.valid_until);
    return validUntil > now;
  });
}

export async function sendRollbackAgentAction(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  agent: Agent
) {
  checkLicense();

  if (agent.unenrollment_started_at || agent.unenrolled_at) {
    throw new AgentRollbackError('cannot roll back an unenrolling or unenrolled agent');
  }

  if (isAgentUpgrading(agent)) {
    throw new AgentRollbackError('cannot roll back an upgrading agent');
  }

  const rollbacks = agent.upgrade?.rollbacks || [];
  if (rollbacks.length === 0) {
    throw new AgentRollbackError(NO_ROLLBACK_ERROR_MESSAGE);
  }

  const validRollbacks = getValidRollbacks(agent);
  if (validRollbacks.length === 0) {
    throw new AgentRollbackError(EXPIRED_ROLLBACK_ERROR_MESSAGE);
  }

  const agentPolicy = await getAgentPolicyForAgent(soClient, esClient, agent.id);
  if (agentPolicy?.is_managed) {
    throw new HostedAgentPolicyRestrictionRelatedError(
      `Cannot roll back upgrade for agent ${agent.id} on hosted agent policy ${agentPolicy.id}`
    );
  }

  const now = new Date().toISOString();
  const currentSpaceId = getCurrentNamespace(soClient);
  const data = {
    version: validRollbacks[0].version,
    rollback: true,
  };

  const action = await createAgentAction(esClient, soClient, {
    agents: [agent.id],
    created_at: now,
    data,
    ack_data: data,
    type: 'UPGRADE',
    namespaces: [currentSpaceId],
  });

  await updateAgent(esClient, agent.id, {
    upgraded_at: null,
    upgrade_started_at: now,
  });

  return action.id;
}

export async function sendRollbackAgentsActions(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  options: ({ agents: Agent[] } | GetAgentsOptions) & {
    batchSize?: number;
    includeInactive?: boolean;
  }
): Promise<{ actionIds: string[] }> {
  checkLicense();

  const currentSpaceId = getCurrentNamespace(soClient);
  const errors: Record<Agent['id'], Error> = {};
  let givenAgents: Agent[] = [];

  if ('agents' in options) {
    givenAgents = options.agents;
  } else if ('agentIds' in options) {
    const maybeAgents = await getAgentsById(esClient, soClient, options.agentIds);
    for (const maybeAgent of maybeAgents) {
      if ('notFound' in maybeAgent) {
        errors[maybeAgent.id] = new AgentNotFoundError(`Agent ${maybeAgent.id} not found`);
      } else {
        givenAgents.push(maybeAgent);
      }
    }
  } else if ('kuery' in options) {
    const batchSize = options.batchSize ?? SO_SEARCH_LIMIT;
    const namespaceFilter = await agentsKueryNamespaceFilter(currentSpaceId);
    const kuery = buildFilterWithNamespace(namespaceFilter, options.kuery);

    // cheap count — avoids hydrating up to batchSize agent documents just to read the total
    const { total } = await getAgentsByKuery(esClient, soClient, {
      kuery,
      showAgentless: options.showAgentless,
      showInactive: options.includeInactive ?? false,
      page: 1,
      perPage: 0,
    });

    if (total <= batchSize) {
      const res = await getAgentsByKuery(esClient, soClient, {
        kuery,
        showAgentless: options.showAgentless,
        showInactive: options.includeInactive ?? false,
        page: 1,
        perPage: batchSize,
      });
      givenAgents = res.agents;
    } else {
      // Upgrade rollback returns all action IDs (one per rollback version group)
      // Process all batches synchronously to collect all action IDs
      const runner = new RollbackActionRunner(
        esClient,
        soClient,
        {
          ...options,
          batchSize,
          total,
          spaceId: currentSpaceId,
        },
        { pitId: await openPointInTime(esClient) }
      );
      // Process all batches synchronously to collect all action IDs
      await runner.processAgentsInBatches();
      // Return all collected action IDs
      return {
        actionIds: runner.getAllActionIds(),
      };
    }
  }

  const result = await rollbackBatch(esClient, givenAgents, errors, {}, [currentSpaceId]);
  return {
    actionIds: result.actionIds,
  };
}
