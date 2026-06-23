/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-search';
import { expect } from '@kbn/scout-search/ui';
import { test } from '../fixtures';

test.describe(
  'Homepage - Viewer',
  { tag: [...tags.serverless.search, ...tags.stateful.classic] },
  () => {
    test.beforeEach(async ({ page, browserAuth, pageObjects }) => {
      await browserAuth.loginAsViewer();
      await page.addInitScript(() => {
        window.sessionStorage.setItem('gettingStartedVisited', 'true');
      });
      await pageObjects.homepage.goto();
    });

    test('should not be able to see manage button', async ({ pageObjects, samlAuth }) => {
      const headerLeftGroup = await pageObjects.homepage.getHeaderLeftGroup();
      const userData = await samlAuth.session.getUserData('viewer');

      await expect(headerLeftGroup).toContainText(`Welcome, ${userData?.full_name}`);
      await expect(headerLeftGroup).not.toContainText('Manage');
    });

    test('Navigation cards should navigate to correct places', async ({ pageObjects, page }) => {
      const navigationCards = await pageObjects.homepage.getNavigationCards();
      await expect(navigationCards).toHaveCount(5);

      const navCardTests = [
        {
          cardTestId: 'searchHomepageNavLinks-discover',
          expectedUrl: 'discover',
        },
        {
          cardTestId: 'searchHomepageNavLinks-dashboards',
          expectedUrl: 'dashboards',
        },
        {
          cardTestId: 'searchHomepageNavLinks-agentBuilder',
          expectedUrl: 'agent_builder',
        },
        {
          cardTestId: 'searchHomepageNavLinks-machineLearning',
          expectedUrl: 'ml/overview',
        },
        {
          cardTestId: 'searchHomepageNavLinks-workflows',
          expectedUrl: 'workflows',
        },
      ];

      for (const { cardTestId, expectedUrl } of navCardTests) {
        await pageObjects.homepage.clickNavigationCard(cardTestId);
        await expect(page).toHaveURL(new RegExp(expectedUrl));
        await pageObjects.homepage.goto();
      }
    });

    test('Get started banner should move user back to getting started', async ({
      pageObjects,
      page,
    }) => {
      await pageObjects.homepage.clickGettingStartedButton();

      await expect(page).toHaveURL(new RegExp('getting_started'));
    });

    test('API keys button should be disabled', async ({ pageObjects }) => {
      const apiKeysButton = await pageObjects.homepage.getApiKeyButton();
      await expect(apiKeysButton).toBeDisabled();
    });

    // === Kibana Version Badge Tests ===
    test('should display kibana version badge', async ({ pageObjects }) => {
      const versionBadge = await pageObjects.homepage.getKibanaVersionBadge();
      await expect(versionBadge).toBeVisible();
    });

    // === Embedded Console Tests ===
    test('should have embedded dev console that can be toggled', async ({ pageObjects }) => {
      await pageObjects.homepage.expectEmbeddedConsoleControlBarExists();

      // Console body should be hidden initially
      const consoleBodyInitial = await pageObjects.homepage.getEmbeddedConsoleBody();
      await expect(consoleBodyInitial).toBeHidden();

      // Click to open console
      await pageObjects.homepage.clickEmbeddedConsoleControlBar();

      // Verify console is open and fullscreen toggle is visible
      const fullscreenToggle = await pageObjects.homepage.getFullscreenToggleButton();
      await expect(fullscreenToggle).toBeVisible();

      const consoleBodyOpen = await pageObjects.homepage.getEmbeddedConsoleBody();
      await expect(consoleBodyOpen).toBeVisible();

      // Click to close console
      await pageObjects.homepage.clickEmbeddedConsoleControlBar();

      const consoleBodyClosed = await pageObjects.homepage.getEmbeddedConsoleBody();
      await expect(consoleBodyClosed).toBeHidden();
    });

    // === Endpoint Copy Functionality Tests ===
    test('should show Elasticsearch endpoint with copy functionality', async ({ pageObjects }) => {
      const endpointValueField = await pageObjects.homepage.getEndpointValueField();
      await expect(endpointValueField).toBeVisible();

      const copyEndpointButton = await pageObjects.homepage.getCopyEndpointButton();
      await expect(copyEndpointButton).toBeVisible();
    });

    test('should show checkmark feedback when copy button is clicked', async ({ pageObjects }) => {
      const copyEndpointButton = await pageObjects.homepage.getCopyEndpointButton();
      await expect(copyEndpointButton).toBeVisible();

      await copyEndpointButton.click();

      // After clicking, the button should show copied state
      const copiedButton = await pageObjects.homepage.getCopyEndpointButtonCopied();
      await expect(copiedButton).toBeVisible();

      // After a short delay, it should revert back to normal state
      const normalButton = await pageObjects.homepage.getCopyEndpointButton();
      await expect(normalButton).toBeVisible();
    });

    // === Body Links Tests ===
    test('should display all body links with external documentation', async ({ pageObjects }) => {
      const bodyLinks = await pageObjects.homepage.getBodyLinks();
      await expect(bodyLinks).toHaveCount(3);

      // Verify specific links exist
      const askExpertLink = await pageObjects.homepage.getBodyLinkByText(
        'Contact customer engineering'
      );
      await expect(askExpertLink).toBeVisible();

      const trainingLink = await pageObjects.homepage.getBodyLinkByText('Elastic Training');
      await expect(trainingLink).toBeVisible();

      const docsLink = await pageObjects.homepage.getBodyLinkByText('View documentation');
      await expect(docsLink).toBeVisible();
    });

    test('body links should have external target attribute', async ({ pageObjects }) => {
      const bodyLinks = await pageObjects.homepage.getBodyLinks();
      const allLinks = await bodyLinks.all();

      for (const link of allLinks) {
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
    });

    test('body links should navigate to correct URLs when clicked', async ({
      pageObjects,
      page,
    }) => {
      const bodyLinkTests = [
        {
          linkText: 'Contact customer engineering',
          expectedUrlPattern: /contact\/ce-help/,
        },
        {
          linkText: 'Elastic Training',
          expectedUrlPattern: /training/,
        },
        {
          linkText: 'View documentation',
          expectedUrlPattern: /solutions\/search\/get-started/,
        },
      ];

      for (const { linkText, expectedUrlPattern } of bodyLinkTests) {
        const link = await pageObjects.homepage.getBodyLinkByText(linkText);
        await expect(link).toBeVisible();

        // Click the link and wait for new page to open
        const context = page.context();
        const [newPage] = await Promise.all([context.waitForEvent('page'), link.click()]);

        // Verify the new page URL matches expected pattern
        await expect(newPage).toHaveURL(expectedUrlPattern);

        // Close the new page and continue with the original page
        await newPage.close();
      }
    });
  }
);
