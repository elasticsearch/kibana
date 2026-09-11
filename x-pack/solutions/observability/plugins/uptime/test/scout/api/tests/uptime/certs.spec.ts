/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isRight } from 'fp-ts/Either';
import type { RoleApiCredentials } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import {
  processCertsResult,
  getCertsRequestBody,
} from '../../fixtures/helpers/get_certs_request_body';
import { CertType } from '../../fixtures/helpers/runtime_types';
import { apiTest, testData } from '../../fixtures';
import { makeChecksWithStatus } from '../../fixtures/helpers/make_checks';

apiTest.describe('certs api', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;

  apiTest.beforeAll(async ({ requestAuth, esArchiver, esClient }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
    await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.BLANK);
    await esClient.deleteByQuery({
      index: testData.GENERATED_INDEX,
      query: { match_all: {} },
      refresh: true,
      conflicts: 'proceed',
    });
  });

  apiTest('returns empty array for no data', async ({ apiClient }) => {
    const response = await apiClient.post('internal/search/ese', {
      headers: {
        ...adminCredentials.apiKeyHeader,
        ...testData.COMMON_HEADERS,
        'elastic-api-version': '1',
      },
      responseType: 'json',
      body: {
        params: {
          index: 'heartbeat-*',
          body: getCertsRequestBody({ pageIndex: 0, size: 10 }),
        },
      },
    });

    const result = processCertsResult(response.body.rawResponse);
    expect(result).toStrictEqual({ certs: [], total: 0 });
  });

  apiTest('retrieves expected cert data', async ({ apiClient, esClient }) => {
    const now = new Date();
    const cnva = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const cnvb = new Date(now.getTime() - 23 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const monitorId = 'monitor1';

    await makeChecksWithStatus(
      esClient,
      monitorId,
      3,
      1,
      10000,
      {
        tls: {
          server: {
            x509: {
              not_after: cnva,
              not_before: cnvb,
              issuer: {
                common_name: 'issuer-common-name',
              },
              subject: {
                common_name: 'subject-common-name',
              },
            },
            hash: {
              sha1: 'fewjio23r3',
              sha256: 'few9023fijoefw',
            },
          },
        },
      },
      'up',
      (d) => d
    );

    const response = await apiClient.post('internal/search/ese', {
      headers: {
        ...adminCredentials.apiKeyHeader,
        ...testData.COMMON_HEADERS,
        'elastic-api-version': '1',
      },
      responseType: 'json',
      body: {
        params: {
          index: 'heartbeat-*',
          body: getCertsRequestBody({ pageIndex: 0, size: 10 }),
        },
      },
    });

    const result = processCertsResult(response.body.rawResponse);

    expect(result.certs).toBeDefined();
    expect(Array.isArray(result.certs)).toBe(true);
    expect(result.certs).toHaveLength(1);

    const decoded = CertType.decode(result.certs[0]);
    expect(isRight(decoded)).toBe(true);

    const cert = result.certs[0];
    expect(Array.isArray(cert.monitors)).toBe(true);
    expect(cert.monitors[0]).toStrictEqual({
      name: undefined,
      configId: undefined,
      id: monitorId,
      url: 'http://localhost:5678/pattern?r=200x5,500x1',
    });
    expect(cert.not_after).toStrictEqual(cnva);
    expect(cert.not_before).toStrictEqual(cnvb);
    expect(cert.common_name).toBe('subject-common-name');
    expect(cert.issuer).toBe('issuer-common-name');
  });
});
