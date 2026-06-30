/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MockedLogger } from '@kbn/logging-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { decodeCloudId } from './decode_cloud_id';

describe('Fleet - decodeCloudId', () => {
  let logger: MockedLogger;

  beforeEach(() => {
    logger = loggerMock.create();
  });

  it('parses various CloudID formats', () => {
    const tests = [
      {
        cloudID:
          'staging:dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
        expectedEsURL: 'https://cec6f261a74bf24ce33bb8811b84294f.us-east-1.aws.found.io:443',
        expectedKibanaURL: 'https://c6c2ca6d042249af0cc7d7a9e9625743.us-east-1.aws.found.io:443',
      },
      {
        cloudID:
          'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
        expectedEsURL: 'https://cec6f261a74bf24ce33bb8811b84294f.us-east-1.aws.found.io:443',
        expectedKibanaURL: 'https://c6c2ca6d042249af0cc7d7a9e9625743.us-east-1.aws.found.io:443',
      },
      {
        cloudID:
          ':dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
        expectedEsURL: 'https://cec6f261a74bf24ce33bb8811b84294f.us-east-1.aws.found.io:443',
        expectedKibanaURL: 'https://c6c2ca6d042249af0cc7d7a9e9625743.us-east-1.aws.found.io:443',
      },
      {
        cloudID:
          'gcp-cluster:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvJDhhMDI4M2FmMDQxZjE5NWY3NzI5YmMwNGM2NmEwZmNlJDBjZDVjZDU2OGVlYmU1M2M4OWViN2NhZTViYWM4YjM3',
        expectedEsURL: 'https://8a0283af041f195f7729bc04c66a0fce.us-central1.gcp.cloud.es.io:443',
        expectedKibanaURL:
          'https://0cd5cd568eebe53c89eb7cae5bac8b37.us-central1.gcp.cloud.es.io:443',
      },
      {
        cloudID:
          'custom-port:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvOjkyNDMkYWMzMWViYjkwMjQxNzczMTU3MDQzYzM0ZmQyNmZkNDYkYTRjMDYyMzBlNDhjOGZjZTdiZTg4YTA3NGEzYmIzZTA=',
        expectedEsURL: 'https://ac31ebb90241773157043c34fd26fd46.us-central1.gcp.cloud.es.io:9243',
        expectedKibanaURL:
          'https://a4c06230e48c8fce7be88a074a3bb3e0.us-central1.gcp.cloud.es.io:9243',
      },
      {
        cloudID:
          'different-es-kb-port:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvJGFjMzFlYmI5MDI0MTc3MzE1NzA0M2MzNGZkMjZmZDQ2OjkyNDMkYTRjMDYyMzBlNDhjOGZjZTdiZTg4YTA3NGEzYmIzZTA6OTI0NA==',
        expectedEsURL: 'https://ac31ebb90241773157043c34fd26fd46.us-central1.gcp.cloud.es.io:9243',
        expectedKibanaURL:
          'https://a4c06230e48c8fce7be88a074a3bb3e0.us-central1.gcp.cloud.es.io:9244',
      },
      {
        cloudID:
          'only-kb-set:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvJGFjMzFlYmI5MDI0MTc3MzE1NzA0M2MzNGZkMjZmZDQ2JGE0YzA2MjMwZTQ4YzhmY2U3YmU4OGEwNzRhM2JiM2UwOjkyNDQ=',
        expectedEsURL: 'https://ac31ebb90241773157043c34fd26fd46.us-central1.gcp.cloud.es.io:443',
        expectedKibanaURL:
          'https://a4c06230e48c8fce7be88a074a3bb3e0.us-central1.gcp.cloud.es.io:9244',
      },
      {
        cloudID:
          'host-and-kb-set:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvOjkyNDMkYWMzMWViYjkwMjQxNzczMTU3MDQzYzM0ZmQyNmZkNDYkYTRjMDYyMzBlNDhjOGZjZTdiZTg4YTA3NGEzYmIzZTA6OTI0NA==',
        expectedEsURL: 'https://ac31ebb90241773157043c34fd26fd46.us-central1.gcp.cloud.es.io:9243',
        expectedKibanaURL:
          'https://a4c06230e48c8fce7be88a074a3bb3e0.us-central1.gcp.cloud.es.io:9244',
      },
      {
        cloudID:
          'extra-items:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvJGFjMzFlYmI5MDI0MTc3MzE1NzA0M2MzNGZkMjZmZDQ2JGE0YzA2MjMwZTQ4YzhmY2U3YmU4OGEwNzRhM2JiM2UwJGFub3RoZXJpZCRhbmRhbm90aGVy',
        expectedEsURL: 'https://ac31ebb90241773157043c34fd26fd46.us-central1.gcp.cloud.es.io:443',
        expectedKibanaURL:
          'https://a4c06230e48c8fce7be88a074a3bb3e0.us-central1.gcp.cloud.es.io:443',
      },
    ];

    for (const test of tests) {
      const decoded = decodeCloudId(test.cloudID, logger);
      expect(decoded).toBeTruthy();
      expect(decoded?.elasticsearchUrl === test.expectedEsURL).toBe(true);
      expect(decoded?.kibanaUrl === test.expectedKibanaURL).toBe(true);
    }
  });

  it('exposes the Elasticsearch cluster ID', () => {
    const decoded = decodeCloudId(
      'staging:dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      logger
    );

    expect(decoded?.elasticsearchClusterId).toBe('cec6f261a74bf24ce33bb8811b84294f');
  });

  it('returns undefined for invalid formats', () => {
    const tests = [
      {
        cloudID:
          'staging:garbagedXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
        errorMsg: 'base64 decoding failed',
      },
      {
        cloudID: 'dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvJDhhMDI4M2FmMDQxZjE5NWY3NzI5YmMwNGM2NmEwZg==',
        errorMsg: 'Expected at least 3 parts',
      },
    ];

    for (const test of tests) {
      const decoded = decodeCloudId(test.cloudID, logger);
      expect(decoded).toBe(undefined);
      // decodeCloudId currently only logs; not throws errors
    }
  });
});
