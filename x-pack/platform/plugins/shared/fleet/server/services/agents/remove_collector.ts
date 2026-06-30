/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';

import { AGENT_TYPE_OPAMP } from '../../../common/constants';
import { AgentRequestInvalidError } from '../../../common/errors';
import { SO_SEARCH_LIMIT } from '../../constants';
import { agentsKueryNamespaceFilter, buildFilterWithNamespace } from '../spaces/agent_namespaces';
import { getCurrentNamespace } from '../spaces/get_current_namespace';

import { bulkUpdateAgents, getAgentById, getAgents, getAgentsByKuery, updateAgent } from './crud';
import type { GetAgentsOptions } from './crud';
import { bulkCreateAgentActionResults, createAgentAction } from './actions';

export class CollectorRemovalError extends AgentRequestInvalidError {}

export async function removeCollector(
  esClient: ElasticsearchClient,
  soClient: SavedObjectsClientContract,
  agentId: string
) {
  const agent = await getAgentById(esClient, soClient, agentId);
  if (agent.type !== AGENT_TYPE_OPAMP) {
    throw new CollectorRemovalError(
      `Agent ${agentId} is not an OpAMP collector (type: ${agent.type})`
    );
  }

  const now = new Date().toISOString();
  await updateAgent(esClient, agentId, {
    active: false,
    unenrolled_at: now,
  });

  const actionId = uuidv4();
  const currentSpaceId = getCurrentNamespace(soClient);
  await createAgentAction(esClient, soClient, {
    id: actionId,
    agents: [agentId],
    created_at: now,
    type: 'REMOVE_COLLECTOR',
    total: 1,
    namespaces: [currentSpaceId],
  });
  await bulkCreateAgentActionResults(esClient, [{ agentId, actionId }]);
}

export async function removeCollectors(
  esClient: ElasticsearchClient,
  soClient: SavedObjectsClientContract,
  options: GetAgentsOptions & {
    showInactive?: boolean;
  }
): Promise<{ actionId: string }> {
  const spaceId = getCurrentNamespace(soClient);

  const candidateAgents =
    'agentIds' in options
      ? await getAgents(esClient, soClient, options)
      : (
          await getAgentsByKuery(esClient, soClient, {
            kuery: buildFilterWithNamespace(
              await agentsKueryNamespaceFilter(spaceId),
              options.kuery
            ),
            showAgentless: options.showAgentless,
            showInactive: options.showInactive ?? false,
            page: 1,
            perPage: SO_SEARCH_LIMIT,
          })
        ).agents;

  const collectors = candidateAgents.filter((agent) => agent.type === AGENT_TYPE_OPAMP);
  const now = new Date().toISOString();

  await bulkUpdateAgents(
    esClient,
    collectors.map((agent) => ({
      agentId: agent.id,
      data: { active: false, unenrolled_at: now },
    })),
    {}
  );

  const actionId = uuidv4();

  if (collectors.length > 0) {
    const collectorIds = collectors.map((a) => a.id);
    await createAgentAction(esClient, soClient, {
      id: actionId,
      agents: collectorIds,
      created_at: now,
      type: 'REMOVE_COLLECTOR',
      total: collectorIds.length,
      namespaces: [spaceId],
    });
    await bulkCreateAgentActionResults(
      esClient,
      collectorIds.map((id) => ({ agentId: id, actionId }))
    );
  }

  return { actionId };
}
