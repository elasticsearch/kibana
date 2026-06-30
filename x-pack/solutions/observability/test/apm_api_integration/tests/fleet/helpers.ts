/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { PackagePolicy, NewPackagePolicy, AgentPolicy } from '@kbn/fleet-plugin/common';
import type { BetterTest } from '../../common/bettertest';

export function setupFleet(bettertest: BetterTest) {
  return bettertest({ pathname: '/api/fleet/setup', method: 'post' });
}

export async function createAgentPolicy({
  bettertest,
  id,
  name = 'test_agent_policy',
}: {
  bettertest: BetterTest;
  id?: string;
  name?: string;
}) {
  const agentPolicyResponse = await bettertest<{ item: AgentPolicy }>({
    pathname: '/api/fleet/agent_policies',
    method: 'post',
    query: { sys_monitoring: true },
    body: {
      id,
      name,
      description: '',
      namespace: 'default',
      monitoring_enabled: ['logs', 'metrics'],
    },
  });

  return agentPolicyResponse.body.item.id;
}

export async function createPackagePolicy({
  bettertest,
  agentPolicyId,
  id,
  name = 'apm-integration-test-policy',
}: {
  bettertest: BetterTest;
  agentPolicyId: string;
  id?: string;
  name?: string;
}) {
  // Get version of available APM package
  const apmPackageResponse = await bettertest<{ item: any }>({
    pathname: `/api/fleet/epm/packages/apm`,
  });
  const apmPackageVersion = apmPackageResponse?.body?.item?.version ?? 'latest';

  // Create package policy for APM attached to given agent policy id
  const packagePolicyResponse = await bettertest<{ item: NewPackagePolicy }>({
    pathname: '/api/fleet/package_policies',
    method: 'post',
    body: {
      name,
      description: '',
      namespace: 'default',
      policy_id: agentPolicyId,
      id,
      enabled: true,
      inputs: [{ type: 'apm', policy_template: 'apmserver', enabled: true, streams: [], vars: {} }],
      package: { name: 'apm', title: 'Elastic APM', version: apmPackageVersion },
    },
  });
  return packagePolicyResponse.body.item.id as string;
}

export async function deleteAgentPolicy(bettertest: BetterTest, agentPolicyId: string) {
  return await bettertest({
    pathname: '/api/fleet/agent_policies/delete',
    method: 'post',
    body: { agentPolicyId },
  });
}

export async function deletePackagePolicy(bettertest: BetterTest, packagePolicyId: string) {
  return bettertest({
    pathname: `/api/fleet/package_policies/delete`,
    method: 'post',
    body: { packagePolicyIds: [packagePolicyId] },
  });
}

export async function getPackagePolicy(
  bettertest: BetterTest,
  packagePolicyId: string
): Promise<PackagePolicy> {
  const res = await bettertest<{ item: PackagePolicy }>({
    pathname: `/api/fleet/package_policies/${packagePolicyId}`,
  });
  return res.body.item;
}

export async function updatePackagePolicy(
  bettertest: BetterTest,
  packagePolicyId: string,
  body: Partial<NewPackagePolicy>
) {
  const current = await getPackagePolicy(bettertest, packagePolicyId);

  // Strip PackagePolicy-only fields that the PUT endpoint rejects.
  const {
    id: _id,
    revision: _revision,
    updated_at: _updatedAt,
    updated_by: _updatedBy,
    created_at: _createdAt,
    created_by: _createdBy,
    elasticsearch: _elasticsearch,
    ...base
  } = current as any;

  // Strip compiled_input / compiled_stream from inputs.
  const cleanInputs = base.inputs.map(({ compiled_input: _ci, ...input }: any) => ({
    ...input,
    streams: (input.streams ?? []).map(({ compiled_stream: _cs, ...stream }: any) => stream),
  }));

  return bettertest({
    pathname: `/api/fleet/package_policies/${packagePolicyId}`,
    method: 'put',
    body: { ...base, inputs: cleanInputs, ...body },
  });
}

async function getAgentPolicyByName(bettertest: BetterTest, name: string): Promise<PackagePolicy> {
  const res = await bettertest<{ items: PackagePolicy[] }>({
    pathname: `/api/fleet/agent_policies`,
    query: {
      full: true,
      kuery: `name:"${name}"`,
    },
  });
  return res.body.items[0];
}

export async function deleteAgentPolicyAndPackagePolicyByName({
  bettertest,
  agentPolicyName,
  packagePolicyName,
}: {
  bettertest: BetterTest;
  agentPolicyName: string;
  packagePolicyName: string;
}) {
  const agentPolicy = await getAgentPolicyByName(bettertest, agentPolicyName);

  const agentPolicyId = agentPolicy.id;
  // @ts-expect-error
  const packagePolicies = agentPolicy.package_policies as PackagePolicy[];
  const packagePolicyId = packagePolicies.find((packagePolicy) => {
    return packagePolicy.name === packagePolicyName;
  })?.id;

  await deleteAgentPolicy(bettertest, agentPolicyId);
  if (packagePolicyId) {
    await deletePackagePolicy(bettertest, packagePolicyId);
  }
}
