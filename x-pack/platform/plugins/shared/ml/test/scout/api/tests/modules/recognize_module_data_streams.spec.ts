/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';
import { setupFleetPackages, removeFleetPackages } from '../../fixtures/fleet_helpers';

apiTest.describe(
  'recognize_module: data stream datasets (requires Fleet packages)',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver, apiServices }) => {
      await setupFleetPackages(apiServices);

      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_apache_data_stream'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_nginx_data_stream'
      );
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await removeFleetPackages(apiServices);
    });

    apiTest(
      'recognizes apache data stream dataset as apache_data_stream',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get(
          'internal/ml/modules/recognize/ft_module_apache_data_stream',
          {
            headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual(['apache_data_stream']);
      }
    );

    apiTest(
      'recognizes nginx data stream dataset as nginx_data_stream',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get(
          'internal/ml/modules/recognize/ft_module_nginx_data_stream',
          {
            headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual(['nginx_data_stream']);
      }
    );
  }
);
