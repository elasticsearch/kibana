/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract, Logger } from '@kbn/core/server';
import pMap from 'p-map';

import { ENROLLMENT_API_KEYS_INDEX } from '../../../common/constants';

import { agentPolicyService } from '../agent_policy';
import { generateEnrollmentAPIKey } from '../api_keys';
import { SO_SEARCH_LIMIT, MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20 } from '../../constants';
import { appContextService } from '../app_context';
import { scheduleDeployAgentPoliciesTask } from '../agent_policies/deploy_agent_policies_task';

/**
 * Return the set of agent policy ids that already have at least one enrollment API key.
 */
async function getPolicyIdsWithEnrollmentAPIKeys(
  esClient: ElasticsearchClient,
  agentPolicyIds: string[]
): Promise<Set<string>> {
  const policyIdsWithKeys = new Set<string>();
  if (agentPolicyIds.length === 0) {
    return policyIdsWithKeys;
  }

  const res = await esClient.search<unknown, { policies: { buckets: Array<{ key: string }> } }>({
    index: ENROLLMENT_API_KEYS_INDEX,
    ignore_unavailable: true,
    size: 0,
    query: { terms: { policy_id: agentPolicyIds } },
    aggs: {
      policies: {
        terms: { field: 'policy_id', size: agentPolicyIds.length, execution_hint: 'map' },
      },
    },
  });

  for (const bucket of res.aggregations?.policies?.buckets ?? []) {
    policyIdsWithKeys.add(bucket.key);
  }

  return policyIdsWithKeys;
}

export async function ensureAgentPoliciesFleetServerKeysAndPolicies({
  logger,
  soClient,
  esClient,
}: {
  logger: Logger;
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
}) {
  const security = appContextService.getSecurity();
  if (!security) {
    return;
  }

  if (!(await security.authc.apiKeys.areAPIKeysEnabled())) {
    return;
  }

  const { items: agentPolicies } = await agentPolicyService.list(soClient, {
    perPage: SO_SEARCH_LIMIT,
  });

  const agentPolicyIds = agentPolicies.map((agentPolicy) => agentPolicy.id);

  // Resolve the latest deployed revision and which policies already have an enrollment API key
  const [latestRevisionByPolicyId, policyIdsWithEnrollmentKeys] = await Promise.all([
    agentPolicyService.getLatestFleetPolicyRevisions(esClient, agentPolicyIds),
    getPolicyIdsWithEnrollmentAPIKeys(esClient, agentPolicyIds),
  ]);

  // Generate a default enrollment API key only for policies that are missing one
  const policiesMissingEnrollmentKey = agentPolicies.filter(
    (agentPolicy) => !policyIdsWithEnrollmentKeys.has(agentPolicy.id)
  );
  await pMap(
    policiesMissingEnrollmentKey,
    (agentPolicy) =>
      generateEnrollmentAPIKey(soClient, esClient, {
        name: `Default`,
        agentPolicyId: agentPolicy.id,
        forceRecreate: true,
      }),
    {
      concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20,
    }
  );

  const outdatedAgentPolicyIds: Array<{ id: string; spaceId?: string }> = [];
  for (const agentPolicy of agentPolicies) {
    const latestRevisionIdx = latestRevisionByPolicyId.get(agentPolicy.id);

    if (latestRevisionIdx !== undefined && latestRevisionIdx !== agentPolicy.revision) {
      logger.warn(
        `Policy [${agentPolicy.id}] has mismatched revisions: ` +
          `.kibana_ingest revision [${agentPolicy.revision}], ` +
          `.fleet-policies revision_idx [${latestRevisionIdx}]`
      );
    }

    if ((latestRevisionIdx ?? -1) < agentPolicy.revision) {
      outdatedAgentPolicyIds.push({ id: agentPolicy.id, spaceId: agentPolicy.space_ids?.[0] });
    }
  }

  if (!outdatedAgentPolicyIds.length) {
    return;
  }

  // Preconfigured fleet server policies must be deployed synchronously so that
  // the fleet server agent can read its policy from ES before setup completes.
  // Scoped to preconfigured policies only (cloud / self-managed setups owned by
  // Kibana) to avoid risk for user-created fleet server policies whose data may
  // be in an unexpected state.
  const fleetServerPoliciesById = new Map(
    agentPolicies
      .filter((p) => (p.is_default_fleet_server || p.has_fleet_server) && p.is_preconfigured)
      .map((p) => [p.id, p])
  );

  const outdatedFleetServerPolicyIds = outdatedAgentPolicyIds.filter(({ id }) =>
    fleetServerPoliciesById.has(id)
  );
  const outdatedRegularPolicyIds = outdatedAgentPolicyIds.filter(
    ({ id }) => !fleetServerPoliciesById.has(id)
  );

  if (outdatedFleetServerPolicyIds.length) {
    // Group by space so we can use the correctly-scoped soClient for each
    const bySpace = new Map<string, string[]>();
    for (const { id, spaceId = 'default' } of outdatedFleetServerPolicyIds) {
      const ids = bySpace.get(spaceId) ?? [];
      ids.push(id);
      bySpace.set(spaceId, ids);
    }

    for (const [spaceId, ids] of bySpace) {
      logger.info(
        `Synchronously deploying fleet server ${
          ids.length === 1 ? 'policy' : 'policies'
        } [${ids.join(', ')}] in space [${spaceId}] during setup`
      );
      try {
        await agentPolicyService.deployPolicies(
          appContextService.getInternalUserSOClientForSpaceId(spaceId),
          ids,
          undefined,
          { throwOnAnyError: true }
        );
      } catch (e) {
        logger.error(`Failed to deploy fleet server policies [${ids.join(', ')}]: ${e.message}`);
      }
    }
  }

  if (outdatedRegularPolicyIds.length) {
    return scheduleDeployAgentPoliciesTask(
      appContextService.getTaskManagerStart()!,
      outdatedRegularPolicyIds
    );
  }
}
