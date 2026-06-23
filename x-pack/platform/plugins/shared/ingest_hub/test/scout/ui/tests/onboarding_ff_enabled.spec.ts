/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

test.describe('Onboarding app — FF enabled', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ apiServices, config }) => {
    // The /internal/core/_settings route is only registered when
    // coreApp.allowDynamicConfigOverrides=true (Scout's local stateful base config).
    // ECH deployments don't carry that override, so the PUT 404s. Skip on Cloud.
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(
      config.isCloud === true,
      `Core API returns 404 for 'ingestHub.onboardingEnabled' on ECH`
    );
    // skip() in beforeAll only skips the tests, not the hook body itself.
    if (config.isCloud) {
      return;
    }

    await apiServices.core.settings({
      'feature_flags.overrides': {
        'ingestHub.onboardingEnabled': 'true',
      },
    });
  });

  test.afterAll(async ({ apiServices, config }) => {
    if (config.isCloud) {
      return;
    }
    await apiServices.core.settings({
      'feature_flags.overrides': {
        'ingestHub.onboardingEnabled': 'false',
      },
    });
  });

  test('renders the onboarding shell and navigates between steps', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsAdmin();

    await test.step('redirects to first step hash when no hash is present', async () => {
      await page.gotoApp('onboarding/aws');
      await expect(page).toHaveURL(/#services/);
    });

    await test.step('renders the onboarding step shell', async () => {
      await expect(page.testSubj.locator('onboardingShell')).toBeVisible();
    });

    await test.step('shows the services step as current', async () => {
      await expect(page.testSubj.locator('onboardingStep-services')).toBeVisible();
    });

    await test.step('renders 4 step indicators', async () => {
      const steps = page.locator('[data-test-subj^="onboardingStepIndicator-"]');
      await expect(steps).toHaveCount(4);
    });

    await test.step('navigates directly to a step via hash', async () => {
      await page.gotoApp('onboarding/aws#services');
      await expect(page.testSubj.locator('onboardingStep-services')).toBeVisible();
    });
  });
});
