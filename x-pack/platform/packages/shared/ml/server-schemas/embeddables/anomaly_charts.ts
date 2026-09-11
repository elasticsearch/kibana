/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';
import {
  serializedTimeRangeSchema,
  serializedTitlesSchema,
} from '@kbn/presentation-publishing-schemas';

export const severityThresholdSchema = z.union([
  z
    .object({
      min: z.literal(ML_ANOMALY_THRESHOLD.LOW),
      max: z.literal(ML_ANOMALY_THRESHOLD.WARNING),
    })
    .strict(),
  z
    .object({
      min: z.literal(ML_ANOMALY_THRESHOLD.WARNING),
      max: z.literal(ML_ANOMALY_THRESHOLD.MINOR),
    })
    .strict(),
  z
    .object({
      min: z.literal(ML_ANOMALY_THRESHOLD.MINOR),
      max: z.literal(ML_ANOMALY_THRESHOLD.MAJOR),
    })
    .strict(),
  z
    .object({
      min: z.literal(ML_ANOMALY_THRESHOLD.MAJOR),
      max: z.literal(ML_ANOMALY_THRESHOLD.CRITICAL),
    })
    .strict(),
  // Open-ended floor: scores >= min. Covers the canonical critical band
  // (`min: 75`) and arbitrary 0–100 thresholds (e.g. agent-builder charts).
  z
    .object({
      min: z.number().min(0).max(100),
    })
    .strict(),
]);

export type SeverityThreshold = z.output<typeof severityThresholdSchema>;

export const anomalyChartsEmbeddableStateSchema = z
  .object({
    ...serializedTitlesSchema.shape,
    ...serializedTimeRangeSchema.shape,
    job_ids: z.array(z.string().min(1).max(1000)).min(1).max(10000).meta({
      description: 'Anomaly detection job or group IDs whose results are shown in the charts.',
    }),
    max_series_to_plot: z.number().min(1).max(50).optional().meta({
      description: 'Maximum number of anomaly series to plot.',
    }),
    severity_threshold: z.array(severityThresholdSchema).max(5).optional().meta({
      description: 'Severity threshold ranges used to filter anomaly results.',
    }),
  })
  .strip()
  .meta({
    id: 'ml_anomaly_charts',
    description: 'Anomaly Charts embeddable',
  });

export type AnomalyChartsEmbeddableState = z.output<typeof anomalyChartsEmbeddableStateSchema>;
