/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import type { ElasticsearchClient, SavedObjectsClientContract, Logger } from '@kbn/core/server';
import { escapeQuotes } from '@kbn/es-query';
import { SavedObjectsErrorHelpers, isSavedObjectErrorResult } from '@kbn/core/server';

import { appContextService } from '../app_context';
import { setupFleet } from '../setup';
import {
  AGENT_POLICY_SAVED_OBJECT_TYPE,
  SO_SEARCH_LIMIT,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PRECONFIGURATION_DELETION_RECORD_SAVED_OBJECT_TYPE,
} from '../../constants';
import { agentPolicyService } from '../agent_policy';
import { packagePolicyService } from '../package_policy';
import { getAgentsByKuery, forceUnenrollAgent } from '../agents';
import { listEnrollmentApiKeys, deleteEnrollmentApiKeys } from '../api_keys';
import type { AgentPolicy } from '../../types';
import { AgentPolicyInvalidError } from '../../errors';

import { MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20 } from '../../constants';

export async function resetPreconfiguredAgentPolicies(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  agentPolicyId?: string
) {
  const logger = appContextService.getLogger().get('resetPreconfiguredAgentPolicies');
  logger.warn(`Reseting Fleet preconfigured agent policy id [${agentPolicyId}]`);
  await _deleteExistingData(soClient, esClient, logger, agentPolicyId);
  await _deleteGhostPackagePolicies(soClient, esClient, logger);
  await _deletePreconfigurationDeleteRecord(soClient, logger, agentPolicyId);
  await setupFleet(soClient, esClient);
}

/**
 * Delete all package policies that are not used in any agent policies
 */
async function _deleteGhostPackagePolicies(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  logger: Logger
) {
  const { items: packagePolicies } = await packagePolicyService.list(soClient, {
    perPage: SO_SEARCH_LIMIT,
  });

  const policyIds = Array.from(
    packagePolicies.reduce((acc, packagePolicy) => {
      packagePolicy.policy_ids.forEach((policyId) => acc.add(policyId));

      return acc;
    }, new Set<string>())
  );

  if (!policyIds.length) {
    return;
  }

  const objects = policyIds.map((id) => ({ id, type: AGENT_POLICY_SAVED_OBJECT_TYPE }));
  const agentPolicyExistsMap = (await soClient.bulkGet(objects)).saved_objects.reduce((acc, so) => {
    if (isSavedObjectErrorResult(so) && so.error.statusCode === 404) {
      acc.set(so.id, false);
    } else {
      acc.set(so.id, true);
    }
    return acc;
  }, new Map<string, boolean>());

  await pMap(
    packagePolicies,
    (packagePolicy) => {
      if (
        packagePolicy.policy_ids.every((policyId) => agentPolicyExistsMap.get(policyId) === false)
      ) {
        logger.info(`Deleting ghost package policy ${packagePolicy.name} (${packagePolicy.id})`);
        return soClient.delete(PACKAGE_POLICY_SAVED_OBJECT_TYPE, packagePolicy.id);
      }
    },
    {
      concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20,
    }
  );
}

async function _deletePreconfigurationDeleteRecord(
  soClient: SavedObjectsClientContract,
  logger: Logger,
  agentPolicyId?: string
) {
  const existingDeletionRecord = await soClient.find<{ id: string }>({
    type: PRECONFIGURATION_DELETION_RECORD_SAVED_OBJECT_TYPE,
    perPage: SO_SEARCH_LIMIT,
  });

  const deletionRecordSavedObjects = agentPolicyId
    ? existingDeletionRecord.saved_objects.filter((so) => so.attributes.id === agentPolicyId)
    : existingDeletionRecord.saved_objects;

  if (deletionRecordSavedObjects.length > 0) {
    await pMap(
      deletionRecordSavedObjects,
      (savedObject) =>
        soClient
          .delete(PRECONFIGURATION_DELETION_RECORD_SAVED_OBJECT_TYPE, savedObject.id)
          .catch((err) => {
            if (SavedObjectsErrorHelpers.isNotFoundError(err)) {
              return undefined;
            }
            throw err;
          }),

      {
        concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20,
      }
    );
  }
}

async function _deleteExistingData(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  logger: Logger,
  agentPolicyId?: string
) {
  let existingPolicies: AgentPolicy[] = [];

  if (agentPolicyId) {
    const policy = await agentPolicyService.get(soClient, agentPolicyId).catch((err) => {
      if (err.output?.statusCode === 404) {
        return undefined;
      }
      throw err;
    });
    if (policy && !policy.is_preconfigured) {
      throw new AgentPolicyInvalidError(`Invalid policy ${agentPolicyId}`);
    }
    if (policy) {
      existingPolicies = [policy];
    }
  } else {
    existingPolicies = (
      await agentPolicyService.list(soClient, {
        perPage: SO_SEARCH_LIMIT,
        kuery: `${AGENT_POLICY_SAVED_OBJECT_TYPE}.is_preconfigured:true`,
      })
    ).items;
  }

  if (!existingPolicies.length) {
    return;
  }

  // unenroll all the agents enrolled in these policies
  const { agents } = await getAgentsByKuery(esClient, soClient, {
    showInactive: true,
    perPage: SO_SEARCH_LIMIT,
    kuery: existingPolicies.map((policy) => `policy_id:"${escapeQuotes(policy.id)}"`).join(' or '),
  });

  // Delete
  if (agents.length > 0) {
    logger.info(`Force unenrolling ${agents.length} agents`);
    await pMap(agents, (agent) => forceUnenrollAgent(esClient, soClient, agent.id), {
      concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20,
    });
  }

  const { items: enrollmentApiKeys } = await listEnrollmentApiKeys(esClient, {
    perPage: SO_SEARCH_LIMIT,
    showInactive: true,
    kuery: existingPolicies.map((policy) => `policy_id:"${escapeQuotes(policy.id)}"`).join(' or '),
  });

  if (enrollmentApiKeys.length > 0) {
    logger.info(`Deleting ${enrollmentApiKeys.length} enrollment api keys`);
    await deleteEnrollmentApiKeys(
      esClient,
      enrollmentApiKeys.map((k) => k.id),
      true,
      undefined,
      true
    );
  }
  logger.info(`Deleting ${existingPolicies.length} agent policies`);
  await pMap(
    existingPolicies,
    (policy) =>
      agentPolicyService.delete(soClient, esClient, policy.id, {
        force: true,
      }),
    {
      concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20,
    }
  );
}
