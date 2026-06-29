/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import type { PageObjects } from '@kbn/scout';
import type { TracesExperiencePage } from './page_objects';

/**
 * Waits for the traces data-source profile to have engaged before assertions
 * on profile-driven UI run. Adds a 30s timeout to the visibility check to
 * make sure the trace profile is properly applied.
 */
async function waitForTracesProfileApplied(
  pageObjects: PageObjects & { tracesExperience: TracesExperiencePage }
) {
  const { profileSpecificColumns } = pageObjects.tracesExperience.grid;

  // Wait for every profile-specific column before checking render stability.
  // Waiting for only the first column risks calling waitForDocTableRendered
  // while the remaining columns are still being applied, which briefly resets
  // data-render-complete and can cause the stability window to never be reached.
  for (const column of profileSpecificColumns) {
    await expect(pageObjects.dataGrid.getColumnHeader(column)).toBeVisible({
      timeout: 30_000,
    });
  }

  // Ensure the in-flight search / column swap finished
  await pageObjects.discover.waitUntilSearchingHasFinished();
  await pageObjects.dataGrid.waitForDocTableRendered();
}

export async function expectTracesExperienceEnabled(
  pageObjects: PageObjects & { tracesExperience: TracesExperiencePage },
  shouldCheckForREDMetricsCharts: boolean = true
) {
  await waitForTracesProfileApplied(pageObjects);

  for (const column of pageObjects.tracesExperience.grid.expectedColumns) {
    await expect(pageObjects.dataGrid.getColumnHeader(column)).toBeVisible();
  }

  if (shouldCheckForREDMetricsCharts) {
    await expect(pageObjects.tracesExperience.charts.redMetricsCharts).toBeVisible();
  }
}
