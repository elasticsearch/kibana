/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import {
  AGENT_POLICY_SAVED_OBJECT_TYPE,
  API_VERSIONS,
  agentPolicyRouteService,
  agentRouteService,
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  packagePolicyRouteService,
} from '@kbn/fleet-plugin/common';
import type {
  GetAgentPoliciesResponse,
  GetAgentStatusResponse,
  GetOnePackagePolicyResponse,
  GetPackagePoliciesResponse,
  PackagePolicy,
} from '@kbn/fleet-plugin/common';
import { AgentStatusKueryHelper } from '@kbn/fleet-plugin/common/services';
import type { KbnClient } from '@kbn/test';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  deleteIndexedFleetEndpointPolicies,
  indexFleetEndpointPolicy,
} from '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy';
import type { IndexedFleetEndpointPolicyResponse } from '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy';
import { setProtectionModeAndPopup } from '@kbn/security-solution-plugin/common/endpoint/models/policy_config_helpers';
import type { PolicyConfig, PolicyData } from '@kbn/security-solution-plugin/common/endpoint/types';
import {
  AntivirusRegistrationModes,
  PolicyOperatingSystem,
  ProtectionModes,
} from '@kbn/security-solution-plugin/common/endpoint/types';
import type { PackagePolicyUpdateBody } from './package_policy_update_body';
import { toPackagePolicyUpdateBody } from './package_policy_update_body';

export type { IndexedFleetEndpointPolicyResponse };

export const EVAL_PM_PACKAGE_POLICY_NAME = 'eval-agent-pm-assess';
export const EVAL_PM_AGENT_POLICY_NAME = 'eval-agent-pm-assess-agent';

export const EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME = 'eval-agent-pm-compare-prevent';
export const EVAL_PM_COMPARE_PREVENT_AGENT_POLICY_NAME = 'eval-agent-pm-compare-prevent-agent';
export const EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME = 'eval-agent-pm-compare-detect';
export const EVAL_PM_COMPARE_DETECT_AGENT_POLICY_NAME = 'eval-agent-pm-compare-detect-agent';

export const EVAL_PM_DUPLICATE_A_PACKAGE_POLICY_NAME = 'eval-agent-pm-duplicate-a';
export const EVAL_PM_DUPLICATE_A_AGENT_POLICY_NAME = 'eval-agent-pm-duplicate-a-agent';
export const EVAL_PM_DUPLICATE_B_PACKAGE_POLICY_NAME = 'eval-agent-pm-duplicate-b';
export const EVAL_PM_DUPLICATE_B_AGENT_POLICY_NAME = 'eval-agent-pm-duplicate-b-agent';

export const EVAL_PM_USED_AGENT_ID = 'eval-agent-pm-used-001';
export const EVAL_PM_USED_HOST_NAME = 'eval-pm-used-host';

export const EVAL_PM_FLEET_PACKAGE_POLICY_NAMES: readonly string[] = [
  EVAL_PM_PACKAGE_POLICY_NAME,
  EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME,
  EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME,
  EVAL_PM_DUPLICATE_A_PACKAGE_POLICY_NAME,
  EVAL_PM_DUPLICATE_B_PACKAGE_POLICY_NAME,
];

export const EVAL_PM_FLEET_AGENT_POLICY_NAMES: readonly string[] = [
  EVAL_PM_AGENT_POLICY_NAME,
  EVAL_PM_COMPARE_PREVENT_AGENT_POLICY_NAME,
  EVAL_PM_COMPARE_DETECT_AGENT_POLICY_NAME,
  EVAL_PM_DUPLICATE_A_AGENT_POLICY_NAME,
  EVAL_PM_DUPLICATE_B_AGENT_POLICY_NAME,
];

export const POLICY_MANAGEMENT_PACKAGE_POLICY_SEED_ERROR =
  'seedPolicyManagementPackagePolicy: indexFleetEndpointPolicy returned no integration policy';

export const POLICY_MANAGEMENT_PACKAGE_POLICY_ITEM_ERROR =
  'seedPolicyManagementPackagePolicy: Fleet package policy GET did not return a PolicyData item';

export const POLICY_MANAGEMENT_PACKAGE_POLICY_MALWARE_ERROR =
  'seedPolicyManagementPackagePolicy: persisted PolicyConfig malware modes are not all off';

export const POLICY_MANAGEMENT_PACKAGE_POLICY_ASSIGNMENT_ERROR =
  'seedPolicyManagementPackagePolicy: persisted policy_ids must contain exactly one unique nonempty agent-policy id';

export const POLICY_MANAGEMENT_PACKAGE_POLICY_STATUS_RESULT_ERROR =
  'seedPolicyManagementPackagePolicy: Fleet agent-status GET results.all is missing or not numeric';

export const POLICY_MANAGEMENT_PACKAGE_POLICY_STATUS_COUNT_ERROR =
  'seedPolicyManagementPackagePolicy: Fleet agent-status GET results.all must be 0';

export const POLICY_MANAGEMENT_COMPARE_POLICY_SEED_ERROR =
  'seedPolicyManagementComparePolicies: indexFleetEndpointPolicy returned no integration policy';

export const POLICY_MANAGEMENT_COMPARE_POLICY_ITEM_ERROR =
  'seedPolicyManagementComparePolicies: Fleet package policy GET did not return a PolicyData item';

export const POLICY_MANAGEMENT_COMPARE_POLICY_STRIP_ERROR =
  'seedPolicyManagementComparePolicies: stripped package policy is missing PolicyConfig or still has managed fields';

export const POLICY_MANAGEMENT_COMPARE_POLICY_PERSIST_ERROR =
  'seedPolicyManagementComparePolicies: persisted PolicyConfig malware modes, popups, or antivirus-registration derivation do not match';

export const POLICY_MANAGEMENT_USAGE_AGENT_POLICY_ERROR =
  'seedPolicyManagementUsageEvidence: Fleet agent policy id is missing';

const MALWARE_OS_LIST: ReadonlyArray<PolicyOperatingSystem> = [
  PolicyOperatingSystem.windows,
  PolicyOperatingSystem.mac,
  PolicyOperatingSystem.linux,
];

const PUBLIC_V1_HEADERS = {
  'elastic-api-version': API_VERSIONS.public.v1,
};

const LEFTOVER_LOOKUP_PAGE_SIZE = 50;

export interface SeededPolicyManagementPackagePolicy {
  id: string;
  name: string;
  indexed: IndexedFleetEndpointPolicyResponse;
}

export interface SeededPolicyManagementComparePolicies {
  prevent: SeededPolicyManagementPackagePolicy;
  detect: SeededPolicyManagementPackagePolicy;
}

export interface SeededPolicyManagementDuplicatePolicies {
  first: SeededPolicyManagementPackagePolicy;
  second: SeededPolicyManagementPackagePolicy;
}

export interface SeededPolicyManagementUsageEvidence {
  agentId: string;
  agentPolicyId: string;
}

export interface SeededPolicyManagementPolicies {
  compare: SeededPolicyManagementComparePolicies;
  duplicates: SeededPolicyManagementDuplicatePolicies;
  usage: SeededPolicyManagementUsageEvidence;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isProtectionMode = (value: unknown): value is ProtectionModes =>
  value === ProtectionModes.detect ||
  value === ProtectionModes.prevent ||
  value === ProtectionModes.off;

const isAntivirusRegistrationMode = (value: unknown): value is AntivirusRegistrationModes =>
  value === AntivirusRegistrationModes.enabled ||
  value === AntivirusRegistrationModes.disabled ||
  value === AntivirusRegistrationModes.sync;

const hasMalwareModeAndPopup = (osPolicy: unknown): boolean => {
  if (!isRecord(osPolicy) || !isRecord(osPolicy.malware) || !isRecord(osPolicy.popup)) {
    return false;
  }
  if (!isRecord(osPolicy.popup.malware)) {
    return false;
  }
  return (
    isProtectionMode(osPolicy.malware.mode) && typeof osPolicy.popup.malware.enabled === 'boolean'
  );
};

const isPolicyConfig = (value: unknown): value is PolicyConfig => {
  if (!isRecord(value) || !isRecord(value.windows)) {
    return false;
  }
  if (!isRecord(value.windows.antivirus_registration)) {
    return false;
  }
  return (
    hasMalwareModeAndPopup(value.windows) &&
    hasMalwareModeAndPopup(value.mac) &&
    hasMalwareModeAndPopup(value.linux) &&
    isAntivirusRegistrationMode(value.windows.antivirus_registration.mode) &&
    typeof value.windows.antivirus_registration.enabled === 'boolean'
  );
};

const isPolicyData = (value: unknown): value is PolicyData => {
  if (!isRecord(value) || !Array.isArray(value.inputs)) {
    return false;
  }
  const [input] = value.inputs;
  if (input === undefined || !isRecord(input) || !isRecord(input.config)) {
    return false;
  }
  if (!isRecord(input.config.policy)) {
    return false;
  }
  return isPolicyConfig(input.config.policy.value);
};

const readPackagePolicyItem = async (
  kbnClient: KbnClient,
  id: string
): Promise<GetOnePackagePolicyResponse['item']> => {
  const response = await kbnClient.request<GetOnePackagePolicyResponse>({
    path: packagePolicyRouteService.getInfoPath(id),
    method: 'GET',
    headers: PUBLIC_V1_HEADERS,
  });
  return response.data.item;
};

const getPolicyConfig = (item: Pick<PolicyData, 'inputs'>): PolicyConfig => {
  const [input] = item.inputs;
  if (input === undefined) {
    throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_STRIP_ERROR);
  }
  return input.config.policy.value;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

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

const uniqueAssignedAgentPolicyIds = (policyIds: unknown): string[] | undefined => {
  if (policyIds === undefined) {
    return [];
  }
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

const readUniqueAssignedAgentPolicyId = (item: PolicyData): string => {
  const uniqueIds = uniqueAssignedAgentPolicyIds(item.policy_ids);
  if (uniqueIds === undefined) {
    throw new Error(POLICY_MANAGEMENT_PACKAGE_POLICY_ITEM_ERROR);
  }

  const [agentPolicyId] = uniqueIds;
  if (uniqueIds.length !== 1 || agentPolicyId === undefined) {
    throw new Error(POLICY_MANAGEMENT_PACKAGE_POLICY_ASSIGNMENT_ERROR);
  }

  return agentPolicyId;
};

const assertPersistedMalwareOff = (item: PolicyData): void => {
  const policyConfig = getPolicyConfig(item);
  for (const os of MALWARE_OS_LIST) {
    if (policyConfig[os].malware.mode !== ProtectionModes.off) {
      throw new Error(POLICY_MANAGEMENT_PACKAGE_POLICY_MALWARE_ERROR);
    }
  }
};

const buildExcludeUnenrolledAgentsKuery = (): string =>
  `not (${AgentStatusKueryHelper.buildKueryForUnenrolledAgents()})`;

const readAgentStatusAll = (data: GetAgentStatusResponse): number => {
  if (!isFiniteNumber(data.results.all)) {
    throw new Error(POLICY_MANAGEMENT_PACKAGE_POLICY_STATUS_RESULT_ERROR);
  }
  return data.results.all;
};

const assertZeroEnrolledAgents = async (
  kbnClient: KbnClient,
  agentPolicyId: string
): Promise<void> => {
  const response = await kbnClient.request<GetAgentStatusResponse>({
    path: agentRouteService.getStatusPath(),
    method: 'GET',
    headers: PUBLIC_V1_HEADERS,
    query: {
      policyId: agentPolicyId,
      kuery: buildExcludeUnenrolledAgentsKuery(),
    },
  });

  if (readAgentStatusAll(response.data) !== 0) {
    throw new Error(POLICY_MANAGEMENT_PACKAGE_POLICY_STATUS_COUNT_ERROR);
  }
};

const assertPersistedPaidFixturePreconditions = async ({
  kbnClient,
  packagePolicyId,
}: {
  kbnClient: KbnClient;
  packagePolicyId: string;
}): Promise<void> => {
  const persistedItem = await readPackagePolicyItem(kbnClient, packagePolicyId);
  if (!isPolicyData(persistedItem)) {
    throw new Error(POLICY_MANAGEMENT_PACKAGE_POLICY_ITEM_ERROR);
  }

  assertPersistedMalwareOff(persistedItem);
  await assertZeroEnrolledAgents(kbnClient, readUniqueAssignedAgentPolicyId(persistedItem));
};

const buildComparePolicyUpdateBody = ({
  item,
  mode,
  popupEnabled,
}: {
  item: PackagePolicy;
  mode: ProtectionModes;
  popupEnabled: boolean;
}): PackagePolicyUpdateBody => {
  if (!isPolicyData(item)) {
    throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_ITEM_ERROR);
  }

  const updateBody = toPackagePolicyUpdateBody(structuredClone(item));
  const policyConfig = structuredClone(getPolicyConfig(item));
  policyConfig.windows.antivirus_registration.mode = AntivirusRegistrationModes.sync;
  setProtectionModeAndPopup({
    policy: policyConfig,
    protection: 'malware',
    osList: MALWARE_OS_LIST,
    mode,
    syncPopupEnabled: true,
    popupEnabled,
  });

  const [input] = updateBody.inputs;
  const policy = input?.config?.policy;
  if (input === undefined || policy === undefined) {
    throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_STRIP_ERROR);
  }
  policy.value = policyConfig;

  return updateBody;
};

const assertPersistedComparePolicyConfig = ({
  item,
  mode,
  popupEnabled,
  derivedAntivirusEnabled,
}: {
  item: PackagePolicy;
  mode: ProtectionModes;
  popupEnabled: boolean;
  derivedAntivirusEnabled: boolean;
}): void => {
  if (!isPolicyData(item)) {
    throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_PERSIST_ERROR);
  }

  const policyConfig = getPolicyConfig(item);
  for (const os of MALWARE_OS_LIST) {
    if (policyConfig[os].malware.mode !== mode) {
      throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_PERSIST_ERROR);
    }
    if (policyConfig[os].popup.malware.enabled !== popupEnabled) {
      throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_PERSIST_ERROR);
    }
  }

  if (policyConfig.windows.antivirus_registration.mode !== AntivirusRegistrationModes.sync) {
    throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_PERSIST_ERROR);
  }
  if (policyConfig.windows.antivirus_registration.enabled !== derivedAntivirusEnabled) {
    throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_PERSIST_ERROR);
  }
};

const seedComparePolicySide = async ({
  kbnClient,
  log,
  packagePolicyName,
  agentPolicyName,
  mode,
  popupEnabled,
  derivedAntivirusEnabled,
  captured,
}: {
  kbnClient: KbnClient;
  log: ToolingLog;
  packagePolicyName: string;
  agentPolicyName: string;
  mode: ProtectionModes;
  popupEnabled: boolean;
  derivedAntivirusEnabled: boolean;
  captured: IndexedFleetEndpointPolicyResponse[];
}): Promise<SeededPolicyManagementPackagePolicy> => {
  const indexed = await indexFleetEndpointPolicy(
    kbnClient,
    packagePolicyName,
    undefined,
    agentPolicyName,
    log
  );
  captured.push(indexed);

  const integrationPolicy = indexed.integrationPolicies[0];
  if (integrationPolicy === undefined) {
    throw new Error(POLICY_MANAGEMENT_COMPARE_POLICY_SEED_ERROR);
  }

  const item = await readPackagePolicyItem(kbnClient, integrationPolicy.id);
  const updateBody = buildComparePolicyUpdateBody({
    item,
    mode,
    popupEnabled,
  });

  await kbnClient.request({
    path: packagePolicyRouteService.getUpdatePath(integrationPolicy.id),
    method: 'PUT',
    headers: PUBLIC_V1_HEADERS,
    body: updateBody,
  });

  const persistedItem = await readPackagePolicyItem(kbnClient, integrationPolicy.id);
  assertPersistedComparePolicyConfig({
    item: persistedItem,
    mode,
    popupEnabled,
    derivedAntivirusEnabled,
  });

  log.info(
    `Seeded compare Fleet package policy ${integrationPolicy.name} (${integrationPolicy.id}).`
  );

  return {
    id: integrationPolicy.id,
    name: integrationPolicy.name,
    indexed,
  };
};

const findPackagePolicyIdsByName = async ({
  kbnClient,
  savedObjectTypes,
  name,
}: {
  kbnClient: KbnClient;
  savedObjectTypes: readonly string[];
  name: string;
}): Promise<string[]> => {
  let lastError: unknown;

  for (const savedObjectType of savedObjectTypes) {
    try {
      const response = await kbnClient.request<GetPackagePoliciesResponse>({
        path: packagePolicyRouteService.getListPath(),
        method: 'GET',
        headers: PUBLIC_V1_HEADERS,
        query: {
          perPage: LEFTOVER_LOOKUP_PAGE_SIZE,
          kuery: `${savedObjectType}.name:"${name}"`,
        },
      });

      return response.data.items.map((item) => item.id).filter((id) => id.length > 0);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const findAgentPolicyIdsByName = async ({
  kbnClient,
  savedObjectTypes,
  name,
}: {
  kbnClient: KbnClient;
  savedObjectTypes: readonly string[];
  name: string;
}): Promise<string[]> => {
  let lastError: unknown;

  for (const savedObjectType of savedObjectTypes) {
    try {
      const response = await kbnClient.request<GetAgentPoliciesResponse>({
        path: agentPolicyRouteService.getListPath(),
        method: 'GET',
        headers: PUBLIC_V1_HEADERS,
        query: {
          perPage: LEFTOVER_LOOKUP_PAGE_SIZE,
          kuery: `${savedObjectType}.name:"${name}"`,
        },
      });

      return response.data.items.map((item) => item.id).filter((id) => id.length > 0);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const cleanupPolicyManagementLeftoverFleetPolicies = async ({
  kbnClient,
  log,
  packagePolicyNames,
  agentPolicyNames,
}: {
  kbnClient: KbnClient;
  log: ToolingLog;
  packagePolicyNames: readonly string[];
  agentPolicyNames: readonly string[];
}): Promise<void> => {
  for (const name of packagePolicyNames) {
    try {
      const ids = await findPackagePolicyIdsByName({
        kbnClient,
        savedObjectTypes: [
          PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
        ],
        name,
      });

      if (ids.length > 0) {
        log.info(`Removing leftover Fleet package policy ${name} (${ids.join(', ')}).`);
        await kbnClient.request({
          path: packagePolicyRouteService.getDeletePath(),
          method: 'POST',
          headers: PUBLIC_V1_HEADERS,
          body: { packagePolicyIds: ids, force: true },
        });
      }
    } catch (error) {
      log.warning(`Failed to remove leftover Fleet package policy ${name}: ${error}`);
    }
  }

  for (const name of agentPolicyNames) {
    try {
      const ids = await findAgentPolicyIdsByName({
        kbnClient,
        savedObjectTypes: [LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE, AGENT_POLICY_SAVED_OBJECT_TYPE],
        name,
      });

      for (const id of ids) {
        log.info(`Removing leftover Fleet agent policy ${name} (${id}).`);
        await kbnClient.request({
          path: agentPolicyRouteService.getDeletePath(),
          method: 'POST',
          headers: PUBLIC_V1_HEADERS,
          body: { agentPolicyId: id, force: true },
        });
      }
    } catch (error) {
      log.warning(`Failed to remove leftover Fleet agent policy ${name}: ${error}`);
    }
  }
};

export const seedPolicyManagementPackagePolicy = async ({
  kbnClient,
  log,
}: {
  kbnClient: KbnClient;
  log: ToolingLog;
}): Promise<SeededPolicyManagementPackagePolicy> => {
  const captured: IndexedFleetEndpointPolicyResponse[] = [];

  try {
    const indexed = await indexFleetEndpointPolicy(
      kbnClient,
      EVAL_PM_PACKAGE_POLICY_NAME,
      undefined,
      EVAL_PM_AGENT_POLICY_NAME,
      log
    );
    captured.push(indexed);

    const integrationPolicy = indexed.integrationPolicies[0];
    if (integrationPolicy === undefined) {
      throw new Error(POLICY_MANAGEMENT_PACKAGE_POLICY_SEED_ERROR);
    }

    await assertPersistedPaidFixturePreconditions({
      kbnClient,
      packagePolicyId: integrationPolicy.id,
    });

    log.info(`Seeded Fleet package policy ${integrationPolicy.name} (${integrationPolicy.id}).`);

    return {
      id: integrationPolicy.id,
      name: integrationPolicy.name,
      indexed,
    };
  } catch (error) {
    for (const indexed of captured) {
      await deleteIndexedFleetEndpointPolicies(kbnClient, indexed);
    }
    throw error;
  }
};

export const cleanupPolicyManagementPackagePolicy = async ({
  kbnClient,
  indexed,
}: {
  kbnClient: KbnClient;
  indexed: IndexedFleetEndpointPolicyResponse;
}): Promise<void> => {
  await deleteIndexedFleetEndpointPolicies(kbnClient, indexed);
};

export const seedPolicyManagementComparePolicies = async ({
  kbnClient,
  log,
}: {
  kbnClient: KbnClient;
  log: ToolingLog;
}): Promise<SeededPolicyManagementComparePolicies> => {
  const captured: IndexedFleetEndpointPolicyResponse[] = [];

  try {
    const prevent = await seedComparePolicySide({
      kbnClient,
      log,
      packagePolicyName: EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME,
      agentPolicyName: EVAL_PM_COMPARE_PREVENT_AGENT_POLICY_NAME,
      mode: ProtectionModes.prevent,
      popupEnabled: true,
      derivedAntivirusEnabled: true,
      captured,
    });
    const detect = await seedComparePolicySide({
      kbnClient,
      log,
      packagePolicyName: EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME,
      agentPolicyName: EVAL_PM_COMPARE_DETECT_AGENT_POLICY_NAME,
      mode: ProtectionModes.detect,
      popupEnabled: false,
      derivedAntivirusEnabled: false,
      captured,
    });

    return { prevent, detect };
  } catch (error) {
    for (const indexed of captured) {
      await deleteIndexedFleetEndpointPolicies(kbnClient, indexed);
    }
    throw error;
  }
};

export const cleanupPolicyManagementComparePolicies = async ({
  kbnClient,
  seeded,
}: {
  kbnClient: KbnClient;
  seeded: SeededPolicyManagementComparePolicies;
}): Promise<void> => {
  await cleanupPolicyManagementPackagePolicy({ kbnClient, indexed: seeded.prevent.indexed });
  await cleanupPolicyManagementPackagePolicy({ kbnClient, indexed: seeded.detect.indexed });
};

export const seedPolicyManagementDuplicatePolicies = async ({
  kbnClient,
  log,
}: {
  kbnClient: KbnClient;
  log: ToolingLog;
}): Promise<SeededPolicyManagementDuplicatePolicies> => {
  const captured: IndexedFleetEndpointPolicyResponse[] = [];

  try {
    const first = await seedComparePolicySide({
      kbnClient,
      log,
      packagePolicyName: EVAL_PM_DUPLICATE_A_PACKAGE_POLICY_NAME,
      agentPolicyName: EVAL_PM_DUPLICATE_A_AGENT_POLICY_NAME,
      mode: ProtectionModes.detect,
      popupEnabled: true,
      derivedAntivirusEnabled: false,
      captured,
    });
    const second = await seedComparePolicySide({
      kbnClient,
      log,
      packagePolicyName: EVAL_PM_DUPLICATE_B_PACKAGE_POLICY_NAME,
      agentPolicyName: EVAL_PM_DUPLICATE_B_AGENT_POLICY_NAME,
      mode: ProtectionModes.detect,
      popupEnabled: true,
      derivedAntivirusEnabled: false,
      captured,
    });

    return { first, second };
  } catch (error) {
    for (const indexed of captured) {
      await deleteIndexedFleetEndpointPolicies(kbnClient, indexed);
    }
    throw error;
  }
};

export const cleanupPolicyManagementDuplicatePolicies = async ({
  kbnClient,
  seeded,
}: {
  kbnClient: KbnClient;
  seeded: SeededPolicyManagementDuplicatePolicies;
}): Promise<void> => {
  await cleanupPolicyManagementPackagePolicy({ kbnClient, indexed: seeded.first.indexed });
  await cleanupPolicyManagementPackagePolicy({ kbnClient, indexed: seeded.second.indexed });
};

export const seedPolicyManagementUsageEvidence = async ({
  internalEsClient,
  agentPolicyId,
  log,
}: {
  internalEsClient: Client;
  agentPolicyId: string;
  log: ToolingLog;
}): Promise<SeededPolicyManagementUsageEvidence> => {
  if (agentPolicyId.length === 0) {
    throw new Error(POLICY_MANAGEMENT_USAGE_AGENT_POLICY_ERROR);
  }

  const now = new Date().toISOString();
  await internalEsClient.index({
    index: '.fleet-agents',
    id: EVAL_PM_USED_AGENT_ID,
    refresh: true,
    document: {
      '@timestamp': now,
      type: 'PERMANENT',
      active: true,
      enrolled_at: now,
      last_checkin: now,
      status: 'online',
      last_known_status: 'online',
      last_checkin_status: 'online',
      policy_id: agentPolicyId,
      policy_revision_idx: 1,
      agent: { id: EVAL_PM_USED_AGENT_ID, version: '9.5.0-SNAPSHOT' },
      local_metadata: { host: { name: EVAL_PM_USED_HOST_NAME } },
      packages: ['endpoint'],
    },
  });

  log.info(`Seeded enrolled Fleet agent ${EVAL_PM_USED_AGENT_ID} on ${agentPolicyId}.`);

  return {
    agentId: EVAL_PM_USED_AGENT_ID,
    agentPolicyId,
  };
};

const readCapturedAgentPolicyId = (indexed: IndexedFleetEndpointPolicyResponse): string => {
  const [agentPolicy] = indexed.agentPolicies;
  if (agentPolicy === undefined || agentPolicy.id.length === 0) {
    throw new Error(POLICY_MANAGEMENT_USAGE_AGENT_POLICY_ERROR);
  }
  return agentPolicy.id;
};

export const seedPolicyManagementPolicies = async ({
  kbnClient,
  internalEsClient,
  log,
}: {
  kbnClient: KbnClient;
  internalEsClient: Client;
  log: ToolingLog;
}): Promise<SeededPolicyManagementPolicies> => {
  const captured: IndexedFleetEndpointPolicyResponse[] = [];

  try {
    const compare = await seedPolicyManagementComparePolicies({ kbnClient, log });
    captured.push(compare.prevent.indexed, compare.detect.indexed);

    const duplicates = await seedPolicyManagementDuplicatePolicies({ kbnClient, log });
    captured.push(duplicates.first.indexed, duplicates.second.indexed);

    const usage = await seedPolicyManagementUsageEvidence({
      internalEsClient,
      agentPolicyId: readCapturedAgentPolicyId(compare.prevent.indexed),
      log,
    });

    return { compare, duplicates, usage };
  } catch (error) {
    await deleteFleetAgent(internalEsClient, EVAL_PM_USED_AGENT_ID);
    for (const indexed of captured) {
      await deleteIndexedFleetEndpointPolicies(kbnClient, indexed);
    }
    throw error;
  }
};

export const cleanupPolicyManagementPolicies = async ({
  kbnClient,
  internalEsClient,
  seeded,
}: {
  kbnClient: KbnClient;
  internalEsClient: Client;
  seeded: SeededPolicyManagementPolicies;
}): Promise<void> => {
  await deleteFleetAgent(internalEsClient, EVAL_PM_USED_AGENT_ID);
  await cleanupPolicyManagementComparePolicies({ kbnClient, seeded: seeded.compare });
  await cleanupPolicyManagementDuplicatePolicies({ kbnClient, seeded: seeded.duplicates });
};
