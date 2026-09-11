/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import {
  serializedTimeRangeSchema,
  serializedTitlesSchema,
} from '@kbn/presentation-publishing-schemas';
const baseProps = {
  ...serializedTitlesSchema.shape,
  ...serializedTimeRangeSchema.shape,
  job_ids: z.array(z.string().min(1).max(1000)).min(1).max(10000).meta({
    description:
      'IDs of the anomaly detection jobs or groups whose results are shown in the swim lane.',
  }),
  per_page: z.number().min(1).optional().meta({
    description:
      'Number of rows to display per page in a view-by swim lane. Ignored for overall swim lanes.',
  }),
  severity_threshold: z.number().min(0).max(100).optional().meta({
    description:
      'Minimum anomaly score (0–100) to show in the swim lane. Anomalies with scores at or above this value are displayed.',
  }),
};

const anomalySwimLaneOverallSchema = z
  .object({
    ...baseProps,
    swimlane_type: z.literal('overall'),
  })
  .strip();

const anomalySwimLaneViewBySchema = z
  .object({
    ...baseProps,
    swimlane_type: z.literal('viewBy'),
    view_by: z.string().min(1).max(1000).meta({
      description: 'Field name used to split anomalies into a view-by swim lane.',
    }),
  })
  .strip();

export const anomalySwimLaneEmbeddableStateSchema = z
  .union([anomalySwimLaneOverallSchema, anomalySwimLaneViewBySchema])
  .meta({
    id: 'ml_anomaly_swimlane',
    description: 'Anomaly Swim Lane embeddable',
  });

export type AnomalySwimLaneEmbeddableState = z.output<typeof anomalySwimLaneEmbeddableStateSchema>;

export type SwimlaneType = AnomalySwimLaneEmbeddableState['swimlane_type'];
