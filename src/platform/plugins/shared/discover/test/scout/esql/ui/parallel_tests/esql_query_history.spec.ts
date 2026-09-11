/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, tags } from '../fixtures';

// Drops the time field, so re-running it is observable in the grid columns.
const HISTORY_QUERY = 'from logstash-* | limit 100 | drop @timestamp';
const CURRENT_QUERY = 'from logstash-* | limit 5';

spaceTest.describe('Discover ES|QL query history', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'esql' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest('loads and re-runs a query picked from the history', async ({ pageObjects }) => {
    const { discover, dataGrid } = pageObjects;

    // Seed the history, then move the editor onto a different query so restoring
    // the first one is observable.
    await discover.writeAndSubmitEsqlQuery(HISTORY_QUERY);
    await discover.writeAndSubmitEsqlQuery(CURRENT_QUERY);
    expect(await discover.getEsqlQueryValue()).toBe(CURRENT_QUERY);
    await expect(dataGrid.getColumnHeader('@timestamp')).toBeVisible();

    await discover.toggleEsqlHistoryPanel();
    await discover.runEsqlHistoryQuery(HISTORY_QUERY);

    expect(await discover.getEsqlQueryValue()).toBe(HISTORY_QUERY);
    // The dropped column proves the query was re-run, not just loaded into the editor.
    await expect(dataGrid.getColumnHeader('@timestamp')).toBeHidden();
  });
});
