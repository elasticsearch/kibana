/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import type { KibanaUrl, Locator, ScoutPage } from '@kbn/scout-oblt';

export type AssetDetailsPageTabName =
  | 'Overview'
  | 'Metadata'
  | 'Metrics'
  | 'Processes'
  | 'Profiling'
  | 'Logs'
  | 'Anomalies'
  | 'Osquery'
  | 'Dashboards';

export abstract class AssetDetailsTab {
  public abstract readonly tabName: AssetDetailsPageTabName;
  public abstract readonly tab: Locator;

  constructor(protected readonly page: ScoutPage, protected readonly kbnUrl: KibanaUrl) {}

  public getTab(): Locator {
    return this.tab;
  }

  public async clickTab() {
    await expect(this.tab).toBeVisible();
    await this.tab.click();
  }
}
