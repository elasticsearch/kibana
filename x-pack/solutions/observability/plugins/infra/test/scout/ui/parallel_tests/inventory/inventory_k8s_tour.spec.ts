/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../../fixtures';
import { DATE_WITH_HOSTS_DATA } from '../../fixtures/constants';

test.describe(
  'Infrastructure Inventory - K8s Tour',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeEach(async ({ browserAuth, pageObjects: { inventoryPage }, kbnClient }) => {
      await browserAuth.loginAsViewer();
      await kbnClient.uiSettings.updateGlobal({ hideAnnouncements: false });
      await inventoryPage.goToPage();
      await inventoryPage.goToTime(DATE_WITH_HOSTS_DATA);
    });

    test.afterEach(async ({ kbnClient }) => {
      // `beforeEach` writes `hideAnnouncements` via `updateGlobal` (global settings).
      // `unset` only deletes the per-space value, so restore the default globally instead.
      await kbnClient.uiSettings.updateGlobal({ hideAnnouncements: false });
    });

    test('Render and dismiss k8s tour', async ({ pageObjects: { inventoryPage } }) => {
      await test.step('display k8s tour with proper message', async () => {
        await expect(inventoryPage.k8sTourText).toBeVisible();
        await expect(inventoryPage.k8sTourText).toHaveText(
          'Click here to see your infrastructure in different ways, including Kubernetes pods.'
        );
      });

      await test.step('dismiss k8s tour', async () => {
        await inventoryPage.dismissK8sTour();
        await expect(inventoryPage.k8sTourText).toBeHidden();
      });

      await test.step('reload page and verify tour remains dismissed', async () => {
        await inventoryPage.reload();
        await expect(inventoryPage.k8sTourText).toBeHidden();
      });
    });
  }
);
