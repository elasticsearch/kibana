/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { cleanup, generate, type PartialConfig } from '@kbn/data-forge';
import type { ScoutLogger } from '@kbn/scout-oblt';

/**
 * The index `@kbn/data-forge` writes the `fake_hosts` dataset to. The metric
 * threshold rule reads from it via the metrics source `metricAlias`.
 */
export const METRIC_THRESHOLD_INDEX = 'kbn-data-forge-fake_hosts.fake_hosts-*';

/**
 * Programmatic data-forge config that drives a steady `system.cpu.user.pct` of
 * 90% so the metric threshold rule (`> 50%`) reliably fires. Mirrors the
 * `before` hook of the ported FTR `metric_threshold_rule` suite.
 */
export const METRIC_THRESHOLD_DATA_FORGE_CONFIG: PartialConfig = {
  schedule: [
    {
      template: 'good',
      start: 'now-10m',
      end: 'now+5m',
      metrics: [{ name: 'system.cpu.user.pct', method: 'linear', start: 0.9, end: 0.9 }],
    },
  ],
  indexing: { dataset: 'fake_hosts' },
};

export const installMetricThresholdDataForge = (
  esClient: Client,
  log: ScoutLogger
): Promise<string[]> =>
  generate({ client: esClient, config: METRIC_THRESHOLD_DATA_FORGE_CONFIG, logger: log });

export const removeMetricThresholdDataForge = (esClient: Client, log: ScoutLogger): Promise<void> =>
  cleanup({ client: esClient, config: METRIC_THRESHOLD_DATA_FORGE_CONFIG, logger: log });

/**
 * The `fake_stack` index the custom-threshold rule under
 * `related_dashboards.spec.ts` reads from, via the imported data view
 * (`593f894a-…`, title `kbn-data-forge-fake_stack.message_processor-*`).
 */
export const FAKE_STACK_MESSAGE_PROCESSOR_INDEX = 'kbn-data-forge-fake_stack.message_processor-*';

/**
 * `fake_stack` "bad" schedule, ported from the FTR `suggested_dashboards`
 * `before` hook. It drives a steady stream of rejected messages so the custom
 * threshold rule (`1 - processor.processed / processor.accepted > 0.0005`,
 * grouped by `host.name`) reliably fires.
 */
export const RELATED_DASHBOARDS_DATA_FORGE_CONFIG: PartialConfig = {
  schedule: [{ template: 'bad', start: 'now-15m', end: 'now+5m' }],
  indexing: {
    dataset: 'fake_stack',
    eventsPerCycle: 1,
    interval: 10000,
    alignEventsToInterval: true,
  },
};

export const installRelatedDashboardsDataForge = (
  esClient: Client,
  log: ScoutLogger
): Promise<string[]> =>
  generate({ client: esClient, config: RELATED_DASHBOARDS_DATA_FORGE_CONFIG, logger: log });

export const removeRelatedDashboardsDataForge = (
  esClient: Client,
  log: ScoutLogger
): Promise<void> =>
  cleanup({ client: esClient, config: RELATED_DASHBOARDS_DATA_FORGE_CONFIG, logger: log });
