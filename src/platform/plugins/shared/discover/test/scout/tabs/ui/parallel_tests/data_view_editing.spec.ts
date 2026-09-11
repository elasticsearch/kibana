/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, type DiscoverPageObjects } from '../fixtures';

const RUNTIME_FIELD_SCRIPT = 'emit("runtime field value")';

type FieldState = 'visible' | 'hidden';

const dataViewCases = [
  {
    isAdHocDataView: true,
    type: 'ad hoc',
    sameDataViewCount: 2,
    secondDataViewName: 'logs',
    newFieldStateInOriginalTab: 'hidden',
    editedFieldStateInOriginalTab: 'hidden',
  },
  {
    isAdHocDataView: false,
    type: 'persisted',
    sameDataViewCount: 1,
    secondDataViewName: 'log',
    newFieldStateInOriginalTab: 'visible',
    editedFieldStateInOriginalTab: 'visible',
  },
] as const;

const prepareDataView = async ({
  isAdHocDataView,
  pageObjects,
  name,
}: {
  isAdHocDataView: boolean;
  pageObjects: DiscoverPageObjects;
  name: string;
}) => {
  if (!isAdHocDataView) {
    return;
  }

  await pageObjects.discover.createDataViewFromSearchBar({ name, adHoc: true });
  await pageObjects.discover.waitUntilTabIsLoaded();
};

const expectFieldState = async ({
  pageObjects,
  fieldName,
  state,
}: {
  pageObjects: DiscoverPageObjects;
  fieldName: string;
  state: FieldState;
}) => {
  const { unifiedFieldList } = pageObjects;

  await unifiedFieldList.searchField(fieldName);
  const field = unifiedFieldList.getAvailableField(fieldName);

  if (state === 'visible') {
    await expect(field).toBeVisible();
  } else {
    await expect(field).toBeHidden();
  }
};

spaceTest.describe('Discover tabs - data view editing', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeEach(async ({ browserAuth, discoverScoutSpace, pageObjects }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterEach(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  for (const {
    isAdHocDataView,
    type,
    sameDataViewCount,
    secondDataViewName,
    newFieldStateInOriginalTab,
    editedFieldStateInOriginalTab,
  } of dataViewCases) {
    spaceTest(`can edit ${type} data view name`, async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;
      const editedName = 'logstash edited name';

      await prepareDataView({
        isAdHocDataView,
        pageObjects,
        name: 'logstash',
      });

      const previousName = await discover.getSelectedDataViewName();

      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getSelectedDataViewName()).toBe(previousName);

      await discover.editCurrentDataViewName(editedName);
      expect(await discover.getSelectedDataViewName()).toBe(editedName);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getSelectedDataViewName()).toBe(editedName);

      const availableDataViews = await discover.getAvailableDataViewsFromSearchBar();
      expect(availableDataViews).not.toContain(previousName);
      expect(availableDataViews).toContain(editedName);
    });

    spaceTest(
      `can create runtime fields for the same ${type} data view in both tabs`,
      async ({ pageObjects }) => {
        const { discover, unifiedFieldList, unifiedTabs } = pageObjects;

        await prepareDataView({
          isAdHocDataView,
          pageObjects,
          name: 'logst',
        });

        const currentName = await discover.getSelectedDataViewName();
        const newFieldName = '_test_new_field';
        const editedFieldName = '_test_new_field_edited';

        await discover.createNewTabAndSearch();
        expect(await discover.getSelectedDataViewName()).toBe(currentName);

        await discover.createRuntimeField({
          fieldName: newFieldName,
          script: RUNTIME_FIELD_SCRIPT,
        });
        await unifiedFieldList.searchField(newFieldName);
        await expect(unifiedFieldList.getAvailableField(newFieldName)).toBeVisible();

        let availableDataViews = await discover.getAvailableDataViewsFromSearchBar();
        expect(availableDataViews.filter((name) => name === currentName)).toHaveLength(
          sameDataViewCount
        );

        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe(currentName);
        await expectFieldState({
          pageObjects,
          fieldName: newFieldName,
          state: newFieldStateInOriginalTab,
        });

        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe(currentName);
        await unifiedFieldList.searchField(newFieldName);
        await expect(unifiedFieldList.getAvailableField(newFieldName)).toBeVisible();

        await unifiedFieldList.openFieldEditor(newFieldName);
        await discover.renameRuntimeField(editedFieldName);
        await unifiedFieldList.searchField(editedFieldName);
        await expect(unifiedFieldList.getAvailableField(editedFieldName)).toBeVisible();
        await unifiedFieldList.searchField(newFieldName);
        await expect(unifiedFieldList.getAvailableField(newFieldName)).toBeHidden();

        availableDataViews = await discover.getAvailableDataViewsFromSearchBar();
        expect(availableDataViews.filter((name) => name === currentName)).toHaveLength(
          sameDataViewCount
        );

        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe(currentName);
        await expectFieldState({
          pageObjects,
          fieldName: editedFieldName,
          state: editedFieldStateInOriginalTab,
        });
        await expectFieldState({ pageObjects, fieldName: newFieldName, state: 'hidden' });
      }
    );

    spaceTest(
      `can create runtime fields for a different ${type} data view`,
      async ({ pageObjects }) => {
        const { discover, unifiedFieldList, unifiedTabs } = pageObjects;
        const firstTabName = await discover.getSelectedDataViewName();
        const newFieldName = '_test_new_field2';

        await discover.createNewTabAndSearch();
        await discover.createDataViewFromSearchBar({
          name: secondDataViewName,
          adHoc: isAdHocDataView,
        });
        await discover.waitUntilTabIsLoaded();
        const secondTabName = await discover.getSelectedDataViewName();

        await discover.createRuntimeField({
          fieldName: newFieldName,
          script: RUNTIME_FIELD_SCRIPT,
        });
        await unifiedFieldList.searchField(newFieldName);
        await expect(unifiedFieldList.getAvailableField(newFieldName)).toBeVisible();

        const availableDataViews = await discover.getAvailableDataViewsFromSearchBar();
        expect(availableDataViews.filter((name) => name === firstTabName)).toHaveLength(1);
        expect(availableDataViews.filter((name) => name === secondTabName)).toHaveLength(1);

        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe(firstTabName);
        await unifiedFieldList.searchField(newFieldName);
        await expect(unifiedFieldList.getAvailableField(newFieldName)).toBeHidden();

        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe(secondTabName);
        await unifiedFieldList.searchField(newFieldName);
        await expect(unifiedFieldList.getAvailableField(newFieldName)).toBeVisible();
      }
    );
  }
});
