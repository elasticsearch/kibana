/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchRoleDescriptor } from '@kbn/scout-security';
import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';

import {
  ENTITY_STORE_CLUSTER_PRIVILEGES,
  ENTITY_STORE_SOURCE_INDICES_PRIVILEGES,
  ENTITY_STORE_TARGET_INDICES_PRIVILEGES,
} from '../../../../server/domain/constants';
import { getEntitiesAlias, ENTITY_LATEST } from '../../../../common/domain/entity_index';
import { PUBLIC_HEADERS, ENTITY_STORE_ROUTES, ENTITY_STORE_TAGS } from '../fixtures/constants';
import { FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';
import { clearEntityStoreIndices } from '../fixtures/helpers';
import { getUpdatesEntitiesDataStreamName } from '../../../../server/domain/asset_manager/updates_data_stream';

apiTest.describe('Entity Store - privilege checks', { tag: ENTITY_STORE_TAGS }, () => {
  const TARGET_INDEX_LATEST = getEntitiesAlias(ENTITY_LATEST, 'default');
  const TARGET_INDEX_UPDATES = getUpdatesEntitiesDataStreamName('default');

  const SAVED_OBJECT_PRIVILEGE = 'saved_object:entity-engine-descriptor-v2/create';

  interface RoleOptions {
    withTargetIndex?: boolean;
    withSavedObjectCreate?: boolean;
  }

  const buildRoleDescriptor = ({
    withTargetIndex = true,
    withSavedObjectCreate = true,
  }: RoleOptions = {}): ElasticsearchRoleDescriptor => {
    const indices = [
      { names: ['logs-*'], privileges: ENTITY_STORE_SOURCE_INDICES_PRIVILEGES },
      { names: [TARGET_INDEX_UPDATES], privileges: ENTITY_STORE_SOURCE_INDICES_PRIVILEGES },
    ];

    if (withTargetIndex) {
      indices.push({
        names: [TARGET_INDEX_LATEST],
        privileges: ENTITY_STORE_TARGET_INDICES_PRIVILEGES,
      });
    }

    return {
      cluster: ENTITY_STORE_CLUSTER_PRIVILEGES,
      indices,
      applications: [
        {
          application: 'kibana-.kibana',
          privileges: withSavedObjectCreate
            ? ['feature_siem.all', SAVED_OBJECT_PRIVILEGE]
            : ['feature_siem.all'],
          resources: ['*'],
        },
      ],
    };
  };

  const getRoleWithAllPrivileges = () => buildRoleDescriptor();
  const getRoleWithoutTargetIndexPrivileges = () => buildRoleDescriptor({ withTargetIndex: false });
  const getRoleWithoutSavedObjectCreate = () =>
    buildRoleDescriptor({ withSavedObjectCreate: false });

  let additionalIndicesToCleanup: string[] = [];

  apiTest.beforeEach(async ({ kbnClient }) => {
    await kbnClient.uiSettings.update({
      [FF_ENABLE_ENTITY_STORE_V2]: true,
    });
  });

  apiTest.afterEach(async ({ esClient, apiClient, samlAuth }) => {
    const credentials = await samlAuth.asInteractiveUser('admin');
    await Promise.allSettled([
      apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
        headers: { ...credentials.cookieHeader, ...PUBLIC_HEADERS },
        body: {},
      }),
      ...additionalIndicesToCleanup.map((index) =>
        esClient.indices.delete({ index, ignore_unavailable: true })
      ),
    ]);
    additionalIndicesToCleanup = [];
    await clearEntityStoreIndices(esClient);
  });

  // --- install API ---

  apiTest(
    'install - Should fail when user lacks permissions for source index patterns',
    async ({ apiClient, esClient, requestAuth }) => {
      const restrictedIndex = 'restricted-test-logs';
      additionalIndicesToCleanup = [restrictedIndex];

      await esClient.indices.create({ index: restrictedIndex });

      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(getRoleWithAllPrivileges());

      const response = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
        headers: { ...PUBLIC_HEADERS, ...apiKeyHeader },
        responseType: 'json',
        body: { logExtraction: { additionalIndexPatterns: [restrictedIndex] } },
      });

      expect(response.statusCode).toBe(403);
      expect(response.body.attributes).toMatchObject({
        missing_elasticsearch_privileges: {
          cluster: [],
          index: [{ index: restrictedIndex, privileges: ENTITY_STORE_SOURCE_INDICES_PRIVILEGES }],
        },
      });
    }
  );

  apiTest(
    'install - Should fail when user lacks permissions for target index patterns',
    async ({ apiClient, requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(
        getRoleWithoutTargetIndexPrivileges()
      );

      const response = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
        headers: { ...PUBLIC_HEADERS, ...apiKeyHeader },
        responseType: 'json',
        body: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.body.attributes).toMatchObject({
        missing_elasticsearch_privileges: {
          cluster: [],
          index: [
            {
              index: TARGET_INDEX_LATEST,
              privileges: expect.arrayContaining(ENTITY_STORE_TARGET_INDICES_PRIVILEGES),
            },
          ],
        },
      });
    }
  );

  apiTest(
    'install - Should fail when user lacks permissions for entity store saved object descriptor',
    async ({ apiClient, requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(
        getRoleWithoutSavedObjectCreate()
      );

      const response = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
        headers: { ...PUBLIC_HEADERS, ...apiKeyHeader },
        responseType: 'json',
        body: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.body.attributes).toMatchObject({
        missing_kibana_privileges: [SAVED_OBJECT_PRIVILEGE],
      });
    }
  );

  // --- update API ---

  apiTest(
    'update - Should fail when user lacks permissions for source index patterns',
    async ({ apiClient, esClient, requestAuth }) => {
      const restrictedIndex = 'restricted-test-logs';
      additionalIndicesToCleanup = [restrictedIndex];

      await esClient.indices.create({ index: restrictedIndex });

      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(getRoleWithAllPrivileges());

      const response = await apiClient.put(ENTITY_STORE_ROUTES.public.UPDATE, {
        headers: { ...PUBLIC_HEADERS, ...apiKeyHeader },
        responseType: 'json',
        body: { logExtraction: { additionalIndexPatterns: [restrictedIndex] } },
      });

      expect(response.statusCode).toBe(403);
      expect(response.body.attributes).toMatchObject({
        missing_elasticsearch_privileges: {
          cluster: [],
          index: [{ index: restrictedIndex, privileges: ENTITY_STORE_SOURCE_INDICES_PRIVILEGES }],
        },
      });
    }
  );

  apiTest(
    'update - Should fail when user lacks permissions for target index patterns',
    async ({ apiClient, requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(
        getRoleWithoutTargetIndexPrivileges()
      );

      const response = await apiClient.put(ENTITY_STORE_ROUTES.public.UPDATE, {
        headers: { ...PUBLIC_HEADERS, ...apiKeyHeader },
        responseType: 'json',
        body: { logExtraction: {} },
      });

      expect(response.statusCode).toBe(403);
      expect(response.body.attributes).toMatchObject({
        missing_elasticsearch_privileges: {
          cluster: [],
          index: [
            {
              index: TARGET_INDEX_LATEST,
              privileges: expect.arrayContaining(ENTITY_STORE_TARGET_INDICES_PRIVILEGES),
            },
          ],
        },
      });
    }
  );

  apiTest(
    'update - Should fail when user lacks permissions for entity store saved object descriptor',
    async ({ apiClient, requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(
        getRoleWithoutSavedObjectCreate()
      );

      const response = await apiClient.put(ENTITY_STORE_ROUTES.public.UPDATE, {
        headers: { ...PUBLIC_HEADERS, ...apiKeyHeader },
        responseType: 'json',
        body: { logExtraction: {} },
      });

      expect(response.statusCode).toBe(403);
      expect(response.body.attributes).toMatchObject({
        missing_kibana_privileges: [SAVED_OBJECT_PRIVILEGE],
      });
    }
  );
});
