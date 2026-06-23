/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest, FAVORITES_API_PATH, INTERNAL_HEADERS } from '../fixtures';

const FAVORITE_TYPE = 'esql_query';

const METADATA_1 = {
  queryString: 'SELECT * FROM test1',
  createdAt: '2021-09-01T00:00:00Z',
  status: 'success',
};

const METADATA_2 = {
  queryString: 'SELECT * FROM test2',
  createdAt: '2023-09-01T00:00:00Z',
  status: 'success',
};

apiTest.describe(
  'content management - esql_query favorites',
  { tag: tags.stateful.classic },
  () => {
    let user1CookieHeader: Record<string, string>;

    apiTest.beforeAll(async ({ samlAuth, config }) => {
      const privilegedRoleName =
        config.serverless && config.projectType === 'es' ? 'developer' : 'editor';
      ({ cookieHeader: user1CookieHeader } = await samlAuth.asInteractiveUser(privilegedRoleName));
    });

    apiTest('favoriting with missing or invalid metadata returns 400', async ({ apiClient }) => {
      await apiTest.step('invalid metadata schema', async () => {
        const r = await apiClient.post(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}/q1/favorite`, {
          headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
          body: { metadata: { foo: 'bar' } },
        });
        expect(r).toHaveStatusCode(400);
      });

      await apiTest.step('empty metadata object', async () => {
        const r = await apiClient.post(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}/q1/favorite`, {
          headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
          body: { metadata: {} },
        });
        expect(r).toHaveStatusCode(400);
      });
    });

    apiTest('esql_query favorites: add, list with metadata, remove', async ({ apiClient }) => {
      const suffix = `esql-${Date.now()}`;
      const qid1 = `${suffix}-q1`;
      const qid2 = `${suffix}-q2`;

      await apiTest.step('our IDs are absent before the test', async () => {
        const r = await apiClient.get(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}`, {
          headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
        });
        expect(r).toHaveStatusCode(200);
        expect(r.body.favoriteIds).not.toContain(qid1);
        expect(r.body.favoriteIds).not.toContain(qid2);
      });

      await apiTest.step('favoriting qid1 adds it with correct metadata', async () => {
        const r = await apiClient.post(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}/${qid1}/favorite`, {
          headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
          body: { metadata: METADATA_1 },
        });
        expect(r).toHaveStatusCode(200);
        expect(r.body.favoriteIds).toContain(qid1);
      });

      await apiTest.step('list shows qid1 with correct metadata', async () => {
        const r = await apiClient.get(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}`, {
          headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
        });
        expect(r.body.favoriteIds).toContain(qid1);
        expect(r.body.favoriteMetadata[qid1]).toStrictEqual(METADATA_1);
      });

      await apiTest.step('favoriting qid2 adds it alongside qid1', async () => {
        const r = await apiClient.post(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}/${qid2}/favorite`, {
          headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
          body: { metadata: METADATA_2 },
        });
        expect(r).toHaveStatusCode(200);
        expect(r.body.favoriteIds).toContain(qid1);
        expect(r.body.favoriteIds).toContain(qid2);
      });

      await apiTest.step('list shows both IDs with correct metadata', async () => {
        const r = await apiClient.get(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}`, {
          headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
        });
        expect(r.body.favoriteIds).toContain(qid1);
        expect(r.body.favoriteIds).toContain(qid2);
        expect(r.body.favoriteMetadata[qid1]).toStrictEqual(METADATA_1);
        expect(r.body.favoriteMetadata[qid2]).toStrictEqual(METADATA_2);
      });

      await apiTest.step('unfavoriting qid1 removes it; qid2 remains', async () => {
        const r = await apiClient.post(
          `${FAVORITES_API_PATH}/${FAVORITE_TYPE}/${qid1}/unfavorite`,
          { headers: { ...INTERNAL_HEADERS, ...user1CookieHeader } }
        );
        expect(r).toHaveStatusCode(200);
        expect(r.body.favoriteIds).not.toContain(qid1);
        expect(r.body.favoriteIds).toContain(qid2);
      });

      await apiTest.step('cleanup: unfavorite qid2', async () => {
        const r = await apiClient.post(
          `${FAVORITES_API_PATH}/${FAVORITE_TYPE}/${qid2}/unfavorite`,
          { headers: { ...INTERNAL_HEADERS, ...user1CookieHeader } }
        );
        expect(r).toHaveStatusCode(200);
        expect(r.body.favoriteIds).not.toContain(qid2);
      });

      await apiTest.step('list is empty for our IDs after cleanup', async () => {
        const r = await apiClient.get(`${FAVORITES_API_PATH}/${FAVORITE_TYPE}`, {
          headers: { ...INTERNAL_HEADERS, ...user1CookieHeader },
        });
        expect(r.body.favoriteIds).not.toContain(qid1);
        expect(r.body.favoriteIds).not.toContain(qid2);
      });
    });
  }
);
