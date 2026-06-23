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
import {
  CHANGE_POINT_CHART_DEFAULT_AGG_FUNCTION,
  CHANGE_POINT_CHART_DEFAULT_SERIES,
  CHANGE_POINT_CHART_MAX_SERIES,
  CHANGE_POINT_DETECTION_VIEW_TYPE,
} from '@kbn/aiops-change-point-detection/constants';

const validateInteger = (value: number) => {
  if (!Number.isInteger(value)) {
    return `${value} is not a valid integer`;
  }
};

const aggregationFunctionSchema = schema.oneOf(
  [schema.literal('avg'), schema.literal('sum'), schema.literal('min'), schema.literal('max')],
  {
    defaultValue: CHANGE_POINT_CHART_DEFAULT_AGG_FUNCTION,
    meta: { description: 'The aggregation function used to calculate the metric values.' },
  }
);

const viewTypeSchema = schema.oneOf(
  [
    schema.literal(CHANGE_POINT_DETECTION_VIEW_TYPE.CHARTS),
    schema.literal(CHANGE_POINT_DETECTION_VIEW_TYPE.TABLE),
  ],
  {
    defaultValue: CHANGE_POINT_DETECTION_VIEW_TYPE.CHARTS,
    meta: { description: 'The type of change point detection view to display.' },
  }
);

export const changePointChartEmbeddableStateSchema = schema.object(
  {
    ...serializedTitlesSchema.getPropSchemas(),
    ...serializedTimeRangeSchema.getPropSchemas(),
    data_view_id: schema.string({
      minLength: 1,
      maxLength: 10000,
      meta: { description: 'The data view ID used to run change point detection.' },
    }),
    view_type: viewTypeSchema,
    aggregation_function: aggregationFunctionSchema,
    metric_field: schema.string({
      minLength: 1,
      maxLength: 10000,
      meta: { description: 'The metric field used by the aggregation function.' },
    }),
    split_field: schema.maybe(
      schema.string({
        minLength: 1,
        maxLength: 10000,
        meta: { description: 'The optional field used to split change point results.' },
      })
    ),
    partitions: schema.maybe(
      schema.arrayOf(schema.string({ minLength: 1, maxLength: 10000 }), {
        maxSize: 10000,
        meta: { description: 'Optional split field values to include in the panel.' },
      })
    ),
    max_series_to_plot: schema.number({
      defaultValue: CHANGE_POINT_CHART_DEFAULT_SERIES,
      min: 1,
      max: CHANGE_POINT_CHART_MAX_SERIES,
      validate: validateInteger,
      meta: {
        description: `The maximum number of change points to visualize. Defaults to ${CHANGE_POINT_CHART_DEFAULT_SERIES}.`,
      },
    }),
  },
  {
    validate: (value) => {
      if (value.partitions !== undefined && value.split_field === undefined) {
        return '`partitions` requires `split_field` to be set';
      }
    },
    meta: {
      id: 'aiops_change_point_chart',
      description: 'Change point detection chart embeddable schema',
    },
  }
);

export type ChangePointChartEmbeddableState = TypeOf<typeof changePointChartEmbeddableStateSchema>;

export type ChangePointAggregationFunction = TypeOf<typeof aggregationFunctionSchema>;
