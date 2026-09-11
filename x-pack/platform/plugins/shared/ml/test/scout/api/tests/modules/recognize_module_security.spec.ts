/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';

apiTest.describe('recognize_module: security datasets', { tag: '@local-stateful-classic' }, () => {
  apiTest.beforeAll(async ({ esArchiver }) => {
    await Promise.all([
      esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_auditbeat'
      ),
      esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_packetbeat'
      ),
      esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_winlogbeat'
      ),
      esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_endpoint'
      ),
      esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_cloudtrail'
      ),
      esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_azure_activitylogs'
      ),
      esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/module_security_gcp_audit'
      ),
    ]);
  });

  apiTest(
    'recognizes security auditbeat dataset as security_auth',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get(
        'internal/ml/modules/recognize/ft_module_security_auditbeat',
        {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(['security_auth']);
    }
  );

  apiTest(
    'recognizes security packetbeat dataset as security_packetbeat',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get(
        'internal/ml/modules/recognize/ft_module_security_packetbeat',
        {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(['security_packetbeat']);
    }
  );

  apiTest(
    'recognizes security winlogbeat dataset as security_auth, security_network, security_windows_v3',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get(
        'internal/ml/modules/recognize/ft_module_security_winlogbeat',
        {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(
        ['security_auth', 'security_network', 'security_windows_v3'].sort()
      );
    }
  );

  apiTest(
    'recognizes security endpoint dataset as 5 security modules',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get('internal/ml/modules/recognize/ft_logs-endpoint.events.*', {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
      });

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(
        [
          'security_auth',
          'security_host',
          'security_linux_v3',
          'security_network',
          'security_windows_v3',
        ].sort()
      );
    }
  );

  apiTest(
    'recognizes security cloudtrail dataset as security_cloudtrail',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get(
        'internal/ml/modules/recognize/ft_module_security_cloudtrail',
        {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(['security_cloudtrail']);
    }
  );

  apiTest(
    'recognizes security azure activity logs dataset as security_azure_activitylogs',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get(
        'internal/ml/modules/recognize/ft_module_security_azure_activitylogs',
        {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(['security_azure_activitylogs']);
    }
  );

  apiTest(
    'recognizes security GCP audit dataset as security_gcp_audit',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.get(
        'internal/ml/modules/recognize/ft_module_security_gcp_audit',
        {
          headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(res).toHaveStatusCode(200);
      const moduleIds = (res.body as Array<{ id: string }>).map((m) => m.id).sort();
      expect(moduleIds).toStrictEqual(['security_gcp_audit']);
    }
  );
});
