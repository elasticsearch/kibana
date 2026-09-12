/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { createEndpointPolicySnapshot } from '../domain/endpoint_policy_snapshot';
import {
  normalizeEndpointPolicy,
  type EndpointPolicySummary,
} from '../domain/normalized_endpoint_policy';
import type { PolicyAccessContext } from './access_context';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 50;
const LIST_STRING_CAP = 512;

export type PolicyPosture = EndpointPolicySummary;

export type ListPolicyItem = Readonly<{
  id: string;
  name: string;
  description: string;
  revision: number;
  version: string;
  updatedAt?: string;
  packageVersion?: string;
  name_string_truncated?: true;
  description_string_truncated?: true;
  normalizedHash: string;
  posture: PolicyPosture;
}>;

export type ListPoliciesDto = Readonly<{
  population: 'endpoint_package_policies';
  page: number;
  per_page: number;
  items: readonly ListPolicyItem[];
  value_total: number;
  has_more: boolean;
  invalid_policy_count: number;
}>;

export type ListEndpointPoliciesPage = Readonly<{
  dto: ListPoliciesDto;
  assignmentsById: ReadonlyMap<string, readonly string[]>;
}>;

const toBoundedPage = (value: number): number => {
  const page = Math.trunc(value);
  return Number.isInteger(page) && page >= 1 ? page : DEFAULT_PAGE;
};

const toBoundedPerPage = (value: number): number => {
  const perPage = Math.trunc(value);
  if (!Number.isInteger(perPage) || perPage < 1) {
    return DEFAULT_PER_PAGE;
  }

  return Math.min(perPage, MAX_PER_PAGE);
};

const capListString = (value: string): Readonly<{ text: string; truncated: boolean }> => {
  if (value.length <= LIST_STRING_CAP) {
    return { text: value, truncated: false };
  }

  return { text: value.slice(0, LIST_STRING_CAP), truncated: true };
};

const toListPolicyItem = (row: PackagePolicy): ListPolicyItem | undefined => {
  try {
    const snapshot = createEndpointPolicySnapshot(row);
    const normalized = normalizeEndpointPolicy(snapshot);
    const { identity } = snapshot;
    const { text: name, truncated: nameTruncated } = capListString(identity.name);
    const { text: description, truncated: descriptionTruncated } = capListString(
      identity.description
    );

    return {
      id: identity.id,
      name,
      description,
      revision: identity.revision,
      version: identity.version,
      ...(identity.updatedAt === undefined ? {} : { updatedAt: identity.updatedAt }),
      ...(identity.packageVersion === undefined ? {} : { packageVersion: identity.packageVersion }),
      ...(nameTruncated ? { name_string_truncated: true } : {}),
      ...(descriptionTruncated ? { description_string_truncated: true } : {}),
      normalizedHash: normalized.normalizedHash,
      posture: normalized.summary,
    };
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined;
    }

    throw error;
  }
};

export const listEndpointPolicies = async (
  access: PolicyAccessContext,
  args: Readonly<{ page: number; perPage: number }>
): Promise<ListEndpointPoliciesPage> => {
  const page = toBoundedPage(args.page);
  const perPage = toBoundedPerPage(args.perPage);
  const { items: rows, total } = await access.fleet.packagePolicy.list(access.fleet.getSoClient(), {
    kuery: access.fleet.endpointPolicyKuery,
    page,
    perPage,
    spaceId: access.spaceId,
  });

  const items: ListPolicyItem[] = [];
  const assignmentsById = new Map<string, readonly string[]>();
  let invalidPolicyCount = 0;

  for (const row of rows) {
    const item = toListPolicyItem(row);
    if (item === undefined) {
      invalidPolicyCount += 1;
    } else {
      items.push(item);
      assignmentsById.set(row.id, row.policy_ids ?? []);
    }
  }

  return {
    dto: {
      population: 'endpoint_package_policies',
      page,
      per_page: perPage,
      items,
      value_total: total,
      has_more: page * perPage < total,
      invalid_policy_count: invalidPolicyCount,
    },
    assignmentsById,
  };
};
