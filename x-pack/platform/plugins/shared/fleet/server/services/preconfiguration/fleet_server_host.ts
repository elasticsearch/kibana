/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';

import { normalizeHostsForAgents } from '../../../common/services';
import type { FleetConfigType } from '../../config';
import {
  DEFAULT_FLEET_SERVER_HOST_ID,
  ECH_AGENTLESS_FLEET_SERVER_HOST_ID,
  SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
  SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
} from '../../constants';

import { FleetError } from '../../errors';

import type { FleetServerHost, NewFleetServerHost } from '../../types';
import { appContextService } from '../app_context';
import { fleetServerHostService } from '../fleet_server_host';
import { isAgentlessEnabled } from '../utils/agentless';

import { agentPolicyService } from '../agent_policy';

import { isDifferent } from './utils';
import { hashSecret, isSecretDifferent } from './outputs';

export function getCloudFleetServersHosts() {
  const cloudSetup = appContextService.getCloud();
  if (
    cloudSetup &&
    !cloudSetup.isServerlessEnabled &&
    cloudSetup.isCloudEnabled &&
    cloudSetup.cloudHost
  ) {
    // Fleet Server url are formed like this `https://<deploymentId>.fleet.<host>
    return [
      `https://${cloudSetup.deploymentId}.fleet.${cloudSetup.cloudHost}${
        cloudSetup.cloudDefaultPort && cloudSetup.cloudDefaultPort !== '443'
          ? `:${cloudSetup.cloudDefaultPort}`
          : ''
      }`,
    ];
  }
}

export function getPreconfiguredFleetServerHostFromConfig(config?: FleetConfigType) {
  const { fleetServerHosts: fleetServerHostsFromConfig } = config;

  const legacyFleetServerHostsConfig = getConfigFleetServerHosts(config);
  const cloudServerHosts = getCloudFleetServersHosts();

  const fleetServerHosts: FleetServerHost[] = (fleetServerHostsFromConfig || []).concat([
    ...(legacyFleetServerHostsConfig
      ? [
          {
            name: 'Default',
            is_default: true,
            id: DEFAULT_FLEET_SERVER_HOST_ID,
            host_urls: legacyFleetServerHostsConfig,
          },
        ]
      : []),
    // Include agentless Fleet Server host in ECH
    ...(isAgentlessEnabled() && cloudServerHosts
      ? [
          {
            id: ECH_AGENTLESS_FLEET_SERVER_HOST_ID,
            name: 'Internal Fleet Server for agentless',
            host_urls: cloudServerHosts,
            is_default: false,
            is_preconfigured: true,
          },
        ]
      : []),
    // Include private Fleet Server host when PrivateLink is enabled (serverless only)
    ...(config?.internal?.privateFleetServerHost
      ? [
          {
            id: SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
            name: 'Private Fleet Server',
            host_urls: [config.internal.privateFleetServerHost],
            is_default: false,
            is_preconfigured: true,
          },
        ]
      : []),
  ]);

  if (fleetServerHosts.filter((fleetServerHost) => fleetServerHost.is_default).length > 1) {
    throw new FleetError('Only one default Fleet Server host is allowed');
  }

  // Ensure the serverless PrivateLink default and private hosts both allow their
  // is_default field to be changed at runtime (via the PrivateLink toggle in Fleet Settings).
  // Without this, the preconfig sync would revert a runtime is_default change on every restart
  // because isPreconfiguredFleetServerHostDifferentFromCurrent diffs is_default.
  const PRIVATELINK_HOST_IDS = new Set([
    SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
    SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
  ]);

  return fleetServerHosts.map((host) => {
    if (!PRIVATELINK_HOST_IDS.has(host.id)) {
      return host;
    }
    const existingAllowEdit = host.allow_edit ?? [];
    const merged = Array.from(new Set([...existingAllowEdit, 'is_default']));
    return { ...host, allow_edit: merged };
  });
}

export async function ensurePreconfiguredFleetServerHosts(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  preconfiguredFleetServerHosts: FleetServerHost[]
) {
  await createOrUpdatePreconfiguredFleetServerHosts(
    soClient,
    esClient,
    preconfiguredFleetServerHosts
  );
  await createCloudFleetServerHostIfNeeded(soClient, esClient);
  await cleanPreconfiguredFleetServerHosts(soClient, esClient, preconfiguredFleetServerHosts);
}

export async function createOrUpdatePreconfiguredFleetServerHosts(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  preconfiguredFleetServerHosts: FleetServerHost[]
) {
  const existingFleetServerHosts = await fleetServerHostService.bulkGet(
    preconfiguredFleetServerHosts.map(({ id }) => id),
    { ignoreNotFound: true }
  );

  const toCreate: Array<
    NewFleetServerHost & { id: string; is_preconfigured: true; secretHashes: Record<string, any> }
  > = [];
  const toUpdate: Array<{
    id: string;
    data: Partial<FleetServerHost>;
    secretHashes: Record<string, any>;
  }> = [];

  await Promise.all(
    preconfiguredFleetServerHosts.map(async (preconfiguredFleetServerHost) => {
      const existingHost = existingFleetServerHosts.find(
        (fleetServerHost) => fleetServerHost.id === preconfiguredFleetServerHost.id
      );

      const { id, ...data } = preconfiguredFleetServerHost;
      const secretHashes = await hashSecrets(preconfiguredFleetServerHost);

      // Fields listed in allow_edit are preserved from the existing SO rather than being
      // overwritten by the preconfigured value — matching the same pattern in outputs.ts.
      // This allows the PrivateLink toggle to flip is_default at runtime and survive restarts.
      if (existingHost && preconfiguredFleetServerHost.allow_edit) {
        for (const key of preconfiguredFleetServerHost.allow_edit) {
          // @ts-expect-error dynamic key access
          data[key] = existingHost[key];
        }
      }

      const isCreate = !existingHost;
      const isUpdateWithNewData =
        existingHost &&
        (!existingHost.is_preconfigured ||
          (await isPreconfiguredFleetServerHostDifferentFromCurrent(
            existingHost,
            preconfiguredFleetServerHost
          )));

      if (isCreate) {
        toCreate.push({ ...data, is_preconfigured: true, id, secretHashes });
      } else if (isUpdateWithNewData) {
        toUpdate.push({ id, data: { ...data, is_preconfigured: true }, secretHashes });
      }
    })
  );

  if (toCreate.length > 0) {
    await fleetServerHostService.bulkCreateForPreconfiguration(soClient, esClient, toCreate, {
      fromPreconfiguration: true,
    });
  }

  await Promise.all(
    toUpdate.map(async ({ id, data, secretHashes }) => {
      await fleetServerHostService.update(soClient, esClient, id, data, {
        fromPreconfiguration: true,
        secretHashes,
      });
      await agentPolicyService.bumpAllAgentPoliciesForFleetServerHosts(esClient, id, {
        isDefault: data.is_default,
      });
    })
  );
}

export async function createCloudFleetServerHostIfNeeded(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient
) {
  const cloudServerHosts = getCloudFleetServersHosts();
  if (!cloudServerHosts || cloudServerHosts.length === 0) {
    return;
  }

  const defaultFleetServerHost = await fleetServerHostService.getDefaultFleetServerHost();
  if (!defaultFleetServerHost) {
    await fleetServerHostService.create(
      soClient,
      esClient,
      {
        name: 'Default',
        is_default: true,
        host_urls: cloudServerHosts,
        is_preconfigured: false,
      },
      { id: DEFAULT_FLEET_SERVER_HOST_ID, overwrite: true, fromPreconfiguration: true }
    );
  }
}

export async function cleanPreconfiguredFleetServerHosts(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  preconfiguredFleetServerHosts: FleetServerHost[]
) {
  const existingFleetServerHosts = await fleetServerHostService.list();
  const existingPreconfiguredHosts = existingFleetServerHosts.items.filter(
    (o) => o.is_preconfigured === true
  );

  for (const existingFleetServerHost of existingPreconfiguredHosts) {
    const hasBeenDelete = !preconfiguredFleetServerHosts.find(
      ({ id }) => existingFleetServerHost.id === id
    );
    if (!hasBeenDelete) {
      continue;
    }

    if (existingFleetServerHost.is_default) {
      await fleetServerHostService.update(
        soClient,
        esClient,
        existingFleetServerHost.id,
        { is_preconfigured: false },
        {
          fromPreconfiguration: true,
        }
      );

      // When PrivateLink is disabled and the private host was the active default,
      // restore the public serverless default host so agents are not left pointing
      // at an unreachable PrivateLink URL.
      if (existingFleetServerHost.id === SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID) {
        const logger = appContextService.getLogger();
        logger.info(
          `PrivateLink fleet server host ${existingFleetServerHost.id} was the default; restoring ${SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID} as default`
        );
        await fleetServerHostService.update(
          soClient,
          esClient,
          SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
          { is_default: true },
          { fromPreconfiguration: true }
        );
      }
    } else {
      await fleetServerHostService.delete(esClient, existingFleetServerHost.id, {
        fromPreconfiguration: true,
      });
    }
  }
}

function getConfigFleetServerHosts(config?: FleetConfigType) {
  return config?.agents?.fleet_server?.hosts && config.agents.fleet_server.hosts.length > 0
    ? config?.agents?.fleet_server?.hosts
    : undefined;
}

async function hashSecrets(preconfiguredFleetServerHost: FleetServerHost) {
  let secrets: Record<string, any> = {};
  if (typeof preconfiguredFleetServerHost.secrets?.ssl?.key === 'string') {
    const key = await hashSecret(preconfiguredFleetServerHost.secrets?.ssl?.key);
    secrets = {
      ssl: {
        key,
      },
    };
  }
  if (typeof preconfiguredFleetServerHost.secrets?.ssl?.key === 'string') {
    const esKey = await hashSecret(preconfiguredFleetServerHost.secrets?.ssl?.key);
    secrets = {
      ...(secrets ? secrets : {}),
      ssl: { es_key: esKey },
    };
  }
  if (typeof preconfiguredFleetServerHost.secrets?.ssl?.agent_key === 'string') {
    const agentKey = await hashSecret(preconfiguredFleetServerHost.secrets?.ssl?.agent_key);
    secrets = {
      ...(secrets ? secrets : {}),
      ssl: { agent_key: agentKey },
    };
  }
  return secrets;
}

async function isPreconfiguredFleetServerHostDifferentFromCurrent(
  existingFleetServerHost: FleetServerHost,
  preconfiguredFleetServerHost: Partial<FleetServerHost>
): Promise<boolean> {
  const secretFieldsAreDifferent = async (): Promise<boolean> => {
    const sslKeyHashIsDifferent = await isSecretDifferent(
      preconfiguredFleetServerHost.secrets?.ssl?.key,
      existingFleetServerHost.secrets?.ssl?.key
    );
    const sslESKeyHashIsDifferent = await isSecretDifferent(
      preconfiguredFleetServerHost.secrets?.ssl?.es_key,
      existingFleetServerHost.secrets?.ssl?.es_key
    );
    const sslAgentKeyHashIsDifferent = await isSecretDifferent(
      preconfiguredFleetServerHost.secrets?.ssl?.agent_key,
      existingFleetServerHost.secrets?.ssl?.agent_key
    );
    return sslKeyHashIsDifferent || sslESKeyHashIsDifferent || sslAgentKeyHashIsDifferent;
  };

  return (
    existingFleetServerHost.is_default !== preconfiguredFleetServerHost.is_default ||
    existingFleetServerHost.name !== preconfiguredFleetServerHost.name ||
    isDifferent(existingFleetServerHost.allow_edit, preconfiguredFleetServerHost.allow_edit) ||
    isDifferent(existingFleetServerHost.is_internal, preconfiguredFleetServerHost.is_internal) ||
    isDifferent(
      existingFleetServerHost.host_urls.map(normalizeHostsForAgents),
      preconfiguredFleetServerHost?.host_urls?.map(normalizeHostsForAgents)
    ) ||
    isDifferent(existingFleetServerHost?.proxy_id, preconfiguredFleetServerHost.proxy_id) ||
    isDifferent(existingFleetServerHost?.ssl, preconfiguredFleetServerHost?.ssl) ||
    secretFieldsAreDifferent()
  );
}
