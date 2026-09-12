/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy } from '@kbn/fleet-plugin/common';

export type EndpointPolicyIdentity = Readonly<{
  id: string;
  name: string;
  description: string;
  revision: number;
  version: string;
  updatedAt?: string;
  updatedBy?: string;
  packageVersion?: string;
}>;

export type EndpointPolicySnapshot = Readonly<{
  identity: EndpointPolicyIdentity;
  agentPolicyIds: readonly string[];
  source: Readonly<PackagePolicy>;
}>;

const uniqueNonemptyAssignmentIds = (
  policyIds: PackagePolicy['policy_ids'] | undefined
): readonly string[] => [...new Set((policyIds ?? []).filter((policyId) => policyId.length > 0))];

export const createEndpointPolicySnapshot = (source: PackagePolicy): EndpointPolicySnapshot => ({
  identity: {
    id: source.id,
    name: source.name,
    description: source.description ?? '',
    revision: source.revision,
    version: typeof source.version === 'string' ? source.version : '',
    ...(source.updated_at !== undefined ? { updatedAt: source.updated_at } : {}),
    ...(source.updated_by !== undefined ? { updatedBy: source.updated_by } : {}),
    ...(source.package?.version !== undefined ? { packageVersion: source.package.version } : {}),
  },
  agentPolicyIds: uniqueNonemptyAssignmentIds(source.policy_ids),
  source,
});
