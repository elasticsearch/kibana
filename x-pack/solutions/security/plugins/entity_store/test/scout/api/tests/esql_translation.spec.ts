/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-security/api';
import { apiTest } from '@kbn/scout-security';
import {
  PUBLIC_HEADERS,
  ENTITY_STORE_ROUTES,
  ENTITY_STORE_TAGS,
  UPDATES_INDEX,
} from '../fixtures/constants';
import { FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';
import { clearEntityStoreIndices, ingestDoc } from '../fixtures/helpers';
import { getEuidEsqlFilterBasedOnDocument } from '../../../../common/domain/euid/esql';
import {
  USER_SCOUT_INVALID_PER_DOCUMENT_FILTER_EXAMPLES,
  USER_TS_EXTRACTION_CASES,
} from '../fixtures/user_ts_extraction_cases';

apiTest.describe('ESQL query translation', { tag: ENTITY_STORE_TAGS }, () => {
  let defaultHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ samlAuth, apiClient, esArchiver, kbnClient }) => {
    const credentials = await samlAuth.asInteractiveUser('admin');
    defaultHeaders = {
      ...credentials.cookieHeader,
      ...PUBLIC_HEADERS,
    };

    await kbnClient.uiSettings.update({
      [FF_ENABLE_ENTITY_STORE_V2]: true,
    });

    // Install first so the data stream exists; then load the archive.
    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect(response.statusCode).toBe(201);

    await esArchiver.loadIfNeeded(
      'x-pack/solutions/security/plugins/entity_store/test/scout/api/es_archives/updates'
    );
  });

  apiTest.afterAll(async ({ apiClient, esClient }) => {
    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect(response.statusCode).toBe(200);
    await clearEntityStoreIndices(esClient);
  });

  apiTest(
    'generic: ESQL from doc with entity.id returns exactly that document',
    async ({ esClient }) => {
      const docSource = { entity: { id: 'generic-id' } };
      const filter = getEuidEsqlFilterBasedOnDocument('generic', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(1);
      const entityIdIdx = columns.findIndex((c) => c.name === 'entity.id');
      expect(entityIdIdx).toBeGreaterThan(-1);
      expect(values[0][entityIdIdx]).toBe('generic-id');
    }
  );

  apiTest(
    'host: ESQL from doc with host.name + host.domain returns expected document(s)',
    async ({ esClient }) => {
      const docSource = { host: { name: 'server-01', domain: 'example.com' } };
      const filter = getEuidEsqlFilterBasedOnDocument('host', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(3);
      const nameIdx = columns.findIndex((c) => c.name === 'host.name');
      const domainIdx = columns.findIndex((c) => c.name === 'host.domain');
      expect(nameIdx).toBeGreaterThan(-1);
      expect(domainIdx).toBeGreaterThan(-1);
      expect(values[0][nameIdx]).toBe('server-01');
      expect(values[0][domainIdx]).toBe('example.com');
    }
  );

  apiTest(
    'host: ESQL from doc with host.name only returns expected document',
    async ({ esClient }) => {
      const docSource = { host: { name: 'desktop-02' } };
      const filter = getEuidEsqlFilterBasedOnDocument('host', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(1);
      const nameIdx = columns.findIndex((c) => c.name === 'host.name');
      expect(nameIdx).toBeGreaterThan(-1);
      expect(values[0][nameIdx]).toBe('desktop-02');
    }
  );

  apiTest(
    'user: synthetic invalid docs should not return per-document ESQL filter (documentsFilter or postAgg gate)',
    async ({ esClient }) => {
      await esClient.esql.query({
        query: `FROM ${UPDATES_INDEX} | LIMIT 1`,
      });
      for (const example of USER_SCOUT_INVALID_PER_DOCUMENT_FILTER_EXAMPLES) {
        expect(getEuidEsqlFilterBasedOnDocument('user', example.doc)).toBeUndefined();
      }
    }
  );

  apiTest(
    'user: ESQL from doc with user.name + event.module returns exactly that document (filter without EVAL)',
    async ({ esClient }) => {
      const docSource = {
        user: { name: 'arnlod.schmidt', domain: 'elastic.co' },
        event: { kind: 'asset', module: 'entityanalytics_ad' },
      };
      const filter = getEuidEsqlFilterBasedOnDocument('user', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(1);
      const userNameIdx = columns.findIndex((c) => c.name === 'user.name');
      const domainIdx = columns.findIndex((c) => c.name === 'user.domain');
      expect(userNameIdx).toBeGreaterThan(-1);
      expect(domainIdx).toBeGreaterThan(-1);
      expect(values[0][userNameIdx]).toBe('arnlod.schmidt');
      expect(values[0][domainIdx]).toBe('elastic.co');
    }
  );

  apiTest(
    'user: ESQL from doc with user.name + event.module returns expected document (filter without EVAL)',
    async ({ esClient }) => {
      const docSource = {
        user: { name: 'john.doe' },
        event: { kind: 'asset', module: 'okta' },
      };
      const filter = getEuidEsqlFilterBasedOnDocument('user', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(1);
      const userNameIdx = columns.findIndex((c) => c.name === 'user.name');
      expect(userNameIdx).toBeGreaterThan(-1);
      expect(values[0][userNameIdx]).toBe('john.doe');
    }
  );

  apiTest(
    'user: ESQL from doc with data_stream.dataset only (first chunk) returns expected document (filter without EVAL)',
    async ({ esClient }) => {
      const docSource = {
        user: { name: 'cloudtrail.user' },
        event: { kind: 'asset' },
        data_stream: { dataset: 'aws.cloudtrail' },
      };
      const filter = getEuidEsqlFilterBasedOnDocument('user', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(1);
      const userNameIdx = columns.findIndex((c) => c.name === 'user.name');
      expect(userNameIdx).toBeGreaterThan(-1);
      expect(values[0][userNameIdx]).toBe('cloudtrail.user');
    }
  );

  apiTest(
    'user: ESQL from doc with no event.module or data_stream.dataset (unknown fallback) returns expected document',
    async ({ esClient }) => {
      const docSource = { user: { name: 'no.module.user' }, event: { kind: 'asset' } };
      const filter = getEuidEsqlFilterBasedOnDocument('user', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(1);
      const userNameIdx = columns.findIndex((c) => c.name === 'user.name');
      expect(userNameIdx).toBeGreaterThan(-1);
      expect(values[0][userNameIdx]).toBe('no.module.user');
    }
  );

  const userTsAssetCloudIngestedScenarios = USER_TS_EXTRACTION_CASES.filter(
    (c) =>
      c.id.startsWith('asset-cloud-provider-') &&
      c.ingestSource !== undefined &&
      c.expectedEuid !== undefined &&
      !c.expectNoPerDocumentDsl
  );

  for (const scenario of userTsAssetCloudIngestedScenarios) {
    apiTest(
      `user: ESQL (ingested asset + cloud.provider) matches scenario "${scenario.id}"`,
      async ({ esClient }) => {
        await ingestDoc(esClient, scenario.ingestSource!);
        const filter = getEuidEsqlFilterBasedOnDocument('user', scenario.dslFilterSource);
        expect(filter).toBeDefined();

        const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
        const result = await esClient.esql.query({
          query,
          drop_null_columns: true,
        });

        const { values, columns } = result;
        expect(values).toHaveLength(1);
        const userNameIdx = columns.findIndex((c) => c.name === 'user.name');
        expect(userNameIdx).toBeGreaterThan(-1);
        const expectedUserName = (scenario.dslFilterSource as { user?: { name?: string } }).user
          ?.name;
        expect(expectedUserName).toBeDefined();
        expect(values[0][userNameIdx]).toBe(expectedUserName);
      }
    );
  }

  apiTest(
    'service: ESQL from doc with service.name returns exactly that document',
    async ({ esClient }) => {
      const docSource = { service: { name: 'mailchimp' } };
      const filter = getEuidEsqlFilterBasedOnDocument('service', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(1);
      const entityIdIdx = columns.findIndex((c) => c.name === 'service.entity.id');
      expect(entityIdIdx).toBeGreaterThan(-1);
      expect(values[0][entityIdIdx]).toBe('mailchimp');
    }
  );

  apiTest(
    'service: ESQL from doc with service.name returns expected document',
    async ({ esClient }) => {
      const docSource = { service: { name: 'service-name' } };
      const filter = getEuidEsqlFilterBasedOnDocument('service', docSource);
      expect(filter).toBeDefined();

      const query = `FROM ${UPDATES_INDEX} | WHERE ${filter} | LIMIT 10`;
      const result = await esClient.esql.query({
        query,
      });

      const { values, columns } = result;
      expect(values).toHaveLength(1);
      const nameIdx = columns.findIndex((c) => c.name === 'service.name');
      expect(nameIdx).toBeGreaterThan(-1);
      expect(values[0][nameIdx]).toBe('service-name');
    }
  );
});
