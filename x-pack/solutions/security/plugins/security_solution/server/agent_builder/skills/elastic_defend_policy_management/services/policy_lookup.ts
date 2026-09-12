/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { FleetNotFoundError } from '@kbn/fleet-plugin/server/errors';
import { NotFoundError } from '../../../../endpoint/errors';
import type { PolicyAccessContext } from './access_context';

export const isRecognizedLookupMiss = (error: Error): boolean => {
  if (error instanceof NotFoundError || error instanceof FleetNotFoundError) {
    return true;
  }

  return SavedObjectsErrorHelpers.isNotFoundError(error);
};

export const uniqueAgentPolicyIds = (policyIds: readonly string[] | undefined): string[] => [
  ...new Set((policyIds ?? []).filter((policyId) => policyId.length > 0)),
];

export const getPackagePolicyById = async (
  access: PolicyAccessContext,
  policyId: string
): Promise<PackagePolicy | undefined> => {
  try {
    const policy = await access.fleet.packagePolicy.get(access.fleet.getSoClient(), policyId, {
      spaceId: access.spaceId,
    });

    if (policy == null) {
      return undefined;
    }

    return policy;
  } catch (error) {
    if (error instanceof Error && isRecognizedLookupMiss(error)) {
      return undefined;
    }

    throw error;
  }
};
