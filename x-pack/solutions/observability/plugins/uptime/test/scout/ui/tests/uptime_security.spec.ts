/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

test.describe('Uptime feature controls - security', { tag: tags.stateful.classic }, () => {
  test('user with all uptime privileges can access and sees no read-only badge', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginWithCustomRole({
      elasticsearch: {
        cluster: [],
        indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
      },
      kibana: [
        {
          base: [],
          feature: { uptime: ['all'] },
          spaces: ['*'],
        },
      ],
    });

    await page.gotoApp('uptime');

    await test.step('shows Uptime navlink', async () => {
      await expect(page.locator('.euiSideNavItemButton__label[title="Uptime"]')).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('can navigate to Uptime app', async () => {
      await page.testSubj.waitForSelector('uptimeApp', { timeout: 10_000 });
    });

    await test.step('no read-only badge', async () => {
      await expect(page.testSubj.locator('headerBadge')).toBeHidden({ timeout: 5_000 });
    });
  });

  test('user with read-only uptime privileges sees read-only badge', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginWithCustomRole({
      elasticsearch: {
        cluster: [],
        indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
      },
      kibana: [
        {
          base: [],
          feature: { uptime: ['read'] },
          spaces: ['*'],
        },
      ],
    });

    await page.gotoApp('uptime');
    await page.testSubj.waitForSelector('uptimeApp', { timeout: 10_000 });

    await test.step('shows Uptime navlink', async () => {
      await expect(page.locator('.euiSideNavItemButton__label[title="Uptime"]')).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('shows read-only badge', async () => {
      await page.testSubj.waitForSelector('headerBadge', { timeout: 10_000 });
      const badgeLabel = await page.testSubj
        .locator('headerBadge')
        .getAttribute('data-test-badge-label');
      expect(badgeLabel?.toUpperCase()).toBe('READ ONLY');
    });
  });

  test('user without uptime privileges cannot access uptime', async ({ browserAuth, page }) => {
    await browserAuth.loginWithCustomRole({
      elasticsearch: {
        cluster: [],
        indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
      },
      kibana: [
        {
          base: [],
          feature: { dashboard: ['all'] },
          spaces: ['*'],
        },
      ],
    });

    await page.gotoApp('uptime');

    await test.step('does not show Uptime navlink', async () => {
      await expect(page.locator('.euiSideNavItemButton__label[title="Uptime"]')).toBeHidden({
        timeout: 10_000,
      });
    });

    await test.step('renders no permission page', async () => {
      await expect(async () => {
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toContain('You do not have permission to access the requested page');
      }).toPass({ timeout: 10_000 });
    });
  });
});
