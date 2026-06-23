/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test } from '../fixtures';

// The IAM permissions viewer renders inside the connect step's static-keys path
// (it is injected as `staticKeysContent`) and only when the selected services
// have provider permissions. ec2_metrics (AWS EC2) and guardduty (AWS GuardDuty)
// are both agentless and carry provider permissions:
//   - ec2_metrics  -> includes "ec2:DescribeInstances"
//   - guardduty    -> includes "guardduty:GetDetector"
// These distinct actions let us assert both the aggregated and per-integration views.
const VIEWER = 'awsPermissionsViewer';

// Sets services in session storage then navigates fresh to the deploy-settings step
// so the component mounts with the correct selectedServiceIds from the start.
const navigateWithPermissionBearingServices = async (page: ScoutPage) => {
  // Must be on the app origin before setting session storage
  await page.evaluate(() => {
    sessionStorage.setItem(
      'onboarding.aws.servicesStep',
      JSON.stringify({ selectedServiceIds: ['ec2_metrics', 'guardduty'] })
    );
  });
  await page.gotoApp('onboarding/aws#deploy-settings');
};

test.describe(
  'Onboarding connect step IAM permissions viewer',
  { tag: tags.stateful.classic },
  () => {
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

    test('shows the aggregated IAM policy for the selected services', async ({
      browserAuth,
      page,
    }) => {
      await browserAuth.loginAsAdmin();
      await page.gotoApp('onboarding/aws#deploy-settings');
      await navigateWithPermissionBearingServices(page);
      await expect(page.testSubj.locator('onboardingStep-deploy-settings')).toBeVisible();

      await test.step('viewer is rendered above the static keys form', async () => {
        await page.testSubj.locator('awsAuthTypeSelector').selectOption('static_keys');

        await expect(page.testSubj.locator(VIEWER)).toBeVisible();
        await expect(page.testSubj.locator(`${VIEWER}-titleIcon`)).toBeVisible();
        await expect(page.getByText('Required IAM permissions')).toBeVisible();
        await expect(page.testSubj.locator('awsStaticKeysForm')).toBeVisible();
      });

      await test.step('aggregated policy defaults to all integrations and lists every action', async () => {
        await expect(page.testSubj.locator(`${VIEWER}-serviceSelector`)).toHaveValue('__all__');

        const actionsList = page.testSubj.locator(`${VIEWER}-actionsList`);
        await expect(actionsList).toContainText('"Version": "2012-10-17"');
        await expect(actionsList).toContainText('"Sid": "ElasticAWSIntegration"');
        await expect(actionsList).toContainText('ec2:DescribeInstances');
        await expect(actionsList).toContainText('guardduty:GetDetector');
      });
    });

    test('narrows the policy when a single integration is selected', async ({
      browserAuth,
      page,
    }) => {
      await browserAuth.loginAsAdmin();
      await page.gotoApp('onboarding/aws#deploy-settings');
      await navigateWithPermissionBearingServices(page);
      await expect(page.testSubj.locator('onboardingStep-deploy-settings')).toBeVisible();

      await page.testSubj.locator('awsAuthTypeSelector').selectOption('static_keys');
      await expect(page.testSubj.locator(VIEWER)).toBeVisible();

      await page.testSubj.locator(`${VIEWER}-serviceSelector`).selectOption('ec2_metrics');

      const actionsList = page.testSubj.locator(`${VIEWER}-actionsList`);
      await expect(actionsList).toContainText('"Sid": "ElasticAWSEC2"');
      await expect(actionsList).toContainText('ec2:DescribeInstances');
      await expect(actionsList).not.toContainText('guardduty:GetDetector');
    });
  }
);
