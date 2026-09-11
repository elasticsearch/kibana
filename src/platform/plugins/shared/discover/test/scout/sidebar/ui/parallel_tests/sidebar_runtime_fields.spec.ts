/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import type { ApiServicesFixture } from '@kbn/scout';
import type { DiscoverSessionApiDataInput } from '../../../../../server/api/schema';
import type { DiscoverPageObjects, DiscoverScoutSpace } from '../fixtures';
import { spaceTest, tags, testData } from '../fixtures';

type RuntimeFieldSettings = Record<
  string,
  {
    type: 'keyword' | 'long' | 'double' | 'date' | 'ip' | 'boolean' | 'geo_point';
    script: string;
  }
>;

/**
 * Runtime field UI actions need an ad-hoc data view: Security editor has Discover but
 * not `indexPatterns`, so "Add a field" is hidden on persisted data views.
 * Seed fields via Discover session `data_view_spec.field_settings` (API) instead of the
 * field-editor UI; keep UI only for relabel / delete / column interactions.
 */
const openAdHocSessionWithRuntimeFields = async ({
  apiServices,
  discoverScoutSpace,
  pageObjects,
  fieldSettings,
}: {
  apiServices: ApiServicesFixture;
  discoverScoutSpace: DiscoverScoutSpace;
  pageObjects: DiscoverPageObjects;
  fieldSettings?: RuntimeFieldSettings;
}): Promise<void> => {
  const sessionId = await apiServices.discover.create(
    {
      title: `sidebar-runtime-fields-${discoverScoutSpace.id}`,
      tabs: [
        {
          id: 'main',
          label: 'Untitled',
          data_source: {
            type: 'data_view_spec',
            index_pattern: testData.DEFAULT_DATA_VIEW,
            time_field: '@timestamp',
            ...(fieldSettings ? { field_settings: fieldSettings } : {}),
          },
        },
      ],
    } satisfies DiscoverSessionApiDataInput,
    discoverScoutSpace.id
  );

  await pageObjects.discover.goto({ queryMode: 'classic', savedSearchId: sessionId });
  await pageObjects.discover.waitUntilTabIsLoaded();
};

spaceTest.describe('Discover sidebar runtime fields', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeEach(async ({ browserAuth, discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterEach(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'supports ad-hoc data views with runtime field relabel and remove',
    async ({ apiServices, discoverScoutSpace, pageObjects }) => {
      const { discover, unifiedFieldList } = pageObjects;
      const fieldName = '_bytes-runtimefield';
      const labeledName = '_bytes-runtimefield2';

      await openAdHocSessionWithRuntimeFields({
        apiServices,
        discoverScoutSpace,
        pageObjects,
        fieldSettings: {
          [fieldName]: {
            type: 'keyword',
            script: 'emit((doc["bytes"].value * 2).toString())',
          },
        },
      });

      await unifiedFieldList.searchField(fieldName);
      await expect(unifiedFieldList.getAvailableField(fieldName)).toBeVisible();

      await unifiedFieldList.openFieldEditor(fieldName);
      await discover.setCustomLabel(labeledName, { enableToggle: true });
      await discover.saveOpenFieldEditor();

      await unifiedFieldList.searchField(labeledName);
      await expect(unifiedFieldList.getAvailableField(fieldName)).toBeVisible();
      expect(await unifiedFieldList.getAllFieldNames()).toContain(labeledName);
      expect(await unifiedFieldList.getAllFieldNames()).not.toContain(fieldName);

      await discover.deleteRuntimeField(fieldName);
      await unifiedFieldList.searchField(fieldName);
      await expect(unifiedFieldList.getAvailableField(fieldName)).toBeHidden();
    }
  );

  spaceTest(
    'keeps the sidebar rendered when document retrieval fails',
    async ({ apiServices, discoverScoutSpace, page, pageObjects }) => {
      const { discover, unifiedFieldList } = pageObjects;
      const invalidField = '_invalid-runtimefield';

      // Curly quotes make this an invalid Painless script (matches FTR).
      await openAdHocSessionWithRuntimeFields({
        apiServices,
        discoverScoutSpace,
        pageObjects,
        fieldSettings: {
          [invalidField]: {
            type: 'keyword',
            script: 'emit(\u2018\u2019);',
          },
        },
      });

      await expect(discover.getErrorCalloutTitle()).toBeVisible();

      await unifiedFieldList.searchField(invalidField);
      await expect(unifiedFieldList.getAvailableField(invalidField)).toBeVisible();

      await page.reload();
      await discover.waitUntilTabIsLoaded();
      await expect(discover.getErrorCalloutTitle()).toBeVisible();
      await unifiedFieldList.searchField(invalidField);
      await expect(unifiedFieldList.getAvailableField(invalidField)).toBeVisible();

      await discover.deleteRuntimeField(invalidField);
      await discover.waitUntilSearchingHasFinished();
    }
  );

  spaceTest(
    'removes the data grid column after a runtime field is deleted',
    async ({ apiServices, discoverScoutSpace, pageObjects }) => {
      const { discover, unifiedFieldList } = pageObjects;
      const newField = '_test_field_and_column_removal';

      await openAdHocSessionWithRuntimeFields({
        apiServices,
        discoverScoutSpace,
        pageObjects,
        fieldSettings: {
          [newField]: {
            type: 'keyword',
            script: 'emit("hi there")',
          },
        },
      });

      await unifiedFieldList.searchField(newField);
      await expect(unifiedFieldList.getAvailableField(newField)).toBeVisible();
      await unifiedFieldList.clearFieldSearch();

      expect(await unifiedFieldList.isFieldSelected(newField)).toBe(false);
      await expect.poll(() => discover.getDocHeader()).toStrictEqual(['@timestamp', 'Summary']);

      await unifiedFieldList.clickFieldListItemAdd(newField);
      await discover.waitUntilSearchingHasFinished();
      expect(await unifiedFieldList.isFieldSelected(newField)).toBe(true);
      await expect.poll(() => discover.getDocHeader()).toStrictEqual(['@timestamp', newField]);

      await discover.deleteRuntimeField(newField);
      await unifiedFieldList.searchField(newField);
      await expect(unifiedFieldList.getAvailableField(newField)).toBeHidden();
      await expect.poll(() => discover.getDocHeader()).toStrictEqual(['@timestamp', 'Summary']);
    }
  );
});
