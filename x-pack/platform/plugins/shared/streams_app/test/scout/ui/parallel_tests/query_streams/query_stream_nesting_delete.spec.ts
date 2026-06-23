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
  createRootStreamViews,
  deleteRootStreamViews,
  deleteQueryStream,
  disableQueryStreams,
  enableQueryStreams,
} from '../../fixtures/query_stream_helpers';

const ROOT_STREAM_NAMES = ['logs.ecs', 'logs.otel'];
const PARENT_STREAM_NAME = 'nesting-del-parent';
const CHILD_STREAM_NAME = 'child';
const GRANDCHILD_STREAM_NAME = 'grandchild';

const CHILD_FULL_NAME = `${PARENT_STREAM_NAME}.${CHILD_STREAM_NAME}`;
const GRANDCHILD_FULL_NAME = `${CHILD_FULL_NAME}.${GRANDCHILD_STREAM_NAME}`;

const STREAM_NAMES_CREATED_BY_SPEC = [GRANDCHILD_FULL_NAME, CHILD_FULL_NAME, PARENT_STREAM_NAME];

test.describe(
  'Query streams - Deleting nested query streams cascades to children',
  { tag: tags.stateful.classic },
  () => {
    test.beforeEach(async ({ browserAuth, kbnClient, apiServices, esClient, pageObjects }) => {
      await browserAuth.loginAsAdmin();
      await enableQueryStreams(kbnClient);
      for (const rootStreamName of ROOT_STREAM_NAMES) {
        await apiServices.streams.restoreDataStream(rootStreamName);
      }
      await createRootStreamViews(esClient);
      await pageObjects.streams.gotoStreamMainPage();
    });

    test.afterAll(async ({ kbnClient, esClient, apiServices, log }) => {
      for (const streamName of STREAM_NAMES_CREATED_BY_SPEC) {
        await deleteQueryStream(apiServices, esClient, streamName, `$.${streamName}`, log);
      }
      await deleteRootStreamViews(esClient);
      await disableQueryStreams(kbnClient);
    });

    test('Should remove deleted child query streams and their nested children from the streams list', async ({
      page,
      pageObjects,
    }) => {
      await pageObjects.streams.createRootQueryStream(
        PARENT_STREAM_NAME,
        `FROM $.logs.ecs | LIMIT 100`
      );

      await pageObjects.streams.gotoStreamMainPage();
      await pageObjects.streams.clickStreamNameLink(PARENT_STREAM_NAME);
      await pageObjects.streams.gotoPartitioningTab(PARENT_STREAM_NAME);
      await pageObjects.streams.selectChildStreamType('Query');
      await pageObjects.streams.openCreateChildQueryStreamForm();
      await pageObjects.streams.fillChildQueryStreamForm(
        CHILD_STREAM_NAME,
        `FROM $.${PARENT_STREAM_NAME} | LIMIT 100`
      );
      await pageObjects.streams.saveChildQueryStream();

      await pageObjects.streams.gotoStreamMainPage();
      await pageObjects.streams.clickStreamNameLink(CHILD_FULL_NAME);
      await pageObjects.streams.gotoPartitioningTab(CHILD_FULL_NAME);
      await pageObjects.streams.selectChildStreamType('Query');
      await pageObjects.streams.openCreateChildQueryStreamForm();
      await pageObjects.streams.fillChildQueryStreamForm(
        GRANDCHILD_STREAM_NAME,
        `FROM $.${CHILD_FULL_NAME} | LIMIT 100`
      );
      await pageObjects.streams.saveChildQueryStream();

      await pageObjects.streams.gotoStreamMainPage();
      await pageObjects.streams.deleteQueryStreamFromOverviewTab(CHILD_FULL_NAME);

      await pageObjects.streams.gotoStreamMainPage();
      await expect(page.getByTestId(`streamsNameLink-${PARENT_STREAM_NAME}`)).toBeVisible();
      await expect(page.getByTestId(`streamsNameLink-${CHILD_FULL_NAME}`)).toBeHidden();
      await expect(page.getByTestId(`streamsNameLink-${GRANDCHILD_FULL_NAME}`)).toBeHidden();
    });
  }
);
