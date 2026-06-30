/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit } from 'lodash';
import pMap from 'p-map';

import type {
  ElasticsearchClient,
  SavedObjectsClientContract,
  SavedObject,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers, isSavedObjectErrorResult } from '@kbn/core/server';

import { normalizeHostsForAgents, validateFleetSavedObjectId } from '../../common/services';
import {
  GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
  FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
  DEFAULT_FLEET_SERVER_HOST_ID,
  SO_SEARCH_LIMIT,
} from '../constants';

import type {
  SettingsSOAttributes,
  FleetServerHostSOAttributes,
  FleetServerHost,
  NewFleetServerHost,
  AgentPolicy,
  SecretReference,
} from '../types';
import {
  FleetServerHostUnauthorizedError,
  FleetServerHostNotFoundError,
  FleetEncryptedSavedObjectEncryptionKeyRequired,
} from '../errors';

import { appContextService } from './app_context';

import { agentPolicyService } from './agent_policy';
import { escapeSearchQueryPhrase } from './saved_object';
import {
  deleteFleetServerHostsSecrets,
  deleteSecrets,
  extractAndUpdateFleetServerHostsSecrets,
  extractAndWriteFleetServerHostsSecrets,
  isSecretStorageEnabled,
} from './secrets';

function savedObjectToFleetServerHost(
  so: SavedObject<FleetServerHostSOAttributes>
): FleetServerHost {
  const { ssl, proxy_id: proxyId, ...attributes } = so.attributes;

  return {
    id: so.id,
    ...attributes,
    ...(ssl ? { ssl: JSON.parse(ssl as string) } : {}),
    ...(proxyId ? { proxy_id: proxyId } : {}),
  };
}

class FleetServerHostService {
  private get soClient() {
    return appContextService.getInternalUserSOClient();
  }

  private get encryptedSoClient() {
    return appContextService.getEncryptedSavedObjects();
  }

  public async create(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    fleetServerHost: NewFleetServerHost,
    options?: {
      id?: string;
      overwrite?: boolean;
      fromPreconfiguration?: boolean;
      secretHashes?: Record<string, any>;
    }
  ): Promise<FleetServerHost> {
    const logger = appContextService.getLogger();
    const data: FleetServerHostSOAttributes = { ...omit(fleetServerHost, ['ssl', 'secrets']) };

    validateFleetSavedObjectId(options?.id);

    if (!appContextService.getEncryptedSavedObjectsSetup()?.canEncrypt) {
      throw new FleetEncryptedSavedObjectEncryptionKeyRequired(
        `Fleet server host needs encrypted saved object api key to be set`
      );
    }

    if (fleetServerHost.is_default) {
      const defaultItem = await this.getDefaultFleetServerHost();
      if (defaultItem && defaultItem.id !== options?.id) {
        await this.update(
          soClient,
          esClient,
          defaultItem.id,
          { is_default: false },
          { fromPreconfiguration: options?.fromPreconfiguration }
        );
      }
    }

    if (fleetServerHost.host_urls) {
      data.host_urls = fleetServerHost.host_urls.map(normalizeHostsForAgents);
    }
    if (fleetServerHost.ssl) {
      data.ssl = JSON.stringify(fleetServerHost.ssl);
    }

    // Store secret values if enabled; if not, store plain text values
    if (await isSecretStorageEnabled(esClient, soClient)) {
      const { fleetServerHost: fleetServerHostWithSecrets } =
        await extractAndWriteFleetServerHostsSecrets({
          fleetServerHost,
          esClient,
          secretHashes: fleetServerHost.is_preconfigured ? options?.secretHashes : undefined,
        });
      if (fleetServerHostWithSecrets.secrets)
        data.secrets = fleetServerHostWithSecrets.secrets as FleetServerHostSOAttributes['secrets'];
    } else {
      if (
        (!fleetServerHost.ssl?.key && fleetServerHost.secrets?.ssl?.key) ||
        (!fleetServerHost.ssl?.es_key && fleetServerHost.secrets?.ssl?.es_key) ||
        (!fleetServerHost.ssl?.agent_key && fleetServerHost.secrets?.ssl?.agent_key)
      ) {
        data.ssl = JSON.stringify({ ...fleetServerHost.ssl, ...fleetServerHost.secrets.ssl });
      }
    }
    const res = await this.soClient.create<FleetServerHostSOAttributes>(
      FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
      data,
      { id: options?.id, overwrite: options?.overwrite }
    );
    logger.debug(`Created fleet server host ${options?.id}`);
    // soClient.create doesn't return the decrypted attributes, so we need to fetch it again.
    const retrievedSo =
      await this.encryptedSoClient.getDecryptedAsInternalUser<FleetServerHostSOAttributes>(
        FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
        res.id
      );
    return savedObjectToFleetServerHost(retrievedSo);
  }

  // Returns void rather than FleetServerHost[]: preconfiguration callers don't use the return value,
  // so we skip the post-create decrypt re-fetch that create() requires.
  public async bulkCreateForPreconfiguration(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    hosts: Array<NewFleetServerHost & { id: string; secretHashes?: Record<string, any> }>,
    options?: { fromPreconfiguration?: boolean }
  ): Promise<void> {
    if (hosts.length === 0) return;

    if (!appContextService.getEncryptedSavedObjectsSetup()?.canEncrypt) {
      throw new FleetEncryptedSavedObjectEncryptionKeyRequired(
        `Fleet server host needs encrypted saved object api key to be set`
      );
    }

    // Handle default deduplication once: if any incoming host is_default, unset the current default
    const newDefaultHost = hosts.find((h) => h.is_default);
    if (newDefaultHost) {
      const currentDefault = await this.getDefaultFleetServerHost();
      if (currentDefault && currentDefault.id !== newDefaultHost.id) {
        await this.update(
          soClient,
          esClient,
          currentDefault.id,
          { is_default: false },
          { fromPreconfiguration: options?.fromPreconfiguration }
        );
      }
    }

    // Prepare attributes for each host in parallel
    const hostDataList = await Promise.all(
      hosts.map(async ({ id, secretHashes, ...fleetServerHost }) => {
        const data: FleetServerHostSOAttributes = {
          ...omit(fleetServerHost, ['ssl', 'secrets']),
        };

        if (fleetServerHost.host_urls) {
          data.host_urls = fleetServerHost.host_urls.map(normalizeHostsForAgents);
        }
        if (fleetServerHost.ssl) {
          data.ssl = JSON.stringify(fleetServerHost.ssl);
        }

        if (await isSecretStorageEnabled(esClient, soClient)) {
          const { fleetServerHost: withSecrets } = await extractAndWriteFleetServerHostsSecrets({
            fleetServerHost,
            esClient,
            secretHashes: fleetServerHost.is_preconfigured ? secretHashes : undefined,
          });
          if (withSecrets.secrets) {
            data.secrets = withSecrets.secrets as FleetServerHostSOAttributes['secrets'];
          }
        } else {
          if (
            (!fleetServerHost.ssl?.key && fleetServerHost.secrets?.ssl?.key) ||
            (!fleetServerHost.ssl?.es_key && fleetServerHost.secrets?.ssl?.es_key) ||
            (!fleetServerHost.ssl?.agent_key && fleetServerHost.secrets?.ssl?.agent_key)
          ) {
            data.ssl = JSON.stringify({
              ...fleetServerHost.ssl,
              ...fleetServerHost.secrets?.ssl,
            });
          }
        }

        return { id, data };
      })
    );

    const res = await this.soClient.bulkCreate<FleetServerHostSOAttributes>(
      hostDataList.map(({ id, data }) => ({
        type: FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
        id,
        attributes: data,
      })),
      { overwrite: true }
    );

    const logger = appContextService.getLogger();
    for (const so of res.saved_objects) {
      if (isSavedObjectErrorResult(so)) {
        throw so.error;
      }
      logger.debug(`Created fleet server host ${so.id}`);
    }
  }

  public async get(id: string): Promise<FleetServerHost> {
    const res =
      await this.encryptedSoClient.getDecryptedAsInternalUser<FleetServerHostSOAttributes>(
        FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
        id
      );

    return savedObjectToFleetServerHost(res);
  }

  public async list() {
    const fleetServerHostsFinder =
      await this.encryptedSoClient.createPointInTimeFinderDecryptedAsInternalUser<FleetServerHostSOAttributes>(
        {
          type: FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
          perPage: SO_SEARCH_LIMIT,
        }
      );

    let fleetServerHosts: SavedObject<FleetServerHostSOAttributes>[] = [];
    let total = 0;
    let page = 0;
    let perPage = 0;

    for await (const result of fleetServerHostsFinder.find()) {
      fleetServerHosts = result.saved_objects;
      page = result.page;
      total = result.total;
      perPage = result.per_page;
      break; // Return first page;
    }

    await fleetServerHostsFinder.close();

    return {
      items: fleetServerHosts.map<FleetServerHost>(savedObjectToFleetServerHost),
      total,
      page,
      perPage,
    };
  }

  public async listAllForProxyId(proxyId: string) {
    const res = await this.soClient.find<FleetServerHostSOAttributes>({
      type: FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
      perPage: SO_SEARCH_LIMIT,
      searchFields: ['proxy_id'],
      search: escapeSearchQueryPhrase(proxyId),
    });

    return {
      items: res.saved_objects.map<FleetServerHost>(savedObjectToFleetServerHost),
      total: res.total,
      page: res.page,
      perPage: res.per_page,
    };
  }

  public async delete(
    esClient: ElasticsearchClient,
    id: string,
    options?: { fromPreconfiguration?: boolean }
  ) {
    const logger = appContextService.getLogger();
    logger.debug(`Deleting fleet server host ${id}`);

    const fleetServerHost = await this.get(id);

    if (fleetServerHost.is_preconfigured && !options?.fromPreconfiguration) {
      throw new FleetServerHostUnauthorizedError(
        `Cannot delete ${id} preconfigured fleet server host`
      );
    }

    if (fleetServerHost.is_default) {
      throw new FleetServerHostUnauthorizedError(
        `Default Fleet Server hosts ${id} cannot be deleted.`
      );
    }

    await agentPolicyService.removeFleetServerHostFromAll(esClient, id, {
      force: options?.fromPreconfiguration,
    });

    const soDeleteResult = await this.soClient.delete(FLEET_SERVER_HOST_SAVED_OBJECT_TYPE, id);
    await deleteFleetServerHostsSecrets({
      fleetServerHost,
      esClient: appContextService.getInternalUserESClient(),
    });

    return soDeleteResult;
  }

  public async update(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    id: string,
    data: Partial<FleetServerHost>,
    options?: { fromPreconfiguration?: boolean; secretHashes?: Record<string, any> }
  ) {
    let secretsToDelete: SecretReference[] = [];

    const logger = appContextService.getLogger();
    logger.debug(`Updating fleet server host ${id}`);

    const originalItem = await this.get(id);
    const updateData: Partial<FleetServerHostSOAttributes> = {
      ...omit(data, ['ssl', 'secrets']),
    };

    if (data.is_preconfigured && !options?.fromPreconfiguration) {
      throw new FleetServerHostUnauthorizedError(
        `Cannot update ${id} preconfigured fleet server host`
      );
    }

    if (data.is_default) {
      const defaultItem = await this.getDefaultFleetServerHost();
      if (defaultItem && defaultItem.id !== id) {
        await this.update(
          soClient,
          esClient,
          defaultItem.id,
          {
            is_default: false,
          },
          { fromPreconfiguration: options?.fromPreconfiguration }
        );
      }
    }

    if (data.host_urls) {
      updateData.host_urls = data.host_urls.map(normalizeHostsForAgents);
    }

    if (data.ssl) {
      updateData.ssl = JSON.stringify(data.ssl);
    } else if (data.ssl === null) {
      // Explicitly set to null to allow to delete the field
      updateData.ssl = null;
    }

    // Store secret values if enabled; if not, store plain text values
    if (await isSecretStorageEnabled(esClient, soClient)) {
      const secretsRes = await extractAndUpdateFleetServerHostsSecrets({
        oldFleetServerHost: originalItem,
        fleetServerHostUpdate: data,
        esClient,
        secretHashes: data.is_preconfigured ? options?.secretHashes : undefined,
      });

      updateData.secrets = secretsRes.fleetServerHostUpdate
        .secrets as FleetServerHostSOAttributes['secrets'];
      secretsToDelete = secretsRes.secretsToDelete;
    } else {
      if (
        (!data.ssl?.key && data.secrets?.ssl?.key) ||
        (!data.ssl?.es_key && data.secrets?.ssl?.es_key) ||
        (!data.ssl?.agent_key && data.secrets?.ssl?.agent_key)
      ) {
        updateData.ssl = JSON.stringify({ ...data.ssl, ...data.secrets.ssl });
      }
    }

    await this.soClient.update<FleetServerHostSOAttributes>(
      FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
      id,
      updateData
    );

    if (secretsToDelete.length) {
      try {
        await deleteSecrets({ esClient, ids: secretsToDelete.map((s) => s.id) });
      } catch (err) {
        logger.warn(`Error cleaning up secrets for output ${id}: ${err.message}`);
      }
    }

    logger.debug(`Updated fleet server host ${id}`);
    return {
      ...originalItem,
      ...updateData,
    };
  }

  public async bulkGet(ids: string[], { ignoreNotFound = false } = { ignoreNotFound: true }) {
    if (ids.length === 0) {
      return [];
    }
    const decryptedSavedObjects = await pMap(
      ids,
      async (id) => {
        try {
          const decryptedSo =
            await this.encryptedSoClient.getDecryptedAsInternalUser<FleetServerHostSOAttributes>(
              FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
              id
            );
          return savedObjectToFleetServerHost(decryptedSo);
        } catch (error: any) {
          if (ignoreNotFound && SavedObjectsErrorHelpers.isNotFoundError(error)) {
            return undefined;
          }
          throw error;
        }
      },
      { concurrency: 50 } // Match the concurrency used in x-pack/platform/plugins/shared/encrypted_saved_objects/server/saved_objects/index.ts#L172
    );

    return decryptedSavedObjects.filter(
      (fleetServerHostOrUndefined): fleetServerHostOrUndefined is FleetServerHost =>
        typeof fleetServerHostOrUndefined !== 'undefined'
    );
  }

  /**
   * Get the default Fleet server policy hosts or throw if it does not exists
   */
  public async getDefaultFleetServerHost(): Promise<FleetServerHost | null> {
    const res = await this.soClient.find<FleetServerHostSOAttributes>({
      type: FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
      filter: `${FLEET_SERVER_HOST_SAVED_OBJECT_TYPE}.attributes.is_default:true`,
    });

    if (res.saved_objects.length === 0) {
      return null;
    }

    return savedObjectToFleetServerHost(res.saved_objects[0]);
  }
}

export const fleetServerHostService = new FleetServerHostService();

export async function getFleetServerHostsForAgentPolicy(
  soClient: SavedObjectsClientContract,
  agentPolicy: Pick<AgentPolicy, 'fleet_server_host_id'>
) {
  if (agentPolicy.fleet_server_host_id) {
    return fleetServerHostService.get(agentPolicy.fleet_server_host_id);
  }

  const defaultFleetServerHost = await fleetServerHostService.getDefaultFleetServerHost();
  if (!defaultFleetServerHost) {
    throw new FleetServerHostNotFoundError('Default Fleet Server host is not setup');
  }

  return defaultFleetServerHost;
}

/**
 * Migrate Global setting fleet server hosts to their own saved object
 */
export async function migrateSettingsToFleetServerHost(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient
) {
  const defaultFleetServerHost = await fleetServerHostService.getDefaultFleetServerHost();
  if (defaultFleetServerHost) {
    return;
  }

  const res = await soClient.find<SettingsSOAttributes>({
    type: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
  });

  const oldSettings = res.saved_objects[0];
  if (
    !oldSettings ||
    !oldSettings.attributes.fleet_server_hosts ||
    oldSettings.attributes.fleet_server_hosts.length === 0
  ) {
    return;
  }

  // Migrate
  await fleetServerHostService.create(
    soClient,
    esClient,
    {
      name: 'Default',
      host_urls: oldSettings.attributes.fleet_server_hosts,
      is_default: true,
      is_preconfigured: false,
    },
    {
      id: DEFAULT_FLEET_SERVER_HOST_ID,
      overwrite: true,
    }
  );
}
