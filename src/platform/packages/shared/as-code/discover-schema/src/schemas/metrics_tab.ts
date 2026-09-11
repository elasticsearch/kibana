/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import {
  DiscoverTabType,
  MAX_METRICS_TAB_DIMENSIONS,
  MAX_METRICS_TAB_STATE_STRING_LENGTH,
  METRICS_GRID_HISTOGRAM_PERCENTILES,
  METRICS_GRID_SIMPLE_AGGREGATIONS,
} from '@kbn/discover-session-constants';

const simpleAggregationSchema = z.enum(METRICS_GRID_SIMPLE_AGGREGATIONS);

export const discoverSessionMetricsTabTypeStateSchema = z
  .object({
    type: z.literal(`${DiscoverTabType.Metrics}`).meta({
      description:
        'A tab with saved metrics grid settings. Requires an ES|QL data source. ' +
        'These settings are used only when the query supports the metrics experience.',
    }),
    dimensions: z
      .array(z.string().max(MAX_METRICS_TAB_STATE_STRING_LENGTH))
      .max(MAX_METRICS_TAB_DIMENSIONS)
      .meta({
        description: 'Fields used to group metrics in the metrics grid.',
      }),
    search_term: z.string().max(MAX_METRICS_TAB_STATE_STRING_LENGTH).meta({
      description: 'Search term used to filter metrics in the metrics grid.',
    }),
    counter_aggregation: simpleAggregationSchema.meta({
      description: 'Aggregation applied to counter metric fields.',
    }),
    gauge_aggregation: simpleAggregationSchema.meta({
      description: 'Aggregation applied to gauge metric fields.',
    }),
    histogram_percentile: z.enum(METRICS_GRID_HISTOGRAM_PERCENTILES).meta({
      description: 'Percentile displayed for histogram metric fields.',
    }),
  })
  .strict();
