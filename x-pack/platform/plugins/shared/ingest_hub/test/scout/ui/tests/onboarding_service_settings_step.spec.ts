/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

// cloudtrail: dual-transport (S3 + CloudWatch), inline required fields differ per transport
// ec2_metrics: agentless metrics — no inline required fields, Continue enabled once global region is set

test.describe('Onboarding Service Settings step', { tag: tags.stateful.classic }, () => {
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

  test('Continue button is always enabled; clicking without global region shows validation error', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsAdmin();
    await page.gotoApp('onboarding/aws#service-settings');
    await page.evaluate(() => {
      sessionStorage.setItem(
        'onboarding.aws.serviceSettingsStep',
        JSON.stringify({ globalRegion: '', serviceVars: {} })
      );
    });
    await page.reload();
    await expect(page.testSubj.locator('onboardingStep-serviceSettings')).toBeVisible();

    // Button is always enabled — validation is shown after clicking, not before
    await expect(page.testSubj.locator('serviceSettingsStep-continueButton')).toBeEnabled();

    // Clicking without a global region keeps the user on the step and shows an error
    await page.testSubj.locator('serviceSettingsStep-continueButton').click();
    await expect(page.testSubj.locator('onboardingStep-serviceSettings')).toBeVisible();
    await expect(page.testSubj.locator('serviceSettingsStep-globalRegionError')).toBeVisible();
  });

  test('Continue button is always enabled when global region is set and no inline fields are required', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsAdmin();
    await page.gotoApp('onboarding/aws#service-settings');

    // Use ec2_metrics: only aws/metrics input — no inline required fields
    await page.evaluate(() => {
      sessionStorage.setItem(
        'onboarding.aws.servicesStep',
        JSON.stringify({ selectedServiceIds: ['ec2_metrics'] })
      );
      sessionStorage.setItem(
        'onboarding.aws.serviceSettingsStep',
        JSON.stringify({ globalRegion: 'us-east-1', serviceVars: {} })
      );
    });
    await page.reload();
    await expect(page.testSubj.locator('onboardingStep-serviceSettings')).toBeVisible();
    await expect(page.testSubj.locator('serviceSettingsStep-continueButton')).toBeEnabled();
  });

  test('clicking Continue with an empty inline required field shows validation error', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsAdmin();
    await page.gotoApp('onboarding/aws#service-settings');

    // cloudtrail with S3 trigger: bucket_arn is inline required and empty
    await page.evaluate(() => {
      sessionStorage.setItem(
        'onboarding.aws.servicesStep',
        JSON.stringify({ selectedServiceIds: ['cloudtrail'] })
      );
      sessionStorage.setItem(
        'onboarding.aws.serviceSettingsStep',
        JSON.stringify({
          globalRegion: 'us-east-1',
          serviceVars: { cloudtrail: { trigger: 'aws-s3', vars: {} } },
        })
      );
    });
    await page.reload();
    await expect(page.testSubj.locator('onboardingStep-serviceSettings')).toBeVisible();

    // Click Continue — error appears, step stays visible
    await page.testSubj.locator('serviceSettingsStep-continueButton').click();
    await expect(page.testSubj.locator('onboardingStep-serviceSettings')).toBeVisible();
    await expect(page.testSubj.locator('serviceSettingsStep-cardValidationMessage')).toBeVisible();

    // Filling the bucket_arn clears the error message
    await page.getByPlaceholder('arn:aws:s3:::my-bucket').fill('arn:aws:s3:::my-cloudtrail-bucket');
    await expect(page.testSubj.locator('serviceSettingsStep-cardValidationMessage')).toBeHidden();
  });

  test('transport toggle swaps the inline required field', async ({ browserAuth, page }) => {
    await browserAuth.loginAsAdmin();
    await page.gotoApp('onboarding/aws#service-settings');

    // cloudtrail dual-transport, starting on S3
    await page.evaluate(() => {
      sessionStorage.setItem(
        'onboarding.aws.servicesStep',
        JSON.stringify({ selectedServiceIds: ['cloudtrail'] })
      );
      sessionStorage.setItem(
        'onboarding.aws.serviceSettingsStep',
        JSON.stringify({
          globalRegion: 'us-east-1',
          serviceVars: { cloudtrail: { trigger: 'aws-s3', vars: {} } },
        })
      );
    });
    await page.reload();
    await expect(page.testSubj.locator('onboardingStep-serviceSettings')).toBeVisible();

    // S3 active → bucket_arn field visible, log_group_arn absent
    await expect(page.getByPlaceholder('arn:aws:s3:::my-bucket')).toBeVisible();
    await expect(
      page.getByPlaceholder('arn:aws:logs:us-east-1:123456789012:log-group:my-log-group')
    ).toBeHidden();

    // Switch to CloudWatch
    await page.getByRole('button', { name: 'CloudWatch' }).click();

    // CloudWatch active → log_group_arn visible, bucket_arn absent
    await expect(
      page.getByPlaceholder('arn:aws:logs:us-east-1:123456789012:log-group:my-log-group')
    ).toBeVisible();
    await expect(page.getByPlaceholder('arn:aws:s3:::my-bucket')).toBeHidden();
  });

  test('Collection settings flyout opens and shows region override', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsAdmin();
    await page.gotoApp('onboarding/aws#service-settings');

    await page.evaluate(() => {
      sessionStorage.setItem(
        'onboarding.aws.servicesStep',
        JSON.stringify({ selectedServiceIds: ['ec2_metrics'] })
      );
      sessionStorage.setItem(
        'onboarding.aws.serviceSettingsStep',
        JSON.stringify({ globalRegion: 'us-east-1', serviceVars: {} })
      );
    });
    await page.reload();
    await expect(page.testSubj.locator('onboardingStep-serviceSettings')).toBeVisible();

    // Open Collection settings flyout
    await page.getByRole('button', { name: 'Collection settings' }).click();
    await expect(page.getByText('Collection settings — AWS EC2')).toBeVisible();

    // Region override is shown and pre-populated with the global region
    await expect(page.getByText('AWS Region (override)')).toBeVisible();
    // singleSelection asPlainText renders the selected value into the combobox input
    await expect(page.locator('.euiFlyout').getByLabel('AWS Region (override)')).toHaveValue(
      'us-east-1'
    );

    // Close via Close button
    await page.testSubj.locator('collectionSettingsFlyout-closeButton').click();
    await expect(page.getByText('Collection settings — AWS EC2')).toBeHidden();
  });
});
