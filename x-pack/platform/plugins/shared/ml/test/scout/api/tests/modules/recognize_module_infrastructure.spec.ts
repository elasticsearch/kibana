/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';

apiTest.describe(
  'recognize_module: infrastructure datasets',
  { tag: '@local-stateful-classic' },
  () => {
    apiTest.beforeAll(async ({ esArchiver }) => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_heartbeat'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_auditbeat'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_metricbeat'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_metrics_ui'
      );
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_apm_transaction'
      );
    });

    apiTest('recognizes heartbeat dataset as uptime_heartbeat', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get('internal/ml/modules/recognize/ft_module_heartbeat', {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
      });

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(['uptime_heartbeat']);
    });

    apiTest(
      'recognizes auditbeat dataset as security_linux_v3',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get('internal/ml/modules/recognize/ft_module_auditbeat', {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual(['security_linux_v3']);
      }
    );

    apiTest(
      'recognizes metricbeat dataset as metricbeat_system_ecs and security_linux_v3',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get('internal/ml/modules/recognize/ft_module_metricbeat', {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual(['metricbeat_system_ecs', 'security_linux_v3'].sort());
      }
    );

    apiTest(
      'recognizes metrics UI dataset as security_linux_v3 (metrics UI modules have no recognizer query)',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get('internal/ml/modules/recognize/ft_module_metrics_ui', {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual(['security_linux_v3']);
      }
    );

    apiTest(
      'recognizes APM transaction dataset as apm_transaction',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asMlPoweruser();

        const res = await apiClient.get('internal/ml/modules/recognize/ft_module_apm_transaction', {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        });

        expect(res).toHaveStatusCode(200);
        const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
        expect(moduleIds).toStrictEqual(['apm_transaction']);
      }
    );
  }
);
