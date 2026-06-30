/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../fixtures';

test.describe('Onboarding UI Validation', () => {
  test.beforeEach(async ({ pageObjects, browserAuth }) => {
    await browserAuth.loginAsAdmin();
    await pageObjects.onboarding.goto();
    await pageObjects.onboarding.waitForMainTilesToLoad();
    await pageObjects.onboarding.useCaseGrid.waitFor({ state: 'visible' });
    await pageObjects.onboarding.hostUseCaseTile.waitFor({ state: 'visible' });
  });

  test(
    'validates main page structure and navigation',
    {
      tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
    },
    async ({ page, pageObjects }) => {
      await test.step('shows core use case tiles', async () => {
        await expect(pageObjects.onboarding.hostUseCaseTile).toBeVisible();
        await expect(pageObjects.onboarding.kubernetesUseCaseTile).toBeVisible();
        await expect(pageObjects.onboarding.cloudUseCaseTile).toBeVisible();
        await expect(pageObjects.onboarding.applicationUseCaseTile).toBeVisible();
      });

      await test.step('maintains consistent tile layout structure', async () => {
        const gridContainer = pageObjects.onboarding.useCaseGrid;
        await expect(gridContainer).toBeVisible();

        await expect(pageObjects.onboarding.hostUseCaseTile.locator('label')).toBeVisible();
        await expect(pageObjects.onboarding.kubernetesUseCaseTile.locator('label')).toBeVisible();
        await expect(pageObjects.onboarding.cloudUseCaseTile.locator('label')).toBeVisible();
        await expect(pageObjects.onboarding.applicationUseCaseTile.locator('label')).toBeVisible();
      });

      await test.step('maintains proper URL state when switching between use cases', async () => {
        await pageObjects.onboarding.selectHostUseCase();
        expect(page.url()).toContain('category=host');

        await pageObjects.onboarding.selectCloudUseCase();
        expect(page.url()).toContain('category=cloud');

        await pageObjects.onboarding.selectApplicationUseCase();
        expect(page.url()).toContain('category=application');

        await pageObjects.onboarding.selectKubernetesUseCase();
        expect(page.url()).toMatch(/\/kubernetes(\?|$|#)/);
      });

      await test.step('shows correct quickstart flows for each use case', async () => {
        await pageObjects.onboarding.goto();
        await pageObjects.onboarding.selectHostUseCase();
        await expect(pageObjects.onboarding.autoDetectLogsCard).toBeVisible();
        await expect(pageObjects.onboarding.otelLogsCard).toBeVisible();

        await pageObjects.onboarding.selectCloudUseCase();
        await expect(pageObjects.onboarding.awsLogsVirtualCard).toBeVisible();
        await expect.soft(pageObjects.onboarding.azureLogsVirtualCard).toBeVisible();
        await expect.soft(pageObjects.onboarding.gcpLogsVirtualCard).toBeVisible();

        await pageObjects.onboarding.selectApplicationUseCase();
        await expect(pageObjects.onboarding.apmVirtualCard).toBeVisible();
        await expect(pageObjects.onboarding.otelVirtualCard).toBeVisible();
        await expect(pageObjects.onboarding.syntheticsVirtualCard).toBeVisible();
      });

      await test.step('supports deep-linking to onboarding use cases', async () => {
        await pageObjects.onboarding.openWithCategory('host');
        await pageObjects.onboarding.openWithCategory('kubernetes');
        await pageObjects.onboarding.openWithCategory('cloud');
        await pageObjects.onboarding.openWithCategory('application');
      });
    }
  );

  test(
    'navigates correctly within Host Auto-Detect flow',
    {
      tag: [
        ...tags.stateful.classic,
        ...tags.serverless.observability.complete,
        ...tags.serverless.observability.logs_essentials,
      ],
    },
    async ({ page, pageObjects }) => {
      await pageObjects.onboarding.selectHostUseCase();
      await pageObjects.onboarding.clickIntegrationCard('integration-card:auto-detect-logs');
      expect(page.url()).toContain('/auto-detect');
    }
  );

  test(
    'navigates correctly within Host OTel flow',
    {
      tag: [
        ...tags.stateful.classic,
        ...tags.serverless.observability.complete,
        ...tags.serverless.observability.logs_essentials,
      ],
    },
    async ({ page, pageObjects }) => {
      await test.step('navigates correctly when OTel logs card is clicked', async () => {
        await pageObjects.onboarding.selectHostUseCase();
        await pageObjects.onboarding.clickIntegrationCard('integration-card:otel-logs');
        expect(page.url()).toContain('/otel-logs');
      });
    }
  );

  test(
    'navigates correctly within Kubernetes OpenTelemetry flow using the keyboard only',
    {
      tag: [
        ...tags.stateful.classic,
        ...tags.serverless.observability.complete,
        ...tags.serverless.observability.logs_essentials,
      ],
    },
    async ({ page, pageObjects }) => {
      await test.step('arrow-key selection reveals the Kubernetes card without navigating', async () => {
        // tab to the first use case card (radio group)
        await page.keyTo('[data-test-subj="observabilityOnboardingUseCaseCard-host"] input', 'Tab');

        await page.keyboard.press('ArrowRight');
        await expect(pageObjects.onboarding.otelKubernetesCard).toBeVisible();
        await expect(page).not.toHaveURL(/\/kubernetes(\?|$|#)/);

        await page.keyboard.press('ArrowRight');
        await expect(page).not.toHaveURL(/\/kubernetes(\?|$|#)/);
        await expect(page).toHaveURL(/category=(application|cloud)/);
      });

      await test.step('activating the Kubernetes card by keyboard opens the OTel flow', async () => {
        await pageObjects.onboarding.goto();
        await page.keyTo('[data-test-subj="observabilityOnboardingUseCaseCard-host"] input', 'Tab');

        await page.keyboard.press('ArrowRight');
        await expect(pageObjects.onboarding.otelKubernetesCard).toBeVisible();
        await page.keyTo('[data-test-subj="integration-card:otel-kubernetes"] button', 'Tab');
        await page.keyboard.press('Enter');

        await expect(page).toHaveURL(/\/kubernetes(\?|$|#)/);
      });

      await test.step('supports deep-linking to kubernetes category', async () => {
        await pageObjects.onboarding.openWithCategory('kubernetes');
      });
    }
  );

  test(
    'validates logs-essentials tier restrictions',
    { tag: tags.serverless.observability.logs_essentials },
    async ({ pageObjects }) => {
      await test.step('hides Application tile in logs-essentials tier', async () => {
        await expect(pageObjects.onboarding.applicationUseCaseTile).toBeHidden();
      });
    }
  );
});
