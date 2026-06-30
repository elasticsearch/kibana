/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export const APM_TIMESERIES_ATTACHMENT_TYPE = 'observability.apm-timeseries' as const;

const dataPointSchema = z.object({
  /** Unix timestamp in milliseconds */
  timestamp: z.number(),
  /**
   * Null (or missing/undefined from the model) indicates a gap / missing bucket.
   * The schema accepts undefined and coerces it to null so the renderer's
   * `=== null` gap checks work correctly regardless of what the model sends.
   */
  value: z
    .number()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

// Upper bound on free-form string inputs to avoid unbounded-string DoS (CodeQL).
const MAX_LABEL_LENGTH = 1024;

export const apmTimeseriesAttachmentDataSchema = z.object({
  serviceName: z.string().max(MAX_LABEL_LENGTH),
  title: z.string().max(MAX_LABEL_LENGTH).optional(),
  metric: z.enum(['latency', 'failedTransactionRate', 'throughput']),
  /**
   * Display unit for `dataPoints` values.
   * - `'ms'`  — latency in milliseconds
   * - `'%'`   — failed-transaction rate as a **percentage (0–100)**; e.g. `8.0` = 8 %
   * - `'rpm'` — throughput in requests per minute
   *
   * Note: `%` values are 0–100, not fractions. This matches the output of the
   * APM data provider (`get_transaction_failure_rate`), which multiplies by 100.
   * Also consistent with `ApmMetricsAttachmentData.errorRate`.
   */
  unit: z.enum(['ms', '%', 'rpm']),
  dataPoints: z.array(dataPointSchema),
  /** Optional alert threshold line value (in the same unit as `unit`) */
  threshold: z.number().optional(),
  /** Optional alert start timestamp (ms) — drives the alert-window shading */
  alertStart: z.number().optional(),
});

export type ApmTimeseriesDataPoint = z.infer<typeof dataPointSchema>;
export type ApmTimeseriesAttachmentData = z.infer<typeof apmTimeseriesAttachmentDataSchema>;
