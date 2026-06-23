/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';
import {
  serializedTimeRangeSchema,
  serializedTitlesSchema,
} from '@kbn/presentation-publishing-schemas';

export const severityThresholdSchema = schema.oneOf([
  schema.object({
    min: schema.literal(ML_ANOMALY_THRESHOLD.LOW),
    max: schema.literal(ML_ANOMALY_THRESHOLD.WARNING),
  }),
  schema.object({
    min: schema.literal(ML_ANOMALY_THRESHOLD.WARNING),
    max: schema.literal(ML_ANOMALY_THRESHOLD.MINOR),
  }),
  schema.object({
    min: schema.literal(ML_ANOMALY_THRESHOLD.MINOR),
    max: schema.literal(ML_ANOMALY_THRESHOLD.MAJOR),
  }),
  schema.object({
    min: schema.literal(ML_ANOMALY_THRESHOLD.MAJOR),
    max: schema.literal(ML_ANOMALY_THRESHOLD.CRITICAL),
  }),
  schema.object({
    min: schema.literal(ML_ANOMALY_THRESHOLD.CRITICAL),
  }),
]);

export type SeverityThreshold = TypeOf<typeof severityThresholdSchema>;

export const anomalyChartsEmbeddableStateSchema = schema.object(
  {
    ...serializedTitlesSchema.getPropSchemas(),
    ...serializedTimeRangeSchema.getPropSchemas(),
    job_ids: schema.arrayOf(schema.string({ minLength: 1, maxLength: 1000 }), {
      minSize: 1,
      maxSize: 10000,
      meta: {
        description: 'Anomaly detection job or group IDs whose results are shown in the charts.',
      },
    }),
    max_series_to_plot: schema.maybe(
      schema.number({
        min: 1,
        max: 50,
        meta: { description: 'Maximum number of anomaly series to plot.' },
      })
    ),
    severity_threshold: schema.maybe(
      schema.arrayOf(severityThresholdSchema, {
        maxSize: 5,
        meta: { description: 'Severity threshold ranges used to filter anomaly results.' },
      })
    ),
  },
  {
    meta: {
      id: 'ml_anomaly_charts',
      description: 'Anomaly Charts embeddable',
    },
  }
);

export type AnomalyChartsEmbeddableState = TypeOf<typeof anomalyChartsEmbeddableStateSchema>;
