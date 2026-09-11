/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { ROLLUP_ADMIN_ROLE } from '../../common/fixtures/constants';
import { deleteIndicesMatching } from '../../common/fixtures/rollup_api';
import { COMMON_HEADERS, SOURCE_INDEX_PREFIX } from '../fixtures/constants';
import { createSourceIndex, rollupApi } from '../fixtures/rollup_jobs';

apiTest.describe(
  'Rollup index pattern validity',
  { tag: ['@local-stateful-classic', '@cloud-stateful-classic'] },
  () => {
    let headers: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth }) => {
      const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(ROLLUP_ADMIN_ROLE);
      headers = { ...COMMON_HEADERS, ...apiKeyHeader };
    });

    // Defensive sweep in case an interrupted run left a matching source index behind.
    apiTest.beforeEach(async ({ esClient }) => {
      await deleteIndicesMatching(esClient, [`${SOURCE_INDEX_PREFIX}*`]);
    });

    apiTest.afterEach(async ({ esClient }) => {
      await deleteIndicesMatching(esClient, [`${SOURCE_INDEX_PREFIX}*`]);
    });

    apiTest(
      'reports date, numeric and keyword fields for a matching index',
      async ({ apiClient, esClient }) => {
        const indexName = await createSourceIndex(esClient, 'validity');

        const response = await rollupApi(apiClient, headers).getIndexPatternValidity(indexName);

        expect(response).toHaveStatusCode(200);
        expect(Object.keys(response.body)).toStrictEqual([
          'doesMatchIndices',
          'doesMatchRollupIndices',
          'dateFields',
          'numericFields',
          'keywordFields',
        ]);
        expect(response.body.doesMatchIndices).toBe(true);
        expect(response.body.doesMatchRollupIndices).toBe(false);
        expect(response.body.dateFields).toStrictEqual(['testCreatedField']);
        // `_tier` and `_doc_count` are metadata fields ES adds; their order isn't guaranteed, so
        // assert on membership rather than on the whole array.
        expect(response.body.keywordFields).toStrictEqual(
          expect.arrayContaining(['_tier', 'testTagField'])
        );
        expect(response.body.numericFields).toStrictEqual(
          expect.arrayContaining(['_doc_count', 'testTotalField'])
        );
      }
    );

    apiTest("reports no fields when the pattern doesn't match any index", async ({ apiClient }) => {
      const response = await rollupApi(apiClient, headers).getIndexPatternValidity(
        'index-does-not-exist'
      );

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({
        dateFields: [],
        keywordFields: [],
        numericFields: [],
        doesMatchIndices: false,
        doesMatchRollupIndices: false,
      });
    });
  }
);
