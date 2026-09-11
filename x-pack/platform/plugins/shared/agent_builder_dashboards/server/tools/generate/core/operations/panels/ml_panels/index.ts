/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { panelGridSchema, timeRangeSchema } from '@kbn/agent-builder-dashboards-common';
import { z } from '@kbn/zod/v4';
import { definePanelType } from '../panel_type';

/**
 * ML anomaly detection panel logic.
 *
 * Three panel types are supported: anomaly charts (`ml_anomaly_charts`),
 * anomaly swim lane (`ml_anomaly_swimlane`), and single metric viewer
 * (`ml_single_metric_viewer`). All use `source: 'config'` — the agent supplies
 * the embeddable state directly. There is no `source: 'request'` resolver for
 * ML panels; the agent derives job IDs and parameters from prior tool calls or
 * conversation context.
 *
 * The embeddable type strings are intentionally string literals here so that
 * this module carries no runtime dependency on the ML plugin.
 */

// ─── Anomaly Charts ───────────────────────────────────────────────────────────

export const anomalyChartsPanelConfigSchema = z.object({
  job_ids: z
    .array(z.string().max(256))
    .min(1)
    .max(20)
    .describe('Anomaly detection job or group IDs to display. Must already exist.'),
  time_range: timeRangeSchema
    .optional()
    .describe('Time range to scope the chart. When omitted the dashboard time range is used.'),
  severity_threshold: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Minimum anomaly score (0–100) to display. Defaults to 25 when omitted.'),
});

export const anomalyChartsPanelConfigInputSchema = z.object({
  source: z.literal('config'),
  type: z.literal('ml_anomaly_charts'),
  grid: panelGridSchema,
  config: anomalyChartsPanelConfigSchema.describe(
    'Anomaly charts panel configuration. Provide job_ids obtained from prior ML tool results or conversation context.'
  ),
});

export const anomalyChartsPanelDefinition = definePanelType({
  embeddableType: 'ml_anomaly_charts',
  buildPanelContent: (config) => {
    const { severity_threshold: severityThreshold, ...rest } = config;
    return {
      type: 'ml_anomaly_charts',
      config: {
        ...rest,
        ...(typeof severityThreshold === 'number'
          ? { severity_threshold: [{ min: severityThreshold }] }
          : {}),
      },
    };
  },
});

// ─── Anomaly Swim Lane ────────────────────────────────────────────────────────

const anomalySwimlaneBaseSchema = z.object({
  job_ids: z
    .array(z.string().max(256))
    .min(1)
    .max(20)
    .describe('Anomaly detection job or group IDs to include in the swim lane.'),
  time_range: timeRangeSchema
    .optional()
    .describe('Time range to scope the swim lane. When omitted the dashboard time range is used.'),
});

export const anomalySwimlaneOverallConfigSchema = anomalySwimlaneBaseSchema.extend({
  swimlane_type: z
    .literal('overall')
    .describe(
      'Shows the highest anomaly score per time bucket aggregated across all selected jobs.'
    ),
});

export const anomalySwimlaneViewByConfigSchema = anomalySwimlaneBaseSchema.extend({
  swimlane_type: z
    .literal('viewBy')
    .describe('Splits anomaly scores by the values of a chosen field.'),
  view_by: z
    .string()
    .max(256)
    .describe('Field to split by (e.g. "host.name"). Required when swimlane_type is "viewBy".'),
});

export const anomalySwimlaneConfigSchema = z.discriminatedUnion('swimlane_type', [
  anomalySwimlaneOverallConfigSchema,
  anomalySwimlaneViewByConfigSchema,
]);

export const anomalySwimlaneConfigInputSchema = z.object({
  source: z.literal('config'),
  type: z.literal('ml_anomaly_swimlane'),
  grid: panelGridSchema,
  config: anomalySwimlaneConfigSchema.describe(
    'Anomaly swim lane configuration. Use swimlane_type "overall" for a cross-job summary, or "viewBy" with a view_by field to break out by entity.'
  ),
});

export const anomalySwimlaneDefinition = definePanelType({
  embeddableType: 'ml_anomaly_swimlane',
});

// ─── Single Metric Viewer ─────────────────────────────────────────────────────

export const singleMetricViewerConfigSchema = z.object({
  job_ids: z
    .array(z.string().max(256))
    .min(1)
    .max(1)
    .describe('Exactly one anomaly detection job ID whose detector results are shown.'),
  selected_detector_index: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Zero-based detector index within the job. Defaults to 0.'),
  selected_entities: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional()
    .describe(
      'Partition / by / over field values that identify the series to display, e.g. { "host.name": "web-01" }.'
    ),
  function_description: z
    .string()
    .optional()
    .describe('For metric detectors: which value to plot — "min", "max", or "mean".'),
  forecast_id: z.string().optional().describe('Identifier of a forecast to overlay on the chart.'),
  time_range: timeRangeSchema
    .optional()
    .describe('Time range to scope the viewer. When omitted the dashboard time range is used.'),
});

export const singleMetricViewerConfigInputSchema = z.object({
  source: z.literal('config'),
  type: z.literal('ml_single_metric_viewer'),
  grid: panelGridSchema,
  config: singleMetricViewerConfigSchema.describe(
    'Single metric viewer configuration. job_ids must contain exactly one job ID. Set selected_entities only when the job has partition/by/over fields and the user wants a specific entity.'
  ),
});

export const singleMetricViewerPanelDefinition = definePanelType({
  embeddableType: 'ml_single_metric_viewer',
});
