/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';
import { omit } from 'lodash';

import { FleetError, FleetUnauthorizedError } from '../../errors';
import { packagePolicyService } from '../package_policy';
import {
  MINIMUM_PRIVILEGE_LEVEL_CHANGE_AGENT_VERSION,
  isAgentPrivilegeLevelChangeSupported,
} from '../../../common/services';
import { getCurrentNamespace } from '../spaces/get_current_namespace';
import { SO_SEARCH_LIMIT } from '../../constants';
import type { PackagePolicy } from '../../types';
import type { AgentPrivilegeLevelChangeUserInfo } from '../../../common/types';

import { createAgentAction } from './actions';
import type { GetAgentsOptions } from './crud';
import { getAgentById, getAgents, getAgentsByKuery, openPointInTime } from './crud';
import {
  bulkChangePrivilegeAgentsBatch,
  ChangePrivilegeActionRunner,
} from './change_privilege_runner';

export async function changeAgentPrivilegeLevel(
  esClient: ElasticsearchClient,
  soClient: SavedObjectsClientContract,
  agentId: string,
  options?: {
    user_info?: AgentPrivilegeLevelChangeUserInfo;
  } | null
) {
  const agent = await getAgentById(esClient, soClient, agentId);

  // Return fast if agent is already unprivileged.
  if (agent.local_metadata?.elastic?.agent?.unprivileged === true) {
    return { message: `Agent ${agentId} is already unprivileged` };
  }

  // Fail fast if agent is on an unsupported version.
  if (!isAgentPrivilegeLevelChangeSupported(agent)) {
    throw new FleetError(
      `Cannot remove root privilege. Privilege level change is supported from version ${MINIMUM_PRIVILEGE_LEVEL_CHANGE_AGENT_VERSION}.`
    );
  }

  // Fail fast if agent contains an integration that requires root privilege.
  const packagePolicies =
    (await packagePolicyService.findAllForAgentPolicy(soClient, agent.policy_id || '')) || [];
  const packagesWithRootPrivilege = getPackagesWithRootPrivilege(packagePolicies);
  if (packagesWithRootPrivilege.length > 0) {
    throw new FleetUnauthorizedError(
      `Agent ${agent.id} is on policy ${
        agent.policy_id
      }, which contains integrations that require root privilege: ${packagesWithRootPrivilege
        .map((pkg) => pkg?.name)
        .join(', ')}`
    );
  }

  // Create action to change the agent's privilege level.
  // Extract password from options if provided and pass it as a secret.
  const res = await createAgentAction(esClient, soClient, {
    agents: [agentId],
    created_at: new Date().toISOString(),
    type: 'PRIVILEGE_LEVEL_CHANGE',
    data: {
      unprivileged: true,
      ...(options?.user_info && { user_info: omit(options?.user_info, ['password']) }),
    },
    ...(options?.user_info?.password && {
      secrets: { user_info: { password: options.user_info.password } },
    }),
  });
  return { actionId: res.id };
}

export async function bulkChangeAgentsPrivilegeLevel(
  esClient: ElasticsearchClient,
  soClient: SavedObjectsClientContract,
  options: GetAgentsOptions & {
    batchSize?: number;
    actionId?: string;
    total?: number;
    user_info?: AgentPrivilegeLevelChangeUserInfo;
  }
): Promise<{ actionId: string }> {
  const currentSpaceId = getCurrentNamespace(soClient);

  if ('agentIds' in options) {
    const givenAgents = await getAgents(esClient, soClient, options);
    return await bulkChangePrivilegeAgentsBatch(esClient, soClient, givenAgents, {
      ...options,
      spaceId: currentSpaceId,
    });
  }

  const batchSize = options.batchSize ?? SO_SEARCH_LIMIT;

  // cheap count — avoids hydrating up to batchSize agent documents just to read the total
  const { total } = await getAgentsByKuery(esClient, soClient, {
    kuery: options.kuery,
    spaceId: currentSpaceId,
    showInactive: false,
    page: 1,
    perPage: 0,
  });
  if (total <= batchSize) {
    const res = await getAgentsByKuery(esClient, soClient, {
      kuery: options.kuery,
      spaceId: currentSpaceId,
      showInactive: false,
      page: 1,
      perPage: batchSize,
    });
    return await bulkChangePrivilegeAgentsBatch(esClient, soClient, res.agents, {
      ...options,
      spaceId: currentSpaceId,
    });
  } else {
    return await new ChangePrivilegeActionRunner(
      esClient,
      soClient,
      {
        ...options,
        batchSize,
        total,
        spaceId: currentSpaceId,
      },
      { pitId: await openPointInTime(esClient) }
    ).runActionAsyncTask();
  }
}

export function getPackagesWithRootPrivilege(packagePolicies: PackagePolicy[]) {
  return packagePolicies
    .map((policy) => policy.package)
    .filter((pkg) => pkg && Boolean(pkg?.requires_root));
}
