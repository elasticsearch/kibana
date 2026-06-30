/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test, CUSTOM_ROLES } from '../fixtures';

const DATA_STREAM_NAME = 'test_data_stream';
const INDEX_TEMPLATE_NAME = 'generic-logs-scout';

// Failing: See https://github.com/elastic/kibana/issues/272031
test.describe.skip('Create Data View wizard', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ esClient }) => {
    await esClient.indices.putIndexTemplate({
      name: INDEX_TEMPLATE_NAME,
      index_patterns: ['logs-*', DATA_STREAM_NAME],
      template: {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
          },
        },
      },
      data_stream: {},
    });

    await esClient.indices.createDataStream({ name: DATA_STREAM_NAME });
  });

  test.afterAll(async ({ esClient, kbnClient }) => {
    await kbnClient.savedObjects.clean({ types: ['index-pattern'] });
    await esClient.indices.deleteDataStream({ name: DATA_STREAM_NAME });
    await esClient.indices.deleteIndexTemplate({ name: INDEX_TEMPLATE_NAME });
  });

  test('data stream is accepted as an index pattern source and wizard auto-detects the timestamp field', async ({
    browserAuth,
    page,
    pageObjects,
  }) => {
    await browserAuth.loginWithCustomRole(CUSTOM_ROLES.index_pattern_management_all);

    await test.step('open the Create Data View wizard', async () => {
      await pageObjects.dataViewsManagement.goto();
      await pageObjects.dataViewsManagement.openCreateWizard();
    });

    await test.step('wizard auto-detects the timestamp field from the data stream mapping', async () => {
      await pageObjects.dataViewEditor.setTitle(DATA_STREAM_NAME);
      const timestampValue = await pageObjects.dataViewEditor.getTimestampFieldValue();
      expect(timestampValue).toBe('@timestamp');
    });

    await test.step('saving navigates to the data view detail page', async () => {
      await pageObjects.dataViewEditor.save();
      await expect(page).toHaveURL(pageObjects.dataViewEditor.detailUrlPattern);
      await expect(pageObjects.dataViewEditor.detailPageTitle).toHaveText(DATA_STREAM_NAME);
    });
  });
});
