/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

test.describe('Onboarding connect step', { tag: tags.stateful.classic }, () => {
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

  test('static keys path — form enables Next when credentials are filled', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsAdmin();
    await page.gotoApp('onboarding/aws#deploy-settings');
    await expect(page.testSubj.locator('onboardingStep-deploy-settings')).toBeVisible();

    await page.testSubj.locator('awsAuthTypeSelector').selectOption('static_keys');

    await expect(page.testSubj.locator('awsStaticKeysForm')).toBeVisible();
    await expect(page.testSubj.locator('awsConnectSetup-nextButton')).toBeDisabled();

    await page.testSubj.locator('awsStaticKeysForm-accessKeyId').fill('AKIAIOSFODNN7EXAMPLE');
    await page.testSubj
      .locator('awsStaticKeysForm-secretAccessKey')
      .fill('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');

    await expect(page.testSubj.locator('awsConnectSetup-nextButton')).toBeEnabled();
  });

  test('identity federation create — New Identity tab active when no connectors exist', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsAdmin();
    await page.gotoApp('onboarding/aws#deploy-settings');

    // Clear all selections so selectedServiceIds is empty → showIdentityFederation = true
    await page.evaluate(() => {
      sessionStorage.setItem(
        'onboarding.aws.servicesStep',
        JSON.stringify({ selectedServiceIds: [] })
      );
    });
    await page.reload();
    await expect(page.testSubj.locator('onboardingStep-deploy-settings')).toBeVisible();

    // Identity federation is shown when no services are selected; with no connectors the New Identity tab is shown
    await expect(page.testSubj.locator('awsIdentityFederationSetup-roleArn')).toBeVisible();
    await expect(
      page.testSubj.locator('awsIdentityFederationSetup-launchCloudFormation')
    ).toBeVisible();
    await expect(page.testSubj.locator('awsIdentityFederationSetup-createButton')).toBeDisabled();

    await page.testSubj
      .locator('awsIdentityFederationSetup-connectorName')
      .fill('my-test-identity');
    await page.testSubj
      .locator('awsIdentityFederationSetup-roleArn')
      .fill('arn:aws:iam::123456789012:role/TestRole');
    await page.testSubj
      .locator('awsIdentityFederationSetup-externalId')
      .fill('test-external-id-123');

    await expect(page.testSubj.locator('awsIdentityFederationSetup-createButton')).toBeEnabled();
  });

  test('identity federation reuse — shows connector selector on Existing Identity tab', async ({
    browserAuth,
    page,
    kbnClient,
  }) => {
    let connectorId: string | undefined;
    try {
      const response = (await kbnClient.request({
        method: 'POST',
        path: '/api/fleet/cloud_connectors',
        body: {
          name: 'scout-reuse-test',
          cloudProvider: 'aws',
          accountType: 'single-account',
          vars: {
            role_arn: { type: 'text', value: 'arn:aws:iam::123456789012:role/ScoutTest' },
            external_id: { type: 'password', value: 'scout-ext-id' },
          },
        },
      })) as any;
      connectorId = response.data.item.id;

      await browserAuth.loginAsAdmin();
      await page.gotoApp('onboarding/aws#deploy-settings');

      // Clear all selections so selectedServiceIds is empty → showIdentityFederation = true
      await page.evaluate(() => {
        sessionStorage.setItem(
          'onboarding.aws.servicesStep',
          JSON.stringify({ selectedServiceIds: [] })
        );
      });
      await page.reload();
      await expect(page.testSubj.locator('onboardingStep-deploy-settings')).toBeVisible();

      // When at least one connector exists, the Existing Identity tab is pre-selected
      await expect(page.testSubj.locator('aws-cloud-connector-super-select')).toBeVisible();

      // Next button stays disabled until a connector is chosen from the selector
      await expect(page.testSubj.locator('awsConnectSetup-nextButton')).toBeDisabled();
    } finally {
      if (connectorId) {
        await kbnClient.request({
          method: 'DELETE',
          path: `/api/fleet/cloud_connectors/${connectorId}`,
          ignoreErrors: [404],
        });
      }
    }
  });
});
