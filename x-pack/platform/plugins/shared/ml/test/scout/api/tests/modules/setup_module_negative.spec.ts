/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { mlApiTest as apiTest, INTERNAL_API_HEADERS } from '../../fixtures';

const DATA_VIEW = { name: 'ft_module_sample_logs', timeField: '@timestamp' };

apiTest.describe('setup_module: rejected requests', { tag: '@local-stateful-classic' }, () => {
  apiTest.beforeAll(async ({ apiServices }) => {
    await apiServices.dataViews.create({
      title: DATA_VIEW.name,
      timeFieldName: DATA_VIEW.timeField,
    });
  });

  apiTest.afterAll(async ({ apiServices }) => {
    await apiServices.dataViews.deleteByTitle(DATA_VIEW.name);
  });

  apiTest(
    'returns 400 when a non-existent data view is specified',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlPoweruser();

      const res = await apiClient.post('internal/ml/modules/setup/sample_data_weblogs', {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
        body: {
          indexPatternName: 'non-existent-data-view',
          startDatafeed: false,
        },
      });

      expect(res).toHaveStatusCode(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toBe(
        "Module's jobs contain custom URLs which require a Kibana data view (non-existent-data-view) which cannot be found."
      );
    }
  );

  apiTest(
    'returns 403 when the user lacks ML write permission',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asMlUnauthorized();

      const res = await apiClient.post('internal/ml/modules/setup/sample_data_weblogs', {
        headers: { ...INTERNAL_API_HEADERS, ...cookieHeader },
        responseType: 'json',
        body: {
          prefix: 'pfn1_',
          indexPatternName: DATA_VIEW.name,
          startDatafeed: false,
        },
      });

      expect(res).toHaveStatusCode(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toBe(
        'API [POST /internal/ml/modules/setup/sample_data_weblogs] is unauthorized for user, this action is granted by the Kibana privileges [ml:canCreateJob]'
      );
    }
  );
});
