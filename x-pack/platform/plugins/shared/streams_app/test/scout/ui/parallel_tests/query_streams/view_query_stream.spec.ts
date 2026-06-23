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
const TEST_ESQL_QUERY = 'FROM $.logs.ecs | LIMIT 1';

test.describe('Query streams - View query stream', { tag: tags.stateful.classic }, () => {
  test.beforeEach(async ({ browserAuth, kbnClient, pageObjects, esClient }) => {
    await browserAuth.loginAsAdmin();
    await enableQueryStreams(kbnClient);
    await createRootStreamViews(esClient);
    await createQueryStream(
      esClient,
      kbnClient,
      QUERY_STREAM_NAME,
      ESQL_VIEW_NAME,
      TEST_ESQL_QUERY
    );
    await pageObjects.streams.gotoStreamMainPage();
  });

  test.afterAll(async ({ kbnClient, apiServices, esClient, log }) => {
    await deleteQueryStream(apiServices, esClient, QUERY_STREAM_NAME, ESQL_VIEW_NAME, log);
    await deleteRootStreamViews(esClient);
    await disableQueryStreams(kbnClient);
  });

  test('should show query stream in navigation with detail view accessible', async ({
    page,
    pageObjects,
  }) => {
    // query stream created and visible in streams ui
    await expect(page.getByTestId(`streamsNameLink-${QUERY_STREAM_NAME}`)).toBeVisible();

    await pageObjects.streams.clickStreamNameLink(QUERY_STREAM_NAME);
    await pageObjects.streams.clickQueryStreamDetailsTab('overview');

    // details are visible and show the query
    await expect(pageObjects.streams.queryStreamDetailsQueryViewerCodeBlock).toHaveText(
      TEST_ESQL_QUERY
    );
  });
});
