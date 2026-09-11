/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator } from '@kbn/scout-oblt';
import { createLazyPageObject, type KibanaUrl, type ScoutPage } from '@kbn/scout-oblt';
import { OverviewTab } from './overview_tab';
import { MetadataTab } from './metadata_tab';
import { MetricsTab } from './metrics_tab';
import { LogsTab } from './logs_tab';
import { ProcessesTab } from './processes_tab';
import { DashboardsTab } from './dashboards_tab';

export class AssetDetailsPage {
  public readonly hostOverviewTab: OverviewTab;
  public readonly dockerOverviewTab: OverviewTab;

  public readonly metadataTab: MetadataTab;

  public readonly hostMetricsTab: MetricsTab;
  public readonly dockerMetricsTab: MetricsTab;

  public readonly logsTag: LogsTab;

  public readonly processesTab: ProcessesTab;

  public readonly dashboardsTab: DashboardsTab;

  public readonly openAsPageButton: Locator;
  public readonly returnButton: Locator;

  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.hostOverviewTab = createLazyPageObject(OverviewTab, this.page, this.kbnUrl, 'Host');
    this.dockerOverviewTab = createLazyPageObject(OverviewTab, this.page, this.kbnUrl, 'Docker');

    this.metadataTab = createLazyPageObject(MetadataTab, this.page, this.kbnUrl);

    this.hostMetricsTab = createLazyPageObject(MetricsTab, this.page, this.kbnUrl, 'Host');
    this.dockerMetricsTab = createLazyPageObject(MetricsTab, this.page, this.kbnUrl, 'Docker');

    this.logsTag = createLazyPageObject(LogsTab, this.page, this.kbnUrl);

    this.processesTab = createLazyPageObject(ProcessesTab, this.page, this.kbnUrl);

    this.dashboardsTab = createLazyPageObject(DashboardsTab, this.page, this.kbnUrl);

    this.openAsPageButton = this.page.getByTestId('infraAssetDetailsOpenAsPageButton');
    this.returnButton = this.page
      .getByTestId('appHeaderBack')
      .or(this.page.getByTestId('infraAssetDetailsReturnButton'));
  }
}
