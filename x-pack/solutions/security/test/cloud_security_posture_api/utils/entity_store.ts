/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { RetryService } from '@kbn/ftr-common-functional-services';
import type { Agent } from 'supertest';
import { CLOUD_ASSET_DISCOVERY_PACKAGE_VERSION } from '@kbn/cloud-security-posture-plugin/common/constants';
import { ENTITY_STORE_ROUTES, API_VERSIONS } from '@kbn/entity-store/common';

export interface EntityStoreHelpersDeps {
  es: Client;
  logger: ToolingLog;
  retry: RetryService;
  supertest: Pick<Agent, 'get' | 'post' | 'delete'>;
}

/**
 * Helper to wait for entity data to be indexed
 */
export const waitForEntityDataIndexed = async ({
  es,
  logger,
  retry,
  entitiesIndex,
  expectedCount,
}: Pick<EntityStoreHelpersDeps, 'es' | 'logger' | 'retry'> & {
  entitiesIndex: string;
  expectedCount: number;
}) => {
  await retry.waitFor('entity data to be indexed', async () => {
    try {
      const response = await es.count({
        index: entitiesIndex,
      });
      logger.debug(`Entity count: ${response.count}`);
      return response.count === expectedCount;
    } catch (e) {
      logger.debug(`Error counting entities: ${e.message}`);
      return false;
    }
  });
};

/**
 * Entity type for entity store engines
 */
export type EntityType = 'user' | 'host' | 'service' | 'generic';

/**
 * Helper to install cloud asset inventory package
 */
export const installCloudAssetInventoryPackage = async ({
  supertest,
  logger,
  spaceId,
}: Pick<EntityStoreHelpersDeps, 'supertest' | 'logger'> & { spaceId?: string }) => {
  const spacePath = spaceId ? `/s/${spaceId}` : '';
  logger.debug(
    `Installing cloud asset inventory package v${CLOUD_ASSET_DISCOVERY_PACKAGE_VERSION} for space: ${
      spaceId || 'default'
    }`
  );
  await supertest
    .post(`${spacePath}/api/fleet/epm/packages/_bulk`)
    .set('kbn-xsrf', 'xxxx')
    .send({
      packages: [
        {
          name: 'cloud_asset_inventory',
          version: CLOUD_ASSET_DISCOVERY_PACKAGE_VERSION,
        },
      ],
    })
    .expect(200);
  logger.debug(`Cloud asset inventory package installed for space: ${spaceId || 'default'}`);
};

// --- Entity Store V2 helpers ---

const PUBLIC_HEADERS = {
  'kbn-xsrf': 'true',
  'elastic-api-version': API_VERSIONS.public.v1,
  'x-elastic-internal-origin': 'kibana',
};

/**
 * Helper to install Entity Store V2
 */
export const installEntityStoreV2 = async ({
  supertest,
  logger,
  spaceId,
}: Pick<EntityStoreHelpersDeps, 'supertest' | 'logger'> & { spaceId?: string }) => {
  const spacePath = spaceId ? `/s/${spaceId}` : '';
  const spaceLabel = spaceId || 'default';
  logger.debug(`Installing Entity Store V2 for space: ${spaceLabel}`);

  const response = await supertest
    .post(`${spacePath}${ENTITY_STORE_ROUTES.public.INSTALL}`)
    .set(PUBLIC_HEADERS)
    .send({});

  if (response.status !== 200 && response.status !== 201) {
    logger.error(`Failed to install Entity Store V2: ${response.status}`);
    logger.error(JSON.stringify(response.body));
    throw new Error(`Failed to install Entity Store V2: ${response.status}`);
  }

  logger.debug(`Entity Store V2 installed for space: ${spaceLabel}`);
  return response;
};

/**
 * Helper to uninstall Entity Store V2
 */
export const uninstallEntityStoreV2 = async ({
  supertest,
  logger,
  spaceId,
}: Pick<EntityStoreHelpersDeps, 'supertest' | 'logger'> & { spaceId?: string }) => {
  const spacePath = spaceId ? `/s/${spaceId}` : '';
  const spaceLabel = spaceId || 'default';
  logger.debug(`Uninstalling Entity Store V2 for space: ${spaceLabel}`);

  try {
    await supertest
      .post(`${spacePath}${ENTITY_STORE_ROUTES.public.UNINSTALL}`)
      .set(PUBLIC_HEADERS)
      .send({})
      .expect(200);
    logger.debug(`Entity Store V2 uninstalled for space: ${spaceLabel}`);
  } catch (e) {
    if (e.response?.status !== 404) {
      logger.debug(
        `Error uninstalling Entity Store V2 for space ${spaceLabel}: ${
          e && e.message ? e.message : JSON.stringify(e)
        }`
      );
    }
  }
};

/**
 * Helper to wait for Entity Store V2 to reach 'running' status
 */
export const waitForEntityStoreV2Running = async ({
  supertest,
  retry,
  logger,
  spaceId,
}: Pick<EntityStoreHelpersDeps, 'supertest' | 'retry' | 'logger'> & { spaceId?: string }) => {
  const spacePath = spaceId ? `/s/${spaceId}` : '';
  const spaceLabel = spaceId || 'default';
  logger.debug(`Waiting for Entity Store V2 to be running in space: ${spaceLabel}`);

  await retry.waitForWithTimeout('Entity Store V2 to be running', 60000, async () => {
    const response = await supertest
      .get(`${spacePath}${ENTITY_STORE_ROUTES.public.STATUS}`)
      .set(PUBLIC_HEADERS);

    if (response.status !== 200) {
      logger.debug(`Entity Store V2 status check failed with status: ${response.status}`);
      return false;
    }

    const { status } = response.body;
    logger.debug(`Entity Store V2 status: ${status}`);

    if (status === 'error') {
      throw new Error(
        `Entity Store V2 is in error state: ${response.body.error?.message || 'Unknown error'}`
      );
    }

    return status === 'running';
  });
};
