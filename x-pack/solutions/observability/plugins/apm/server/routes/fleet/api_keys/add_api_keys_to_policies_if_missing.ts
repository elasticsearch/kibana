/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NewPackagePolicy, PackagePolicy } from '@kbn/fleet-plugin/common';
import type { CoreStart, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { FleetStartContract } from '@kbn/fleet-plugin/server';
import type { LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import { filter, lastValueFrom, take } from 'rxjs';

import { getInternalSavedObjectsClientForSpaceId } from '../../../lib/helpers/get_internal_saved_objects_client';
import type { APMPluginStartDependencies } from '../../../types';
import { getApmPackagePolicies } from '../get_apm_package_policies';
import { createApmAgentConfigApiKey, createApmSourceMapApiKey } from './create_apm_api_keys';
import { getPackagePolicyWithApiKeys, policyHasApiKey } from '../get_package_policy_decorators';

export async function addApiKeysToEveryPackagePolicyIfMissing({
  coreStartPromise,
  pluginStartPromise,
  logger,
  licensing,
}: {
  coreStartPromise: Promise<CoreStart>;
  pluginStartPromise: Promise<APMPluginStartDependencies>;
  logger: Logger;
  licensing: LicensingPluginSetup;
}) {
  const coreStart = await coreStartPromise;
  const { fleet } = await pluginStartPromise;
  if (!fleet) {
    return;
  }

  // We need to wait for the licence feature to be available,
  // to have our internal saved object client with encrypted saved object working properly
  await lastValueFrom(
    licensing.license$.pipe(
      filter(
        (licence) =>
          licence.getFeature('security').isEnabled && licence.getFeature('security').isAvailable
      ),
      take(1)
    )
  );

  const apmFleetPolicies = await getApmPackagePolicies({
    coreStart,
    fleetPluginStart: fleet,
  });

  return Promise.all(
    apmFleetPolicies.items.map((policy) => {
      const savedObjectsClient = getInternalSavedObjectsClientForSpaceId(
        coreStart,
        policy.spaceIds?.[0]
      );
      return addApiKeysToPackagePolicyIfMissing({
        policy,
        savedObjectsClient,
        coreStart,
        fleet,
        logger,
      });
    })
  );
}

export async function createAndInjectApiKeys<T extends NewPackagePolicy>({
  policy,
  packagePolicyId,
  coreStart,
  logger,
}: {
  policy: T;
  packagePolicyId: string;
  coreStart: CoreStart;
  logger: Logger;
}): Promise<T> {
  const agentConfigApiKey = await createApmAgentConfigApiKey({
    coreStart,
    logger,
    packagePolicyId,
  });

  const sourceMapApiKey = await createApmSourceMapApiKey({
    coreStart,
    logger,
    packagePolicyId,
  });

  return getPackagePolicyWithApiKeys({
    packagePolicy: policy,
    agentConfigApiKey,
    sourceMapApiKey,
  });
}

export async function addApiKeysToPackagePolicyIfMissing({
  policy,
  coreStart,
  savedObjectsClient,
  fleet,
  logger,
}: {
  policy: PackagePolicy;
  savedObjectsClient: SavedObjectsClientContract;
  coreStart: CoreStart;
  fleet: FleetStartContract;
  logger: Logger;
}) {
  if (policyHasApiKey(policy)) {
    logger.debug(`Policy (${policy.id}) already has api key`);
    return;
  }

  logger.debug(`Policy (${policy.id}) does not have api key`);

  const policyWithApiKeys = await createAndInjectApiKeys({
    policy,
    packagePolicyId: policy.id,
    coreStart,
    logger,
  });

  // Strip PackagePolicy-only fields (id, revision, updated_at, updated_by) before passing to
  // packagePolicyService.update(), which expects NewPackagePolicy.
  const { id, revision, updated_at, updated_by, ...policyForUpdate } = policyWithApiKeys;

  const internalESClient = coreStart.elasticsearch.client.asInternalUser;

  const newPolicy = await fleet.packagePolicyService.update(
    savedObjectsClient,
    internalESClient,
    id,
    policyForUpdate
  );

  logger.debug(`Added api keys to policy ${policy.id}`);

  return newPolicy;
}
