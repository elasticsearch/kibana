/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { spaceTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import {
  DASHBOARD_DEFAULT_INDEX_TITLE,
  DASHBOARD_SAVED_SEARCH_ARCHIVE,
  FEW_PANELS_DASHBOARD_TITLE,
} from '../constants';
import { findImportedSavedObjectId } from '../../utils/migration_smoke_helpers';

let fewPanelsDashboardId = '';

spaceTest.describe('Panel expand toggle', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
    const imported = await scoutSpace.savedObjects.load(DASHBOARD_SAVED_SEARCH_ARCHIVE);
    fewPanelsDashboardId = findImportedSavedObjectId(
      imported,
      'dashboard',
      FEW_PANELS_DASHBOARD_TITLE
    );
    await scoutSpace.uiSettings.setDefaultIndex(DASHBOARD_DEFAULT_INDEX_TITLE);
  });

  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('expands and restores panels', async ({ pageObjects }) => {
    await pageObjects.dashboard.openDashboardWithId(fewPanelsDashboardId);

    const initialPanelCount = await pageObjects.dashboard.getPanelCount();
    expect(initialPanelCount).toBeGreaterThan(1);

    await spaceTest.step('expanding a panel hides the others', async () => {
      await pageObjects.dashboard.togglePanelExpand();
      await expect.poll(() => pageObjects.dashboard.getPanelCount()).toBe(1);
    });

    await spaceTest.step('toggling the expand again restores all panels', async () => {
      await pageObjects.dashboard.togglePanelExpand();
      await expect.poll(() => pageObjects.dashboard.getPanelCount()).toBe(initialPanelCount);
    });
  });
});
