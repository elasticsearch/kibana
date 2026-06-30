/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import { INTERNAL_HEADERS, ENTITY_STORE_ROUTES, ENTITY_STORE_TAGS } from '../fixtures/constants';
import {
  FF_ENABLE_ENTITY_STORE_V2,
  getEntitiesAlias,
  ENTITY_LATEST,
  getLatestEntityIndexPattern,
  getEntityMetadataAlias,
  getMetadataEntityIndexPattern,
} from '../../../../common';

apiTest.describe('Entity Store check privileges API', { tag: ENTITY_STORE_TAGS }, () => {
  const ENTITIES_ALIAS_INDEX = getEntitiesAlias(ENTITY_LATEST, 'default');
  const LATEST_ENTITY_INDEX = getLatestEntityIndexPattern('default');
  const METADATA_ALIAS_INDEX = getEntityMetadataAlias('default');
  const METADATA_INDEX_PATTERN = getMetadataEntityIndexPattern('default');

  apiTest.beforeAll(async ({ kbnClient }) => {
    await kbnClient.uiSettings.update({
      [FF_ENABLE_ENTITY_STORE_V2]: true,
    });
  });

  apiTest('Should return full privileges for admin user', async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');

    const response = await apiClient.get(ENTITY_STORE_ROUTES.internal.CHECK_PRIVILEGES, {
      headers: { ...cookieHeader, ...INTERNAL_HEADERS },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    expect(response.body).toMatchObject({
      has_all_required: true,
      has_read_permissions: true,
      has_write_permissions: true,
    });
  });

  apiTest(
    'Should deny access for user without securitySolution privilege',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser({
        elasticsearch: { cluster: [] },
        kibana: [{ base: [], feature: { discover: ['all'] }, spaces: ['*'] }],
      });

      const response = await apiClient.get(ENTITY_STORE_ROUTES.internal.CHECK_PRIVILEGES, {
        headers: { ...cookieHeader, ...INTERNAL_HEADERS },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(403);
    }
  );

  apiTest(
    'Should return no index permissions for user with securitySolution privilege but no index access',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser({
        elasticsearch: { cluster: [] },
        kibana: [
          {
            base: [],
            feature: { siemV5: ['all'] },
            spaces: ['default'],
          },
        ],
      });

      const response = await apiClient.get(ENTITY_STORE_ROUTES.internal.CHECK_PRIVILEGES, {
        headers: { ...cookieHeader, ...INTERNAL_HEADERS },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({
        has_all_required: false,
        has_read_permissions: false,
        has_write_permissions: false,
      });
    }
  );

  apiTest(
    'Should return has_read_permissions: false when user has read access to only one of the required indices',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser({
        elasticsearch: {
          cluster: [],
          indices: [{ names: [ENTITIES_ALIAS_INDEX], privileges: ['read'] }],
        },
        kibana: [
          {
            base: [],
            feature: { siemV5: ['all'] },
            spaces: ['*'],
          },
        ],
      });

      const response = await apiClient.get(ENTITY_STORE_ROUTES.internal.CHECK_PRIVILEGES, {
        headers: { ...cookieHeader, ...INTERNAL_HEADERS },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({
        has_all_required: false,
        has_read_permissions: false,
        has_write_permissions: false,
      });
    }
  );

  apiTest(
    'Should return limited privileges for user with read-only access to entities index',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser({
        elasticsearch: {
          cluster: [],
          indices: [
            { names: [ENTITIES_ALIAS_INDEX], privileges: ['read'] },
            { names: [LATEST_ENTITY_INDEX], privileges: ['read'] },
            { names: [METADATA_ALIAS_INDEX], privileges: ['read'] },
            { names: [METADATA_INDEX_PATTERN], privileges: ['read'] },
          ],
        },
        kibana: [
          {
            base: [],
            feature: { siemV5: ['all'] },
            spaces: ['*'],
          },
        ],
      });

      const response = await apiClient.get(ENTITY_STORE_ROUTES.internal.CHECK_PRIVILEGES, {
        headers: { ...cookieHeader, ...INTERNAL_HEADERS },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({
        has_all_required: false,
        has_read_permissions: true,
        has_write_permissions: false,
      });
    }
  );
});
