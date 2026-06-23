/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect, type Page, type BrowserContext, type Locator } from '@playwright/test';

export class OtelKubernetesFlowPage {
  page: Page;
  context: BrowserContext;

  private readonly exploreLogsButton: Locator;

  constructor(page: Page, context: BrowserContext) {
    this.page = page;
    this.context = context;

    this.exploreLogsButton = this.page.getByTestId(
      'observabilityOnboardingDataIngestStatusActionLink-logs'
    );
  }

  public async getHelmRepositorySnippet() {
    return await this.page
      .getByTestId('observabilityOnboardingOtelKubernetesAddRepositorySnippet')
      .textContent();
  }

  public async copyInstallStackSnippetToClipboard() {
    await this.page
      .getByTestId('observabilityOnboardingOtelKubernetesInstallStackSnippetCopyButtonIcon')
      .click();
  }

  public async switchInstrumentationInstructions(language: 'nodejs' | 'java' | 'python' | 'go') {
    await this.page
      .getByTestId('observabilityOnboardingKubernetesOtelInstrumentationSwitch')
      .click();
    await this.page.getByRole('button', { name: language === 'java' ? 'Java' : language }).click();
  }

  public async selectNamespaceInstrumentationInstructions() {
    await this.page
      .getByTestId('observabilityOnboardingKubernetesOtelAnnotationMode-namespace')
      .getByRole('radio')
      .click();
  }

  public async getAnnotateAllResourceSnippet() {
    return await this.page
      .getByTestId('observabilityOnboardingKubernetesOtelInstrumentationNamespaceSnippet')
      .textContent();
  }

  public async getRestartDeploymentSnippet() {
    return await this.page
      .getByTestId('observabilityOnboardingKubernetesOtelInstrumentationRestartCommand')
      .textContent();
  }

  public async openClusterOverviewDashboardInNewTab(): Promise<Page> {
    const dashboardURL = await this.page
      .getByTestId(
        'observabilityOnboardingDataIngestStatusActionLink-kubernetes_otel-cluster-overview'
      )
      .getAttribute('href');

    if (dashboardURL) {
      const newPage = await this.context.newPage();

      await newPage.goto(dashboardURL);

      return newPage;
    } else {
      throw new Error('Dashboard URL not found');
    }
  }

  public async assertDataReceivedIndicator(): Promise<void> {
    await expect(
      this.exploreLogsButton,
      'Explore logs action link should be visible after data is detected'
    ).toBeVisible();
  }

  public async clickExploreLogsCTA() {
    await this.exploreLogsButton.click();
  }
}
