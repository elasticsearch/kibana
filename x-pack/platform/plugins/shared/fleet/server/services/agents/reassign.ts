/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SavedObjectsClientContract, ElasticsearchClient } from '@kbn/core/server';

import { SavedObjectNotFound } from '@kbn/kibana-utils-plugin/common';

import type { Agent } from '../../types';
import { agentPolicyService } from '../agent_policy';
import {
  AgentReassignmentError,
  HostedAgentPolicyRestrictionRelatedError,
  AgentPolicyNotFoundError,
} from '../../errors';

import { SO_SEARCH_LIMIT } from '../../constants';
import { agentsKueryNamespaceFilter, buildFilterWithNamespace } from '../spaces/agent_namespaces';
import { getCurrentNamespace } from '../spaces/get_current_namespace';

import {
  getAgentsById,
  getAgentPolicyForAgent,
  updateAgent,
  getAgentsByKuery,
  openPointInTime,
  getAgentById,
} from './crud';
import type { GetAgentsOptions } from '.';
import { createAgentAction } from './actions';

import { ReassignActionRunner, reassignBatch } from './reassign_action_runner';

async function verifyNewAgentPolicy(
  soClient: SavedObjectsClientContract,
  newAgentPolicyId: string
) {
  let newAgentPolicy;
  try {
    newAgentPolicy = await agentPolicyService.get(soClient, newAgentPolicyId);
  } catch (err) {
    if (err instanceof SavedObjectNotFound) {
      throw new AgentPolicyNotFoundError(`Agent policy not found: ${newAgentPolicyId}`);
    }
  }
  if (!newAgentPolicy) {
    throw new AgentPolicyNotFoundError(`Agent policy not found: ${newAgentPolicyId}`);
  }
  if (newAgentPolicy?.is_managed) {
    throw new HostedAgentPolicyRestrictionRelatedError(
      `Cannot reassign agents to hosted agent policy ${newAgentPolicy.id}`
    );
  }
}

export async function reassignAgent(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  agentId: string,
  newAgentPolicyId: string
) {
  await verifyNewAgentPolicy(soClient, newAgentPolicyId);

  await getAgentById(esClient, soClient, agentId); // throw 404 if agent not in namespace

  const agentPolicy = await getAgentPolicyForAgent(soClient, esClient, agentId);
  if (agentPolicy?.is_managed) {
    throw new HostedAgentPolicyRestrictionRelatedError(
      `Cannot reassign an agent from hosted agent policy ${agentPolicy.id}`
    );
  }

  const newAgentPolicy = await agentPolicyService.get(soClient, newAgentPolicyId);

  await updateAgent(esClient, agentId, {
    policy_id: newAgentPolicyId,
    policy_revision: null,
    ...(newAgentPolicy?.space_ids ? { namespaces: newAgentPolicy.space_ids } : {}),
  });

  const currentSpaceId = getCurrentNamespace(soClient);

  await createAgentAction(esClient, soClient, {
    agents: [agentId],
    created_at: new Date().toISOString(),
    type: 'POLICY_REASSIGN',
    data: {
      policy_id: newAgentPolicyId,
    },
    namespaces: [currentSpaceId],
  });
}

export async function reassignAgents(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  options: ({ agents: Agent[] } | GetAgentsOptions) & {
    force?: boolean;
    batchSize?: number;
  },
  newAgentPolicyId: string
): Promise<{ actionId: string }> {
  await verifyNewAgentPolicy(soClient, newAgentPolicyId);

  const currentSpaceId = getCurrentNamespace(soClient);
  const outgoingErrors: Record<Agent['id'], Error> = {};
  let givenAgents: Agent[] = [];
  if ('agents' in options) {
    givenAgents = options.agents;
  } else if ('agentIds' in options) {
    const maybeAgents = await getAgentsById(esClient, soClient, options.agentIds);
    for (const maybeAgent of maybeAgents) {
      if ('notFound' in maybeAgent) {
        outgoingErrors[maybeAgent.id] = new AgentReassignmentError(
          `Cannot find agent ${maybeAgent.id}`
        );
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
      showInactive: options.showInactive ?? false,
      page: 1,
      perPage: 0,
    });
    // running action in async mode for >10k agents (or actions > batchSize for testing purposes)
    if (total <= batchSize) {
      const res = await getAgentsByKuery(esClient, soClient, {
        kuery,
        showAgentless: options.showAgentless,
        showInactive: options.showInactive ?? false,
        page: 1,
        perPage: batchSize,
      });
      givenAgents = res.agents;
    } else {
      return await new ReassignActionRunner(
        esClient,
        soClient,
        {
          ...options,
          spaceId: currentSpaceId,
          batchSize,
          total,
          newAgentPolicyId,
        },
        { pitId: await openPointInTime(esClient) }
      ).runActionAsyncTask();
    }
  }

  return await reassignBatch(
    esClient,
    { newAgentPolicyId, spaceId: currentSpaceId },
    givenAgents,
    outgoingErrors
  );
}
