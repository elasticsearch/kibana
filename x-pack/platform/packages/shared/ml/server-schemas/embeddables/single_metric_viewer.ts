/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';
import {
  serializedTimeRangeSchema,
  serializedTitlesSchema,
} from '@kbn/presentation-publishing-schemas';
import { mlEntityFieldValueSchema } from '@kbn/ml-anomaly-utils/schemas';

export const singleMetricViewerEmbeddableStateSchema = schema.object(
  {
    ...serializedTitlesSchema.getPropSchemas(),
    ...serializedTimeRangeSchema.getPropSchemas(),
    job_ids: schema.arrayOf(schema.string({ minLength: 1, maxLength: 1000 }), {
      minSize: 1,
      maxSize: 1,
      meta: {
        description:
          'Anomaly detection job ID whose results are shown in the single metric viewer.',
      },
    }),
    selected_detector_index: schema.number({
      min: 0,
      defaultValue: 0,
      meta: {
        description:
          'Zero-based index of the detector (the Elasticsearch detector_index) within the job whose results are shown.',
      },
    }),
    selected_entities: schema.maybe(
      schema.recordOf(schema.string({ maxLength: 1000 }), schema.maybe(mlEntityFieldValueSchema), {
        meta: {
          description:
            'Values of the partition, by, or over fields that identify the single time series to display.',
        },
      })
    ),
    function_description: schema.maybe(
      schema.string({
        meta: {
          description:
            'For detectors that use the `metric` function, selects which value to plot: `min`, `max`, or `mean`. Ignored for other detector functions. When omitted, the viewer derives a default from the highest-scoring anomaly record.',
        },
        maxLength: 1000,
      })
    ),
    forecast_id: schema.maybe(
      schema.string({
        meta: { description: 'Identifier of a forecast to overlay on the chart.' },
        maxLength: 1000,
      })
    ),
  },
  {
    meta: {
      id: 'ml_single_metric_viewer',
      description: 'Single Metric Viewer embeddable',
    },
  }
);

export type SingleMetricViewerEmbeddableState = TypeOf<
  typeof singleMetricViewerEmbeddableStateSchema
>;
