/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Tests for unmapped fields visibility in the Discover sidebar.
 */

import { spaceTest } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

const DATA_VIEW_NAME = 'test-index-unmapped-fields';
const TIME_RANGE = {
  from: '2021-01-20T00:00:00.000Z',
  to: '2021-01-25T00:00:00.000Z',
};

spaceTest.describe('Data view with unmapped fields', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    // Load Kibana saved objects (data view + saved search)
    await scoutSpace.savedObjects.load(
      'src/platform/test/functional/fixtures/kbn_archiver/unmapped_fields'
    );
    await scoutSpace.uiSettings.setDefaultIndex(DATA_VIEW_NAME);
    await scoutSpace.uiSettings.setDefaultTime(TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    // Viewer role has sufficient privileges to read the test indices
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.selectDataView(DATA_VIEW_NAME);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('unmapped fields exist on a new saved search', async ({ pageObjects }) => {
    // Wait for search to complete
    await pageObjects.discover.waitUntilSearchingHasFinished();

    // Verify hit count
    await expect.poll(() => pageObjects.discover.getHitCountInt(), { timeout: 10000 }).toBe(4);

    // Check initial field visibility
    let allFields = await pageObjects.unifiedFieldList.getAllFieldNames();
    // message is a mapped field
    expect(allFields).toContain('message');
    // sender is not a mapped field, should not be visible initially
    expect(allFields).not.toContain('sender');

    // Expand the unmapped section
    await pageObjects.unifiedFieldList.toggleSidebarSection('unmapped');

    // Now unmapped fields should be visible
    allFields = await pageObjects.unifiedFieldList.getAllFieldNames();
    expect(allFields).toContain('sender');

    // Collapse the unmapped section
    await pageObjects.unifiedFieldList.toggleSidebarSection('unmapped');
  });

  spaceTest('unmapped fields exist on an existing saved search', async ({ pageObjects }) => {
    // Load existing saved search
    await pageObjects.discover.loadSavedSearch('Existing Saved Search');

    // Wait for search to complete
    await pageObjects.discover.waitUntilSearchingHasFinished();

    // Verify hit count
    await expect.poll(() => pageObjects.discover.getHitCountInt(), { timeout: 10000 }).toBe(4);

    // Check initial field visibility
    let allFields = await pageObjects.unifiedFieldList.getAllFieldNames();
    expect(allFields).toContain('message');
    expect(allFields).not.toContain('sender');
    expect(allFields).not.toContain('receiver');

    // Expand the unmapped section
    await pageObjects.unifiedFieldList.toggleSidebarSection('unmapped');

    // Now unmapped fields should be visible
    allFields = await pageObjects.unifiedFieldList.getAllFieldNames();
    expect(allFields).toContain('sender');
    expect(allFields).toContain('receiver');

    // Collapse the unmapped section
    await pageObjects.unifiedFieldList.toggleSidebarSection('unmapped');
  });
});
