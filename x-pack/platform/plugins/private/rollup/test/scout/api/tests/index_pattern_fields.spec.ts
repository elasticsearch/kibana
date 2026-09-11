/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import { DataViewType } from '@kbn/data-views-plugin/common';
import { FIELDS_FOR_WILDCARD_PATH } from '@kbn/data-views-plugin/common/constants';
import { INITIAL_REST_VERSION_INTERNAL } from '@kbn/data-views-plugin/server/constants';
import type { ApiClientFixture } from '@kbn/scout';
import { apiTest } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { ROLLUP_ADMIN_ROLE } from '../../common/fixtures/constants';
import { createMockRollupIndex } from '../../common/fixtures/rollup_api';
import { COMMON_HEADERS, TARGET_INDEX_PREFIX } from '../fixtures/constants';
import {
  cleanupRollupState,
  createSourceIndex,
  getJobPayload,
  rollupApi,
} from '../fixtures/rollup_jobs';

const TARGET_INDEX = `${TARGET_INDEX_PREFIX}-fields`;

apiTest.describe(
  'Data view fields for a rollup index',
  { tag: ['@local-stateful-classic', '@cloud-stateful-classic'] },
  () => {
    let headers: Record<string, string>;

    const getFieldsForWildcard = (apiClient: ApiClientFixture, query: string) =>
      apiClient.get(`${FIELDS_FOR_WILDCARD_PATH}${query}`, { headers, responseType: 'json' });

    apiTest.beforeAll(async ({ requestAuth }) => {
      // `fields_for_wildcard` is an internal route, so it needs the internal-origin header (in
      // COMMON_HEADERS) plus the internal API version. Auth is an API key rather than the usual
      // cookie session for internal routes: this suite runs on Cloud (@cloud-stateful-classic),
      // and samlAuth custom roles require predefined Cloud users that don't exist there, whereas a
      // custom-role API key works both locally and on ECH.
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(ROLLUP_ADMIN_ROLE);
      headers = {
        ...COMMON_HEADERS,
        ...apiKeyHeader,
        [ELASTIC_HTTP_VERSION_HEADER]: INITIAL_REST_VERSION_INTERNAL,
      };
    });

    // Defensive sweep in case an interrupted run left rollup jobs or indices behind.
    apiTest.beforeEach(async ({ esClient }) => {
      await cleanupRollupState(esClient);
    });

    apiTest.afterEach(async ({ esClient }) => {
      await cleanupRollupState(esClient);
    });

    apiTest('requires a pattern query param', async ({ apiClient }) => {
      const response = await getFieldsForWildcard(apiClient, '');

      expect(response).toHaveStatusCode(400);
      expect(response.body.message).toContain(
        '[request query.pattern]: expected value of type [string]'
      );
    });

    apiTest('returns 404 when the rollup index does not exist', async ({ apiClient }) => {
      const response = await getFieldsForWildcard(
        apiClient,
        `?pattern=foo&type=${DataViewType.ROLLUP}&rollup_index=bar`
      );

      expect(response).toHaveStatusCode(404);
      expect(response.body.message).toContain('No indices match "foo"');
    });

    apiTest('returns the rolled-up fields of a matching index', async ({ apiClient, esClient }) => {
      // Since 8.15 ES only allows creating a rollup job when the cluster already has rollup
      // usage, which the mock index simulates.
      await createMockRollupIndex(esClient);
      const indexName = await createSourceIndex(esClient, 'fields');
      await rollupApi(apiClient, headers).createJob(
        getJobPayload(indexName, 'fields-job', TARGET_INDEX)
      );

      const response = await getFieldsForWildcard(
        apiClient,
        `?pattern=${indexName}&rollup_index=${TARGET_INDEX}`
      );

      expect(response).toHaveStatusCode(200);
      const fields: Array<{ name: string }> = response.body.fields;
      expect(fields.map(({ name }) => name).sort()).toStrictEqual([
        'testCreatedField',
        'testTagField',
        'testTotalField',
      ]);
    });
  }
);
