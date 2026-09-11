/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';

apiTest.describe(
  'recognize_module: sample data and logs datasets',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver }) => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_sample_logs'
      );
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/module_apache');
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/module_logs');
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/module_nginx');
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_sample_ecommerce'
      );
    });

    apiTest(
      'recognizes sample logs dataset as sample_data_weblogs',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get('internal/ml/modules/recognize/ft_module_sample_logs', {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        expect(Array.isArray(res.body)).toBe(true);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual(['sample_data_weblogs']);
      }
    );

    apiTest('recognizes apache dataset as apache_ecs', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get('internal/ml/modules/recognize/ft_module_apache', {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
      });

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(['apache_ecs']);
    });

    apiTest(
      'returns no modules for logs dataset (logs modules have no recognizer query)',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get('internal/ml/modules/recognize/ft_module_logs', {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual([]);
      }
    );

    apiTest('recognizes nginx dataset as nginx_ecs', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get('internal/ml/modules/recognize/ft_module_nginx', {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
      });

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(['nginx_ecs']);
    });

    apiTest(
      'recognizes sample ecommerce dataset as sample_data_ecommerce',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get(
          'internal/ml/modules/recognize/ft_module_sample_ecommerce',
          {
            headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual(['sample_data_ecommerce']);
      }
    );

    apiTest(
      'returns empty list for non-existent index pattern',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get(
          'internal/ml/modules/recognize/non-existent-index-pattern',
          {
            headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual([]);
      }
    );
  }
);
