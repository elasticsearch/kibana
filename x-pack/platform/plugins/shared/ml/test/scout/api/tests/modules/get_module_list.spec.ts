/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';
import { setupFleetPackages, removeFleetPackages } from '../../fixtures/fleet_helpers';
import { ALL_MODULE_IDS, SECURITY_MODULE_IDS } from '../../fixtures/setup_module_helpers';

apiTest.describe('get_module: list and filter', { tag: '@local-stateful-classic' }, () => {
  // Fleet packages register apache_data_stream / nginx_data_stream in the ML module registry
  apiTest.beforeAll(async ({ apiServices }) => {
    await setupFleetPackages(apiServices);
  });

  apiTest.afterAll(async ({ apiServices }) => {
    await removeFleetPackages(apiServices);
  });

  apiTest('lists all modules in expected order', async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asMlPoweruser();

    const res = await apiClient.get('internal/ml/modules/get_module/', {
      headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
      responseType: 'json',
    });

    expect(res).toHaveStatusCode(200);
    expect(Array.isArray(res.body)).toBe(true);
    const responseModuleIds = (res.body as Array<{ id: string }>).map((m) => m.id);
    expect(responseModuleIds).toStrictEqual(ALL_MODULE_IDS);
  });

  apiTest(
    'lists only security modules when filtered by security',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get('internal/ml/modules/get_module/?filter=security', {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
      });

      expect(res).toHaveStatusCode(200);
      expect(Array.isArray(res.body)).toBe(true);
      const responseModuleIds = (res.body as Array<{ id: string }>).map((m) => m.id);
      expect(responseModuleIds).toStrictEqual(SECURITY_MODULE_IDS);
    }
  );

  apiTest(
    'returns 404 when filtering a non-security module by security tag',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get(
        'internal/ml/modules/get_module/apm_transaction?filter=security',
        {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(res).toHaveStatusCode(404);
    }
  );
});
