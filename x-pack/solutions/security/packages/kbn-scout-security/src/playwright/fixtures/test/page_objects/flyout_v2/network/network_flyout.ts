/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the flyout_v2 network flyout, opened via `services.overlays.openSystemFlyout`
 * from an IP value (e.g. the alerts table source.ip cell or a document flyout IP field).
 */
export class NetworkFlyout {
  /** Header title text, showing the IP the flyout was opened for. */
  public readonly title: Locator;

  constructor(page: ScoutPage) {
    this.title = page.testSubj.locator('network-details-flyout-headerText');
  }

  /** Wait for the network flyout to be visible and its title rendered. */
  async waitForNetworkFlyout() {
    await this.title.waitFor({ state: 'visible', timeout: 15_000 });
  }
}
