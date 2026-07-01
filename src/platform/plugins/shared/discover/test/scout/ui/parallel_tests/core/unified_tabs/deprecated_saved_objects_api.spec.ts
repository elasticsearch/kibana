/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '../../../fixtures/common';

const LEGACY_DISCOVER_SESSION_TITLE = 'Legacy Discover Session';
const LEGACY_ESQL_QUERY = 'FROM logstash-* | SORT @timestamp DESC | LIMIT 100';

spaceTest.describe(
  'Discover tabs - deprecated saved objects API compatibility',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.setupDiscoverDefaults();
    });

    spaceTest.afterAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.teardownDiscoverDefaults();
    });

    spaceTest(
      'should support Discover sessions without tabs created through the deprecated saved objects API',
      async ({ browserAuth, kbnClient, pageObjects, scoutSpace }) => {
        await kbnClient.request({
          method: 'POST',
          path: `/s/${scoutSpace.id}/api/saved_objects/search`,
          body: {
            typeMigrationVersion: '10.8.0',
            attributes: {
              title: LEGACY_DISCOVER_SESSION_TITLE,
              description: '',
              kibanaSavedObjectMeta: {
                searchSourceJSON: JSON.stringify({ query: { esql: LEGACY_ESQL_QUERY } }),
              },
              sort: [['@timestamp', 'desc']],
              columns: [],
              grid: {},
              hideChart: false,
              viewMode: 'documents',
              isTextBasedQuery: true,
              timeRestore: false,
            },
            initialNamespaces: [scoutSpace.id],
            references: [],
          },
        });

        await browserAuth.loginAsPrivilegedUser();
        await pageObjects.discover.goto({ queryMode: 'classic' });
        await pageObjects.discover.loadSavedSearch(LEGACY_DISCOVER_SESSION_TITLE);
        await pageObjects.discover.waitUntilTabIsLoaded();

        await expect(pageObjects.unifiedTabs.getTabs()).toHaveText(['Untitled']);
        expect(await pageObjects.discover.getEsqlQueryValue()).toBe(LEGACY_ESQL_QUERY);
        expect(await pageObjects.discover.getHitCountInt()).toBe(100);
      }
    );
  }
);
