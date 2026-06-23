/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator, ScoutPage } from '@kbn/scout';

const RED_METRICS_CHART_TITLES = ['Latency', 'Error Rate', 'Throughput'];

export interface TracesCharts {
  readonly redMetricsCharts: Locator;
  readonly legendItems: Locator;
  readonly expectedTitles: readonly string[];
  getChartTitle(title: string): Locator;
  getChartError(title: string): Locator;
}

export function createTracesCharts(page: ScoutPage): TracesCharts {
  const redMetricsCharts = page.testSubj.locator('metricsExperienceGrid');

  return {
    redMetricsCharts,
    legendItems: redMetricsCharts.locator('[data-testid="echLegendItemLabel"]'),
    expectedTitles: RED_METRICS_CHART_TITLES,
    getChartTitle: (title: string): Locator => redMetricsCharts.getByText(title),
    getChartError: (title: string): Locator => {
      const headingTestSubj = `embeddablePanelHeading-${title.replace(/\s/g, '')}`;
      return redMetricsCharts
        .locator('[data-test-subj="embeddablePanel"]')
        .filter({ has: page.testSubj.locator(headingTestSubj) })
        .locator('[data-test-subj="embeddable-lens-failure"]');
    },
  };
}
