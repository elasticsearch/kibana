/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { escapeQuotes } from '@kbn/es-query';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { FLEET_ENDPOINT_PACKAGE, PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import type { PolicyConfig } from '../../../../../common/endpoint/types';
import {
  createEndpointPolicySnapshot,
  type EndpointPolicyIdentity,
} from '../domain/endpoint_policy_snapshot';
import {
  normalizeEndpointPolicy,
  type NormalizedEndpointPolicy,
} from '../domain/normalized_endpoint_policy';
import type { NormalizedPolicyConfig } from '../domain/normalized_policy_config';
import type { PolicyAccessContext } from './access_context';
import {
  InvalidEndpointPolicyError,
  PolicyAmbiguousNameError,
  PolicyNotFoundError,
} from './policy_errors';
import { getPackagePolicyById, isRecognizedLookupMiss } from './policy_lookup';

const NAME_LOOKUP_PAGE = 1;
const NAME_LOOKUP_PER_PAGE = 11;

export type PolicyIdentity = EndpointPolicyIdentity;

export type EndpointPolicyRead = Readonly<{
  policy: PolicyIdentity;
  storedConfig: PolicyConfig;
  normalizedConfig: NormalizedPolicyConfig;
  normalizedHash: string;
}>;

export const ensureResolvedInCurrentSpace = async (
  access: PolicyAccessContext,
  policyId: string
): Promise<void> => {
  try {
    await access.fleet.ensureInCurrentSpace({ integrationPolicyIds: [policyId] });
  } catch (error) {
    if (error instanceof Error && isRecognizedLookupMiss(error)) {
      throw new PolicyNotFoundError();
    }

    throw error;
  }
};

export const getNormalizedEndpointPolicy = async (
  access: PolicyAccessContext,
  args: Readonly<{ idOrName: string }>
): Promise<NormalizedEndpointPolicy> => {
  const resolved = await resolvePackagePolicy(access, args.idOrName);
  await ensureResolvedInCurrentSpace(access, resolved.id);

  const snapshot = createEndpointPolicySnapshot(resolved);

  try {
    return normalizeEndpointPolicy(snapshot);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new InvalidEndpointPolicyError();
    }

    throw error;
  }
};

const findPackagePolicyByExactEndpointName = async (
  access: PolicyAccessContext,
  identifier: string
): Promise<PackagePolicy> => {
  const nameClause = `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.name:"${escapeQuotes(identifier)}"`;
  const kuery = `${access.fleet.endpointPolicyKuery} AND ${nameClause}`;
  const { items, total } = await access.fleet.packagePolicy.list(access.fleet.getSoClient(), {
    kuery,
    page: NAME_LOOKUP_PAGE,
    perPage: NAME_LOOKUP_PER_PAGE,
    spaceId: access.spaceId,
  });

  if (items.length === 0) {
    throw new PolicyNotFoundError();
  }

  if (items.length > 1) {
    throw new PolicyAmbiguousNameError(
      items.map(({ id, name }) => ({ id, name })),
      Math.max(total, items.length)
    );
  }

  const [match] = items;
  if (match == null) {
    throw new PolicyNotFoundError();
  }

  return match;
};

export const resolvePackagePolicy = async (
  access: PolicyAccessContext,
  idOrName: string
): Promise<PackagePolicy> => {
  const identifier = idOrName.trim();
  const byId = await getPackagePolicyById(access, identifier);

  if (byId !== undefined) {
    if (byId.package?.name !== FLEET_ENDPOINT_PACKAGE) {
      throw new PolicyNotFoundError();
    }

    return byId;
  }

  return findPackagePolicyByExactEndpointName(access, identifier);
};

export const getEndpointPolicy = async (
  access: PolicyAccessContext,
  args: Readonly<{ idOrName: string }>
): Promise<EndpointPolicyRead> => {
  const normalized = await getNormalizedEndpointPolicy(access, args);

  return {
    policy: normalized.snapshot.identity,
    storedConfig: normalized.storedConfig,
    normalizedConfig: normalized.normalizedConfig,
    normalizedHash: normalized.normalizedHash,
  };
};
