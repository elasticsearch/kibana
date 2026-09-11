/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, type DiscoverTestFixtures } from '../fixtures';

const FIELDS_FOR_WILDCARD_ENDPOINT = '/internal/data_views/_fields_for_wildcard';

const expectUnfilteredAvailableFieldCount = async (
  { unifiedFieldList }: DiscoverTestFixtures['pageObjects'],
  count: number
): Promise<void> => {
  await unifiedFieldList.searchField('');
  await unifiedFieldList.expectAvailableFieldCount(count);
};

spaceTest.describe(
  'Discover tabs - restorable existing field cache',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeEach(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.setupDiscoverDefaults();
    });

    spaceTest.afterEach(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.teardownDiscoverDefaults();
    });

    spaceTest(
      'does not fetch existing fields again when returning to a tab',
      async ({ browserAuth, network, pageObjects }) => {
        const { discover, unifiedFieldList, unifiedTabs } = pageObjects;

        await browserAuth.loginAsViewer();
        await discover.goto({ queryMode: 'classic' });
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.expectAvailableFieldCount(49);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await discover.createNewTabAndSearch();
              await unifiedFieldList.expectAvailableFieldCount(49);
            }
          )
        ).toBe(1);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await unifiedTabs.selectTab(0);
              await discover.waitUntilTabIsLoaded();
              await unifiedFieldList.expectAvailableFieldCount(49);
            }
          )
        ).toBe(0);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await unifiedTabs.selectTab(1);
              await discover.waitUntilTabIsLoaded();
              await unifiedFieldList.expectAvailableFieldCount(49);
            }
          )
        ).toBe(0);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await discover.createNewTabAndSearch();
              await unifiedFieldList.expectAvailableFieldCount(49);
            }
          )
        ).toBe(1);
      }
    );

    spaceTest(
      'refetches existing fields when returning to an edited data view',
      async ({ browserAuth, network, pageObjects }) => {
        const { discover, unifiedFieldList, unifiedTabs } = pageObjects;
        const field = '_test';
        const field2 = '_test2';

        await browserAuth.loginAsPrivilegedUser();
        await discover.goto({ queryMode: 'classic' });
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.expectAvailableFieldCount(49);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await discover.createNewTabAndSearch();
              await unifiedFieldList.expectAvailableFieldCount(49);
            }
          )
        ).toBe(1);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await discover.createRuntimeField({ fieldName: field, script: `emit('test')` });
              await unifiedFieldList.expectAvailableFieldCount(50);
              await unifiedFieldList.searchField(field);
              await expect(unifiedFieldList.getAvailableField(field)).toBeVisible();
            }
          )
        ).toBe(1);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await unifiedTabs.selectTab(0);
              await discover.waitUntilTabIsLoaded();
              await expectUnfilteredAvailableFieldCount(pageObjects, 50);
              await unifiedFieldList.searchField(field);
              await expect(unifiedFieldList.getAvailableField(field)).toBeVisible();
            }
          )
        ).toBe(1);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await unifiedTabs.selectTab(1);
              await discover.waitUntilTabIsLoaded();
              await expectUnfilteredAvailableFieldCount(pageObjects, 50);
              await unifiedFieldList.searchField(field);
              await expect(unifiedFieldList.getAvailableField(field)).toBeVisible();
            }
          )
        ).toBe(0);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await unifiedFieldList.openFieldEditor(field);
              await discover.renameRuntimeField(field2);
              await expectUnfilteredAvailableFieldCount(pageObjects, 50);
              await unifiedFieldList.searchField(field);
              await expect(unifiedFieldList.getAvailableField(field)).toBeHidden();
              await unifiedFieldList.searchField(field2);
              await expect(unifiedFieldList.getAvailableField(field2)).toBeVisible();
            }
          )
        ).toBe(1);

        expect(
          await network.countMatchingRequests(
            { endpoint: FIELDS_FOR_WILDCARD_ENDPOINT },
            async () => {
              await unifiedTabs.selectTab(0);
              await discover.waitUntilTabIsLoaded();
              await expectUnfilteredAvailableFieldCount(pageObjects, 50);
              await unifiedFieldList.searchField(field);
              await expect(unifiedFieldList.getAvailableField(field)).toBeHidden();
              await unifiedFieldList.searchField(field2);
              await expect(unifiedFieldList.getAvailableField(field2)).toBeVisible();
            }
          )
        ).toBe(1);
      }
    );
  }
);
