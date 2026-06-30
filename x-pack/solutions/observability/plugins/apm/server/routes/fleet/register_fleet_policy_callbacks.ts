/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, CoreStart, SavedObjectsClientContract } from '@kbn/core/server';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import type {
  FleetStartContract,
  PostPackagePolicyCreateCallback,
  PostPackagePolicyDeleteCallback,
  PostPackagePolicyPostCreateCallback,
  PutPackagePolicyUpdateCallback,
} from '@kbn/fleet-plugin/server';
import { get } from 'lodash';
import type { APMIndices } from '@kbn/apm-sources-access-plugin/server';
import { decoratePackagePolicyWithAgentConfigAndSourceMap } from './merge_package_policy_with_apm';
import {
  addApiKeysToPackagePolicyIfMissing,
  createAndInjectApiKeys,
} from './api_keys/add_api_keys_to_policies_if_missing';
import {
  AGENT_CONFIG_API_KEY_PATH,
  SOURCE_MAP_API_KEY_PATH,
  getPackagePolicyWithApiKeys,
  policyHasApiKey,
} from './get_package_policy_decorators';
import { createInternalESClient } from '../../lib/helpers/create_es_client/create_internal_es_client';
import { getInternalSavedObjectsClient } from '../../lib/helpers/get_internal_saved_objects_client';
import type { APMRouteHandlerResources } from '../apm_routes/register_apm_server_routes';

export async function registerFleetPolicyCallbacks({
  logger,
  coreStartPromise,
  plugins,
}: {
  logger: Logger;
  coreStartPromise: Promise<CoreStart>;
  plugins: APMRouteHandlerResources['plugins'];
}) {
  if (!plugins.fleet) {
    return;
  }

  const fleetPluginStart = await plugins.fleet.start();
  const { getApmIndices } = plugins.apmDataAccess.setup;
  const coreStart = await coreStartPromise;

  fleetPluginStart.registerExternalCallback(
    'packagePolicyUpdate',
    onPackagePolicyUpdate({
      fleetPluginStart,
      getApmIndices,
      coreStart,
      logger,
    })
  );

  fleetPluginStart.registerExternalCallback(
    'packagePolicyCreate',
    onPackagePolicyCreate({
      fleetPluginStart,
      getApmIndices,
      coreStart,
    })
  );

  fleetPluginStart.registerExternalCallback(
    'packagePolicyDelete',
    onPackagePolicyDelete({ coreStart, logger })
  );

  fleetPluginStart.registerExternalCallback(
    'packagePolicyPostCreate',
    onPackagePolicyPostCreate({
      fleet: fleetPluginStart,
      coreStart,
      logger,
    })
  );
}

function onPackagePolicyDelete({
  coreStart,
  logger,
}: {
  coreStart: CoreStart;
  logger: Logger;
}): PostPackagePolicyDeleteCallback {
  return async (packagePolicies) => {
    const promises = packagePolicies.map(async (packagePolicy) => {
      if (packagePolicy.package?.name !== 'apm') {
        return packagePolicy;
      }

      const internalESClient = coreStart.elasticsearch.client.asInternalUser;

      const [agentConfigApiKeyId] = get(packagePolicy, AGENT_CONFIG_API_KEY_PATH, '').split(':');

      const [sourceMapApiKeyId] = get(packagePolicy, SOURCE_MAP_API_KEY_PATH, '').split(':');

      logger.debug(
        `Deleting API keys: ${agentConfigApiKeyId}, ${sourceMapApiKeyId} (package policy: ${packagePolicy.id})`
      );

      try {
        await internalESClient.security.invalidateApiKey({
          ids: [agentConfigApiKeyId, sourceMapApiKeyId],
          owner: true,
        });
      } catch (e) {
        logger.error(
          `Failed to delete API keys: ${agentConfigApiKeyId}, ${sourceMapApiKeyId} (package policy: ${packagePolicy.id})`
        );
      }
    });

    await Promise.all(promises);
  };
}

export function onPackagePolicyPostCreate({
  fleet,
  coreStart,
  logger,
}: {
  fleet: FleetStartContract;
  coreStart: CoreStart;
  logger: Logger;
}): PostPackagePolicyPostCreateCallback {
  return async (packagePolicy, savedObjectsClient) => {
    if (packagePolicy.package?.name !== 'apm') {
      return packagePolicy;
    }

    // add api key to new package policy
    await addApiKeysToPackagePolicyIfMissing({
      policy: packagePolicy,
      savedObjectsClient,
      coreStart,
      fleet,
      logger,
    });

    return packagePolicy;
  };
}

export function onPackagePolicyCreate({
  fleetPluginStart,
  getApmIndices,
  coreStart,
}: {
  fleetPluginStart: FleetStartContract;
  getApmIndices: (soClient: SavedObjectsClientContract) => Promise<APMIndices>;
  coreStart: CoreStart;
}): PostPackagePolicyCreateCallback {
  return async (packagePolicy) => {
    if (packagePolicy.package?.name !== 'apm') {
      return packagePolicy;
    }

    const { asInternalUser } = coreStart.elasticsearch.client;
    const savedObjectsClient = await getInternalSavedObjectsClient(coreStart);
    const apmIndices = await getApmIndices(savedObjectsClient);

    const internalESClient = await createInternalESClient({
      debug: false,
      elasticsearchClient: asInternalUser,
    });

    return decoratePackagePolicyWithAgentConfigAndSourceMap({
      internalESClient,
      fleetPluginStart,
      packagePolicy,
      apmIndices,
    });
  };
}

/*
 * Decorates the policy with agent configurations and source maps, then defensively
 * preserves or re-creates the two runtime-injected API keys that clients which don't
 * round-trip the full policy body may drop.
 */
export function onPackagePolicyUpdate({
  fleetPluginStart,
  getApmIndices,
  coreStart,
  logger,
}: {
  fleetPluginStart: FleetStartContract;
  getApmIndices: (soClient: SavedObjectsClientContract) => Promise<APMIndices>;
  coreStart: CoreStart;
  logger: Logger;
}): PutPackagePolicyUpdateCallback {
  return async (packagePolicy) => {
    if (packagePolicy.package?.name !== 'apm') {
      return packagePolicy;
    }

    const { id: packagePolicyId } = packagePolicy;

    const { asInternalUser } = coreStart.elasticsearch.client;
    const savedObjectsClient = await getInternalSavedObjectsClient(coreStart);
    const apmIndices = await getApmIndices(savedObjectsClient);

    const internalESClient = await createInternalESClient({
      debug: false,
      elasticsearchClient: asInternalUser,
    });

    const decorated = await decoratePackagePolicyWithAgentConfigAndSourceMap({
      internalESClient,
      fleetPluginStart,
      packagePolicy,
      apmIndices,
    });

    if (policyHasApiKey(decorated)) {
      return decorated;
    }

    let storedPolicy: PackagePolicy | null | undefined;
    try {
      storedPolicy = await fleetPluginStart.packagePolicyService.get(
        savedObjectsClient,
        packagePolicyId
      );
    } catch (err) {
      logger.warn(
        `Failed to get package policy ${packagePolicyId}, falling back to creating new keys: ${err}`
      );
    }

    const storedAgentConfigApiKey: string | undefined = storedPolicy
      ? get(storedPolicy, AGENT_CONFIG_API_KEY_PATH)
      : undefined;
    const storedSourceMapApiKey: string | undefined = storedPolicy
      ? get(storedPolicy, SOURCE_MAP_API_KEY_PATH)
      : undefined;

    // Both keys must be present to reuse them. If only one exists (e.g. a partial
    // write failure), treat it as missing and mint a fresh pair — this may orphan
    // the surviving key but guarantees the policy always has a consistent key pair.
    if (storedAgentConfigApiKey && storedSourceMapApiKey) {
      return getPackagePolicyWithApiKeys({
        packagePolicy: decorated,
        agentConfigApiKey: storedAgentConfigApiKey,
        sourceMapApiKey: storedSourceMapApiKey,
      });
    }

    return createAndInjectApiKeys({
      policy: decorated,
      packagePolicyId,
      coreStart,
      logger,
    });
  };
}
