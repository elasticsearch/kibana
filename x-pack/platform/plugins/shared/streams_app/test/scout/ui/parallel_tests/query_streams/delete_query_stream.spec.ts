/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../../fixtures';
import {
  createQueryStream,
  createRootStreamViews,
  deleteQueryStream,
  deleteRootStreamViews,
  disableQueryStreams,
  enableQueryStreams,
} from '../../fixtures/query_stream_helpers';

const QUERY_STREAM_NAME = 'logs.ecs.test';
const ESQL_VIEW_NAME = `$.${QUERY_STREAM_NAME}`;
const INITIAL_ESQL_QUERY = 'FROM $.logs.ecs | WHERE host.name == "host-1"';

test.describe('Query streams - Delete query stream', { tag: tags.stateful.classic }, () => {
  test.beforeEach(async ({ browserAuth, kbnClient, pageObjects, esClient }) => {
    await browserAuth.loginAsAdmin();
    await enableQueryStreams(kbnClient);
    await createRootStreamViews(esClient);
    await createQueryStream(
      esClient,
      kbnClient,
      QUERY_STREAM_NAME,
      ESQL_VIEW_NAME,
      INITIAL_ESQL_QUERY
    );
    await pageObjects.streams.gotoStreamMainPage();
  });

  test.afterAll(async ({ kbnClient, apiServices, esClient, log }) => {
    await deleteQueryStream(apiServices, esClient, QUERY_STREAM_NAME, ESQL_VIEW_NAME, log);
    await deleteRootStreamViews(esClient);
    await disableQueryStreams(kbnClient);
  });

  test('should support deleting an existing query stream', async ({ pageObjects, esClient }) => {
    await pageObjects.streams.clickStreamNameLink(QUERY_STREAM_NAME);
    await pageObjects.streams.clickQueryStreamDetailsTab('overview');
    await pageObjects.streams.clickDeleteQueryStreamButton();
    await pageObjects.streams.fillDeleteQueryStreamModalInput(QUERY_STREAM_NAME);
    await pageObjects.streams.clickDeleteQueryStreamModalDeleteButton();
    await expect(pageObjects.streams.queryStreamDeletedSuccessToast).toBeVisible();

    // Verify the ES|QL view was deleted
    await expect(
      esClient.transport.request({
        method: 'GET',
        path: `/_query/view/${encodeURIComponent(ESQL_VIEW_NAME)}`,
      })
    ).rejects.toThrow(/index_not_found_exception/);
  });
});
