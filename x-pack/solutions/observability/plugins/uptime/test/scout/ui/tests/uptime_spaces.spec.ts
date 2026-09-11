/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

test.describe('Uptime feature controls - spaces', { tag: tags.stateful.classic }, () => {
  test('shows uptime navlink in space with no disabled features', async ({
    browserAuth,
    page,
    kbnClient,
    kbnUrl,
  }) => {
    await kbnClient.spaces.create({
      id: 'custom_space',
      name: 'custom_space',
      disabledFeatures: [],
    });
    await kbnClient.request({
      method: 'POST',
      path: '/s/custom_space/internal/kibana/settings',
      body: { changes: { 'observability:enableLegacyUptimeApp': true } },
    });

    try {
      await browserAuth.loginAsPrivilegedUser();

      await test.step('can navigate to Uptime app in custom space', async () => {
        await page.goto(kbnUrl.get('/s/custom_space/app/uptime'));
        await expect(page.testSubj.locator('kbnLoadingMessage')).toBeHidden({ timeout: 30_000 });
        await page.testSubj.waitForSelector('uptimeApp', { timeout: 10_000 });
      });
    } finally {
      await kbnClient.spaces.delete('custom_space');
    }
  });

  test('hides uptime and renders not found in space with uptime disabled', async ({
    browserAuth,
    page,
    kbnClient,
    kbnUrl,
  }) => {
    await kbnClient.spaces.create({
      id: 'custom_space',
      name: 'custom_space',
      disabledFeatures: ['uptime'],
    });

    try {
      await browserAuth.loginAsPrivilegedUser();
      await page.goto(kbnUrl.get('/s/custom_space/app/home'));
      await expect(page.testSubj.locator('kbnLoadingMessage')).toBeHidden({ timeout: 30_000 });

      await test.step('uptime navlink is not shown', async () => {
        await page.waitForTimeout(2_000);
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).not.toContain('Uptime');
      });

      await test.step('navigating to uptime renders not found', async () => {
        await page.goto(kbnUrl.get('/s/custom_space/app/uptime'));
        await expect(async () => {
          const bodyText = await page.locator('body').textContent();
          expect(bodyText).toContain('Not Found');
        }).toPass({ timeout: 10_000 });
      });
    } finally {
      await kbnClient.spaces.delete('custom_space');
    }
  });
});
