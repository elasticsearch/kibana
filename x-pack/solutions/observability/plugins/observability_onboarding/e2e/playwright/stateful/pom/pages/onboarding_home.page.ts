/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Page, Locator } from '@playwright/test';

export class OnboardingHomePage {
  page: Page;

  private readonly useCaseHost: Locator;
  private readonly useCaseKubernetes: Locator;
  readonly useCaseCloud: Locator;

  private readonly otelKubernetesQuickStartCard: Locator;
  private readonly autoDetectElasticAgent: Locator;
  private readonly otelHostCard: Locator;
  readonly awsCollectionCard: Locator;
  readonly firehoseQuickstartCard: Locator;
  readonly cloudforwarderQuickstartCard: Locator;
  readonly introducingAIAgentModalContinueBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.useCaseHost = this.page
      .getByTestId('observabilityOnboardingUseCaseCard-host')
      .getByRole('radio');

    this.useCaseKubernetes = this.page
      .getByTestId('observabilityOnboardingUseCaseCard-kubernetes')
      .getByRole('radio');

    this.useCaseCloud = this.page
      .getByTestId('observabilityOnboardingUseCaseCard-cloud')
      .getByRole('radio');

    this.otelKubernetesQuickStartCard = this.page.getByTestId('integration-card:otel-kubernetes');

    this.autoDetectElasticAgent = this.page.getByTestId('integration-card:auto-detect-logs');
    this.otelHostCard = this.page.getByTestId('integration-card:otel-logs');
    this.awsCollectionCard = this.page.getByTestId('integration-card:aws-logs-virtual');
    this.firehoseQuickstartCard = this.page.getByTestId('integration-card:firehose-quick-start');
    this.cloudforwarderQuickstartCard = this.page.getByTestId(
      'integration-card:cloudforwarder-quick-start'
    );
    this.introducingAIAgentModalContinueBtn = this.page.getByTestId(
      'agentBuilderAnnouncementContinueButton'
    );
  }

  public async selectHostUseCase() {
    await this.useCaseHost.click();
  }

  public async selectKubernetesUseCase() {
    await this.useCaseKubernetes.click();
  }

  public async selectAutoDetectWithElasticAgent() {
    await this.autoDetectElasticAgent.click();
  }

  public async gotoKubernetesElasticAgentFlow() {
    await this.page.goto(
      `${process.env.KIBANA_BASE_URL}/app/observabilityOnboarding/kubernetes/elastic-agent`
    );
  }

  public async selectOtelKubernetesQuickstart() {
    await this.otelKubernetesQuickStartCard.click();
  }

  public async selectOtelHostQuickstart() {
    await this.otelHostCard.click();
  }

  public async maybeClickIntroducingAIAgentModalContinueBtn() {
    await this.page.addLocatorHandler(
      this.introducingAIAgentModalContinueBtn,
      async (btn) => {
        await btn.click();
      },
      { times: 1 }
    );
  }
}
