/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import type { ServiceFlyoutPage } from './page_objects/service_flyout';

/** Classic APM services (ECS/unknown schema, non-Discover host). */
export async function assertFlyoutApmChartsRendered(
  serviceFlyoutPage: ServiceFlyoutPage
): Promise<void> {
  await expect(serviceFlyoutPage.apmCharts).toBeVisible();
}

/** OTel services and document-based hosts (Discover) render ES|QL Lens charts. */
export async function assertFlyoutLensChartsRendered(
  serviceFlyoutPage: ServiceFlyoutPage,
  ids: string[]
): Promise<void> {
  for (const id of ids) {
    const chart = serviceFlyoutPage.getChartLocator(id);
    await expect(chart).toBeVisible();
    await expect(chart.locator('[data-render-complete="true"]')).toBeVisible();
    await expect(chart.locator('[data-test-subj="embeddable-lens-failure"]')).toBeHidden();
  }
}
