/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client, estypes } from '@elastic/elasticsearch';
import { API_VERSIONS, packagePolicyRouteService } from '@kbn/fleet-plugin/common';
import type { GetOnePackagePolicyResponse, PackagePolicy } from '@kbn/fleet-plugin/common';
import type { KbnClient } from '@kbn/test';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  metadataCurrentIndexPattern,
  METADATA_UNITED_INDEX,
} from '@kbn/security-solution-plugin/common/endpoint/constants';
import {
  deleteIndexedFleetEndpointPolicies,
  indexFleetEndpointPolicy,
} from '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy';
import type { IndexedFleetEndpointPolicyResponse } from '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy';
import { cleanupPolicyManagementPackagePolicy } from './policy_management_package_policy';
import { cleanupPolicyManagementSeededData } from './cleanup';
import { toPackagePolicyUpdateBody } from './package_policy_update_body';

export const EVAL_PM_ROLLOUT_STATUS_PACKAGE_POLICY_NAME = 'eval-agent-pm-rollout-status';
export const EVAL_PM_ROLLOUT_STATUS_AGENT_POLICY_NAME = 'eval-agent-pm-rollout-status-agent';
export const EVAL_PM_ROLLOUT_STATUS_AGENT_ID = 'eval-agent-pm-rollout-status-001';
export const EVAL_PM_ROLLOUT_STATUS_HOST_NAME = 'eval-pm-rollout-status-host';

export const POLICY_MANAGEMENT_ROLLOUT_STATUS_SEED_ERROR =
  'seedPolicyManagementRolloutStatus: indexFleetEndpointPolicy returned no integration policy';
export const POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR =
  'seedPolicyManagementRolloutStatus: Fleet package policy GET did not return a PolicyData item';
export const POLICY_MANAGEMENT_ROLLOUT_STATUS_ASSIGNMENT_ERROR =
  'seedPolicyManagementRolloutStatus: persisted policy_ids must contain exactly one unique nonempty agent-policy id';
export const POLICY_MANAGEMENT_ROLLOUT_STATUS_REVISION_ERROR =
  'seedPolicyManagementRolloutStatus: package policy revision did not increase after update';
export const POLICY_MANAGEMENT_ROLLOUT_STATUS_READINESS_TIMEOUT =
  'Timed out waiting for policy-management rollout-status readiness';

const PUBLIC_V1_HEADERS = {
  'elastic-api-version': API_VERSIONS.public.v1,
};

const TRANSFORM_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TRANSFORM_WAIT_MS = 180_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const canonicalizeAgentPolicyId = (value: unknown): string | undefined => {
  const raw = readString(value);
  if (raw === undefined) {
    return undefined;
  }
  return raw.replace(/#\d+\.\d+$/, '');
};

const readAppliedRevision = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const deleteFleetAgent = async (internalEsClient: Client, agentId: string): Promise<void> => {
  await internalEsClient.delete(
    {
      index: '.fleet-agents',
      id: agentId,
      refresh: true,
    },
    { ignore: [404] }
  );
};

export interface SeededPolicyManagementRolloutStatus {
  id: string;
  name: string;
  indexed: IndexedFleetEndpointPolicyResponse;
  agentId: string;
  agentPolicyId: string;
  packageRevision: number;
  appliedPackageRevision: number;
}

export interface PolicyManagementRolloutStatusReadiness {
  agentId: string;
  agentPolicyId: string;
  packagePolicyId: string;
  packageRevision: number;
  appliedPackageRevision: number;
}

interface ObservedRolloutStatusFacts {
  metadataCurrentFound: boolean;
  agentId?: string;
  endpointAgentId?: string;
  fleetAgentId?: string;
  active?: boolean;
  agentPolicyId?: string;
  packagePolicyId?: string;
  appliedPackageRevision?: number;
}

const uniqueAssignedAgentPolicyIds = (
  policyIds: PackagePolicy['policy_ids']
): string[] | undefined => {
  if (!Array.isArray(policyIds)) {
    return undefined;
  }

  return [
    ...new Set(
      policyIds.filter(
        (policyId): policyId is string => typeof policyId === 'string' && policyId.length > 0
      )
    ),
  ];
};

const readPackagePolicyItem = async (kbnClient: KbnClient, id: string): Promise<PackagePolicy> => {
  const response = await kbnClient.request<GetOnePackagePolicyResponse>({
    path: packagePolicyRouteService.getInfoPath(id),
    method: 'GET',
    headers: PUBLIC_V1_HEADERS,
  });
  if (!isRecord(response.data)) {
    throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR);
  }
  return response.data.item;
};

const setLinuxEventsProcessFalse = (
  updateBody: ReturnType<typeof toPackagePolicyUpdateBody>
): void => {
  const [input] = updateBody.inputs;
  if (input === undefined || !isRecord(input.config) || !isRecord(input.config.policy)) {
    throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR);
  }

  const policyValue = input.config.policy.value;
  if (!isRecord(policyValue)) {
    throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR);
  }

  const linux = isRecord(policyValue.linux) ? policyValue.linux : {};
  policyValue.linux = linux;
  const events = isRecord(linux.events) ? linux.events : {};
  linux.events = events;
  events.process = false;
};

const readRevision = (item: PackagePolicy): number => {
  if (!isRecord(item) || !isFiniteNumber(item.revision)) {
    throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR);
  }
  return item.revision;
};

const readUniqueAssignedAgentPolicyId = (item: PackagePolicy): string => {
  if (!isRecord(item)) {
    throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR);
  }
  const uniqueIds = uniqueAssignedAgentPolicyIds(item.policy_ids);
  if (uniqueIds === undefined) {
    throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR);
  }

  const [agentPolicyId] = uniqueIds;
  if (uniqueIds.length !== 1 || agentPolicyId === undefined) {
    throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_ASSIGNMENT_ERROR);
  }

  return agentPolicyId;
};

const firstHitSource = (response: estypes.SearchResponse<unknown>): unknown =>
  response.hits.hits[0]?._source;

const extractUnitedFacts = (
  source: unknown
): Omit<ObservedRolloutStatusFacts, 'metadataCurrentFound'> => {
  if (!isRecord(source)) {
    return {};
  }

  const agent = isRecord(source.agent) ? source.agent : undefined;
  const united = isRecord(source.united) ? source.united : undefined;
  const unitedEndpoint = united && isRecord(united.endpoint) ? united.endpoint : undefined;
  const unitedAgent = united && isRecord(united.agent) ? united.agent : undefined;
  const endpointAgent =
    unitedEndpoint && isRecord(unitedEndpoint.agent) ? unitedEndpoint.agent : undefined;
  const fleetAgent = unitedAgent && isRecord(unitedAgent.agent) ? unitedAgent.agent : undefined;
  const applied =
    unitedEndpoint &&
    isRecord(unitedEndpoint.Endpoint) &&
    isRecord(unitedEndpoint.Endpoint.policy) &&
    isRecord(unitedEndpoint.Endpoint.policy.applied)
      ? unitedEndpoint.Endpoint.policy.applied
      : undefined;
  const policyBaseId = unitedAgent ? readString(unitedAgent.policy_base_id) : undefined;
  const policyId = unitedAgent ? canonicalizeAgentPolicyId(unitedAgent.policy_id) : undefined;

  return {
    agentId: agent ? readString(agent.id) : undefined,
    endpointAgentId: endpointAgent ? readString(endpointAgent.id) : undefined,
    fleetAgentId: fleetAgent ? readString(fleetAgent.id) : undefined,
    active: unitedAgent ? readBoolean(unitedAgent.active) : undefined,
    agentPolicyId: policyBaseId ?? policyId,
    packagePolicyId: applied ? readString(applied.id) : undefined,
    appliedPackageRevision: applied
      ? readAppliedRevision(applied.endpoint_policy_version)
      : undefined,
  };
};

const formatExpectedReadiness = (expected: PolicyManagementRolloutStatusReadiness): string =>
  `agentId=${expected.agentId} agentPolicyId=${expected.agentPolicyId} packagePolicyId=${expected.packagePolicyId} packageRevision=${expected.packageRevision} appliedPackageRevision=${expected.appliedPackageRevision}`;

const formatObservedFacts = (facts: ObservedRolloutStatusFacts): string =>
  `metadataCurrentFound=${facts.metadataCurrentFound} agentId=${
    facts.agentId ?? 'none'
  } endpointAgentId=${facts.endpointAgentId ?? 'none'} fleetAgentId=${
    facts.fleetAgentId ?? 'none'
  } active=${facts.active ?? 'none'} agentPolicyId=${
    facts.agentPolicyId ?? 'none'
  } packagePolicyId=${facts.packagePolicyId ?? 'none'} appliedPackageRevision=${
    facts.appliedPackageRevision ?? 'none'
  }`;

const isExactAgentCurrent = (source: unknown, agentId: string): boolean => {
  if (!isRecord(source) || !isRecord(source.agent)) {
    return false;
  }
  return readString(source.agent.id) === agentId;
};

const isExpectedRolloutStatusReady = (
  facts: ObservedRolloutStatusFacts,
  expected: PolicyManagementRolloutStatusReadiness
): boolean => {
  if (!facts.metadataCurrentFound) {
    return false;
  }
  if (expected.appliedPackageRevision >= expected.packageRevision) {
    return false;
  }

  return (
    facts.agentId === expected.agentId &&
    facts.endpointAgentId === expected.agentId &&
    facts.fleetAgentId === expected.agentId &&
    facts.active === true &&
    facts.agentPolicyId === expected.agentPolicyId &&
    facts.packagePolicyId === expected.packagePolicyId &&
    facts.appliedPackageRevision === expected.appliedPackageRevision
  );
};

const exactSeededAgentQuery = (agentId: string) => ({
  bool: {
    should: [
      { term: { 'agent.id': agentId } },
      { term: { 'united.endpoint.agent.id': agentId } },
      { term: { 'united.agent.agent.id': agentId } },
    ],
    minimum_should_match: 1,
  },
});

export const waitForPolicyManagementTransformPropagation = async (
  esClient: Client,
  log: ToolingLog,
  expected: PolicyManagementRolloutStatusReadiness,
  options?: {
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }
): Promise<void> => {
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_TRANSFORM_WAIT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? TRANSFORM_POLL_INTERVAL_MS;
  const start = Date.now();
  let lastObserved: ObservedRolloutStatusFacts = { metadataCurrentFound: false };
  const query = exactSeededAgentQuery(expected.agentId);
  log.info(
    `Waiting for policy-management rollout-status readiness: ${formatExpectedReadiness(expected)}`
  );

  while (Date.now() - start < maxWaitMs) {
    try {
      const [currentResponse, unitedResponse] = await Promise.all([
        esClient.search({
          index: metadataCurrentIndexPattern,
          query,
          size: 1,
          ignore_unavailable: true,
        }),
        esClient.search({
          index: METADATA_UNITED_INDEX,
          query,
          size: 1,
          ignore_unavailable: true,
        }),
      ]);

      lastObserved = {
        metadataCurrentFound: isExactAgentCurrent(
          firstHitSource(currentResponse),
          expected.agentId
        ),
        ...extractUnitedFacts(firstHitSource(unitedResponse)),
      };

      log.debug(`Policy-management rollout-status readiness: ${formatObservedFacts(lastObserved)}`);

      if (isExpectedRolloutStatusReady(lastObserved, expected)) {
        log.info('Policy-management rollout-status readiness complete');
        return;
      }
    } catch (err) {
      log.debug(`Error checking policy-management rollout-status readiness: ${err}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `${POLICY_MANAGEMENT_ROLLOUT_STATUS_READINESS_TIMEOUT} after ${maxWaitMs}ms. ` +
      `Expected ${formatExpectedReadiness(expected)}; last observed ${formatObservedFacts(
        lastObserved
      )}`
  );
};

const seedRolloutStatusDocuments = async ({
  esClient,
  internalEsClient,
  agentPolicyId,
  packagePolicyId,
  packagePolicyName,
  appliedPackageRevision,
  agentPolicyRevision,
}: {
  esClient: Client;
  internalEsClient: Client;
  agentPolicyId: string;
  packagePolicyId: string;
  packagePolicyName: string;
  appliedPackageRevision: number;
  agentPolicyRevision: number;
}): Promise<void> => {
  const now = new Date().toISOString();

  await esClient.create({
    index: 'metrics-endpoint.metadata-default',
    id: `eval-metadata-${EVAL_PM_ROLLOUT_STATUS_HOST_NAME}-${Date.now()}`,
    refresh: true,
    document: {
      '@timestamp': now,
      event: {
        kind: 'metric',
        dataset: 'endpoint.metadata',
        module: 'endpoint',
      },
      data_stream: {
        type: 'metrics',
        dataset: 'endpoint.metadata',
        namespace: 'default',
      },
      agent: { id: EVAL_PM_ROLLOUT_STATUS_AGENT_ID, type: 'endpoint', version: '9.5.0-SNAPSHOT' },
      host: {
        name: EVAL_PM_ROLLOUT_STATUS_HOST_NAME,
        hostname: EVAL_PM_ROLLOUT_STATUS_HOST_NAME,
        os: { name: 'Windows', version: '10', type: 'windows', full: 'Windows 10' },
      },
      Endpoint: {
        status: 'enrolled',
        policy: {
          applied: {
            status: 'success',
            name: packagePolicyName,
            id: packagePolicyId,
            version: agentPolicyRevision,
            endpoint_policy_version: appliedPackageRevision,
          },
        },
      },
      elastic: { agent: { id: EVAL_PM_ROLLOUT_STATUS_AGENT_ID } },
    },
  });

  await internalEsClient.index({
    index: '.fleet-agents',
    id: EVAL_PM_ROLLOUT_STATUS_AGENT_ID,
    refresh: true,
    document: {
      '@timestamp': now,
      updated_at: now,
      type: 'PERMANENT',
      active: true,
      enrolled_at: now,
      last_checkin: now,
      status: 'online',
      last_known_status: 'online',
      last_checkin_status: 'online',
      policy_id: agentPolicyId,
      policy_revision_idx: agentPolicyRevision,
      agent: { id: EVAL_PM_ROLLOUT_STATUS_AGENT_ID, version: '9.5.0-SNAPSHOT' },
      local_metadata: { host: { name: EVAL_PM_ROLLOUT_STATUS_HOST_NAME } },
      packages: ['endpoint'],
    },
  });
};

export const seedPolicyManagementRolloutStatus = async ({
  kbnClient,
  esClient,
  internalEsClient,
  log,
}: {
  kbnClient: KbnClient;
  esClient: Client;
  internalEsClient: Client;
  log: ToolingLog;
}): Promise<SeededPolicyManagementRolloutStatus> => {
  const captured: IndexedFleetEndpointPolicyResponse[] = [];

  try {
    const indexed = await indexFleetEndpointPolicy(
      kbnClient,
      EVAL_PM_ROLLOUT_STATUS_PACKAGE_POLICY_NAME,
      undefined,
      EVAL_PM_ROLLOUT_STATUS_AGENT_POLICY_NAME,
      log
    );
    captured.push(indexed);

    const integrationPolicy = indexed.integrationPolicies[0];
    if (integrationPolicy === undefined) {
      throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_SEED_ERROR);
    }

    const initialItem = await readPackagePolicyItem(kbnClient, integrationPolicy.id);

    const appliedPackageRevision = readRevision(initialItem);
    const agentPolicyId = readUniqueAssignedAgentPolicyId(initialItem);

    const updateBody = toPackagePolicyUpdateBody(initialItem);
    setLinuxEventsProcessFalse(updateBody);

    await kbnClient.request({
      path: packagePolicyRouteService.getUpdatePath(integrationPolicy.id),
      method: 'PUT',
      headers: PUBLIC_V1_HEADERS,
      body: updateBody,
    });

    const persistedItem = await readPackagePolicyItem(kbnClient, integrationPolicy.id);
    const packageRevision = readRevision(persistedItem);
    if (packageRevision <= appliedPackageRevision) {
      throw new Error(POLICY_MANAGEMENT_ROLLOUT_STATUS_REVISION_ERROR);
    }

    const [agentPolicy] = indexed.agentPolicies;
    const agentPolicyRevision =
      agentPolicy !== undefined && isFiniteNumber(agentPolicy.revision) ? agentPolicy.revision : 1;

    await seedRolloutStatusDocuments({
      esClient,
      internalEsClient,
      agentPolicyId,
      packagePolicyId: integrationPolicy.id,
      packagePolicyName: integrationPolicy.name,
      appliedPackageRevision,
      agentPolicyRevision,
    });

    await waitForPolicyManagementTransformPropagation(esClient, log, {
      agentId: EVAL_PM_ROLLOUT_STATUS_AGENT_ID,
      agentPolicyId,
      packagePolicyId: integrationPolicy.id,
      packageRevision,
      appliedPackageRevision,
    });

    log.info(
      `Seeded rollout-status Fleet package policy ${integrationPolicy.name} (${integrationPolicy.id}) with applied revision ${appliedPackageRevision} and current revision ${packageRevision}.`
    );

    return {
      id: integrationPolicy.id,
      name: integrationPolicy.name,
      indexed,
      agentId: EVAL_PM_ROLLOUT_STATUS_AGENT_ID,
      agentPolicyId,
      packageRevision,
      appliedPackageRevision,
    };
  } catch (error) {
    await deleteFleetAgent(internalEsClient, EVAL_PM_ROLLOUT_STATUS_AGENT_ID);
    for (const indexed of captured) {
      await deleteIndexedFleetEndpointPolicies(kbnClient, indexed);
    }
    await cleanupPolicyManagementSeededData({ esClient, internalEsClient });
    throw error;
  }
};

export const cleanupPolicyManagementRolloutStatus = async ({
  kbnClient,
  esClient,
  internalEsClient,
  seeded,
}: {
  kbnClient: KbnClient;
  esClient: Client;
  internalEsClient: Client;
  seeded: SeededPolicyManagementRolloutStatus;
}): Promise<void> => {
  await deleteFleetAgent(internalEsClient, seeded.agentId);
  await cleanupPolicyManagementPackagePolicy({ kbnClient, indexed: seeded.indexed });
  await cleanupPolicyManagementSeededData({ esClient, internalEsClient });
};
