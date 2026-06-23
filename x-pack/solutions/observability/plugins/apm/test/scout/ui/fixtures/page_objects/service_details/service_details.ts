/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createLazyPageObject, type KibanaUrl, type ScoutPage } from '@kbn/scout-oblt';
import { testData } from '../..';
import { DependenciesTab } from './dependencies_tab';
import { AlertsTab } from './alerts_tab';
import { OverviewTab } from './overview_tab';
import { TransactionsTab } from './transactions_tab';
import { ErrorsTab } from './errors_tab';
import { DashboardsTab } from './dashboards_tab';
import { MetricsTab } from './metrics_tab';
import { InfrastructureTab } from './infrastructure_tab';
import { EXTENDED_TIMEOUT } from '../../constants';
import { waitForSearchBarReady } from '../../page_helpers';

export class ServiceDetailsPage {
  public readonly SERVICE_NAME = testData.SERVICE_OPBEANS_JAVA;

  public readonly dependenciesTab: DependenciesTab;
  public readonly alertsTab: AlertsTab;
  public readonly overviewTab: OverviewTab;
  public readonly transactionsTab: TransactionsTab;
  public readonly errorsTab: ErrorsTab;
  public readonly dashboardsTab: DashboardsTab;
  public readonly metricsTab: MetricsTab;
  public readonly infrastructureTab: InfrastructureTab;

  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.dependenciesTab = createLazyPageObject(
      DependenciesTab,
      this.page,
      this.kbnUrl,
      this.SERVICE_NAME
    );
    this.alertsTab = createLazyPageObject(AlertsTab, this.page, this.kbnUrl, this.SERVICE_NAME);
    this.overviewTab = createLazyPageObject(OverviewTab, this.page, this.kbnUrl, this.SERVICE_NAME);
    this.transactionsTab = createLazyPageObject(
      TransactionsTab,
      this.page,
      this.kbnUrl,
      this.SERVICE_NAME
    );
    this.errorsTab = createLazyPageObject(ErrorsTab, this.page, this.kbnUrl, this.SERVICE_NAME);
    this.dashboardsTab = createLazyPageObject(
      DashboardsTab,
      this.page,
      this.kbnUrl,
      this.SERVICE_NAME
    );
    this.metricsTab = createLazyPageObject(MetricsTab, this.page, this.kbnUrl, this.SERVICE_NAME);
    this.infrastructureTab = createLazyPageObject(
      InfrastructureTab,
      this.page,
      this.kbnUrl,
      this.SERVICE_NAME
    );
  }

  public async goToPage(
    overrides: { serviceName?: string; rangeFrom?: string; rangeTo?: string } = {}
  ) {
    const urlServiceName = encodeURIComponent(overrides.serviceName ?? this.SERVICE_NAME);

    await this.page.goto(
      `${this.kbnUrl.app('apm')}/services/${urlServiceName}?${new URLSearchParams({
        rangeFrom: overrides.rangeFrom ?? testData.START_DATE,
        rangeTo: overrides.rangeTo ?? testData.END_DATE,
      })}`
    );
    await waitForSearchBarReady(this.page);
    await this.page
      .getByTestId('apmMainTemplateServiceAgentLoader')
      .waitFor({ state: 'hidden', timeout: EXTENDED_TIMEOUT });
  }

  // #region Mobile Services
  async goToMobileServiceOverview(
    serviceName: string,
    overrides: { rangeFrom?: string; rangeTo?: string } = {}
  ) {
    const urlServiceName = encodeURIComponent(serviceName);

    await this.page.goto(
      `${this.kbnUrl.app('apm')}/mobile-services/${urlServiceName}/overview?${new URLSearchParams({
        rangeFrom: overrides.rangeFrom ?? testData.START_DATE,
        rangeTo: overrides.rangeTo ?? testData.END_DATE,
      })}`
    );
    await this.page.getByRole('tablist').waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }
  // #endregion

  // #region Service Header
  getServiceHeaderName() {
    return this.page.getByTestId('apmMainTemplateHeaderServiceName');
  }
  // #endregion

  // #region Tabs
  getServiceMapTab() {
    return this.page.getByRole('tab', { name: 'Service map' });
  }
  // #endregion
}
