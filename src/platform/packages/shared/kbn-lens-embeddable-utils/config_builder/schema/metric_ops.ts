/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { omit } from 'lodash';
import { filterSchema } from './filter';
import { esqlFormatSchema, formatSchema } from './format';
import {
  LENS_LAST_VALUE_DEFAULT_MULTI_VALUE,
  LENS_MOVING_AVERAGE_DEFAULT_WINDOW,
  LENS_PERCENTILE_DEFAULT_VALUE,
  LENS_PERCENTILE_RANK_DEFAULT_VALUE,
  LENS_STATIC_VALUE_DEFAULT,
} from './constants';
import { LENS_EMPTY_AS_NULL_DEFAULT_VALUE } from '../transforms/columns/utils';
import { labelSharedProp } from './shared';

export const genericOperationOptionsSchema = schema.object({
  ...formatSchema,
  ...labelSharedProp,
});

export const METRIC_OP_TITLES = {
  static: 'Static Operation Definition',
  formula: 'Formula Operation',
  count: 'Count Metric Operation',
  uniqueCount: 'Unique Count Metric Operation',
  stats: 'Stats Metric Operation',
  sum: 'Sum Metric Operation',
  lastValue: 'Last Value Operation',
  percentile: 'Percentile Operation',
  percentileRanks: 'Percentile Ranks Operation',
  differences: 'Differences Operation',
  movingAverage: 'Moving Average Operation',
  cumulativeSum: 'Cumulative Sum Operation',
  counterRate: 'Counter Rate Operation',
} as const;

export const staticOperationDefinitionSchema = genericOperationOptionsSchema.extends(
  {
    operation: schema.literal('static_value'),
    /**
     * Static value
     */
    value: schema.number({
      meta: {
        description: 'Static value',
      },
      defaultValue: LENS_STATIC_VALUE_DEFAULT,
    }),
  },
  { meta: { id: 'staticOperationDefinition', title: METRIC_OP_TITLES.static } }
);

const advancedOperationSettings = {
  /**
   * Reduced time range
   */
  reduced_time_range: schema.maybe(
    schema.string({
      meta: {
        id: 'operationReducedTimeRangeSetting',
        title: 'Operation Reduced Time Range Setting',
        description: 'Reduced time range',
      },
    })
  ),
  /**
   * Time shift
   */
  time_shift: schema.maybe(
    schema.string({
      meta: {
        id: 'operationTimeShiftSetting',
        title: 'Operation Time Shift Setting',
        description: 'Time shift',
      },
    })
  ),
  /**
   * Filter
   */
  filter: schema.maybe(filterSchema),
  /**
   * Time scale
   */
  time_scale: schema.maybe(
    schema.oneOf(
      [schema.literal('s'), schema.literal('m'), schema.literal('h'), schema.literal('d')],
      {
        meta: {
          id: 'operationTimeScaleSetting',
          title: 'Operation Time Scale Setting',
          description: 'Time scale',
        },
      }
    )
  ),
};

export const formulaOperationDefinitionSchema = genericOperationOptionsSchema.extends(
  {
    operation: schema.literal('formula'),
    /**
     * Formula
     */
    formula: schema.string({
      meta: {
        description: 'Formula',
      },
    }),
    ...omit(advancedOperationSettings, ['time_shift']),
    /**
     * Custom scaling for the entire formula
     */
    time_scale: schema.maybe(
      schema.oneOf(
        [schema.literal('s'), schema.literal('m'), schema.literal('h'), schema.literal('d')],
        { meta: { description: 'Time scale' } }
      )
    ),
  },
  { meta: { id: 'formulaOperation', title: METRIC_OP_TITLES.formula } }
);

const esqlColumn = {
  column: schema.string({
    meta: {
      description: 'Column to use',
    },
  }),
};

export const esqlColumnSchema = schema.object({
  ...esqlColumn,
  ...labelSharedProp,
});

export const esqlColumnWithFormatSchema = esqlColumnSchema.extends(esqlFormatSchema);

export const metricOperationSharedSchema =
  genericOperationOptionsSchema.extends(advancedOperationSettings);

export const fieldBasedOperationSharedSchema = metricOperationSharedSchema.extends({
  /**
   * Field to be used for the metric
   */
  field: schema.string({ meta: { description: 'Field to be used for the metric' } }),
});

const emptyAsNullSchemaRawObject = {
  /**
   * Whether to consider null values as null
   */
  empty_as_null: schema.boolean({
    meta: {
      description: 'When `true`, treats empty buckets as null instead of zero.',
    },
    defaultValue: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
  }),
};

export const countMetricOperationSchema = fieldBasedOperationSharedSchema
  .extends(emptyAsNullSchemaRawObject)
  .extends(
    {
      /**
       * Select the operation type
       */
      operation: schema.literal('count'),
      field: schema.maybe(
        schema.string({ meta: { description: 'Field to be used for the metric' } })
      ),
    },
    { meta: { id: 'countMetricOperation', title: METRIC_OP_TITLES.count } }
  );

export const uniqueCountMetricOperationSchema = fieldBasedOperationSharedSchema
  .extends(emptyAsNullSchemaRawObject)
  .extends(
    {
      operation: schema.literal('unique_count'),
    },
    { meta: { id: 'uniqueCountMetricOperation', title: METRIC_OP_TITLES.uniqueCount } }
  );

export const metricOperationSchema = fieldBasedOperationSharedSchema.extends(
  {
    operation: schema.oneOf([
      schema.literal('min'),
      schema.literal('max'),
      schema.literal('average'),
      schema.literal('median'),
      schema.literal('standard_deviation'),
    ]),
  },
  { meta: { id: 'minMaxAvgMedianStdDevMetricOperation', title: METRIC_OP_TITLES.stats } }
);

export const sumMetricOperationSchema = fieldBasedOperationSharedSchema
  .extends(emptyAsNullSchemaRawObject)
  .extends(
    {
      operation: schema.literal('sum'),
    },
    { meta: { id: 'sumMetricOperation', title: METRIC_OP_TITLES.sum } }
  );

export const lastValueOperationSchema = fieldBasedOperationSharedSchema.extends(
  {
    operation: schema.literal('last_value'),
    time_field: schema.string({
      meta: { description: 'Time field used to determine document recency' },
    }),
    /**
     * Whether to return all values for multi-value fields.
     * Only affects data table and metric charts; other charts use the last value from the array.
     */
    multi_value: schema.boolean({
      meta: {
        description:
          'Whether to return all values for multi-value fields. Only affects data table and metric charts; other charts use the last value from the array.',
      },
      defaultValue: LENS_LAST_VALUE_DEFAULT_MULTI_VALUE,
    }),
  },
  { meta: { id: 'lastValueOperation', title: METRIC_OP_TITLES.lastValue } }
);

export const percentileOperationSchema = fieldBasedOperationSharedSchema.extends(
  {
    operation: schema.literal('percentile'),
    percentile: schema.number({
      meta: { description: 'Percentile' },
      defaultValue: LENS_PERCENTILE_DEFAULT_VALUE,
    }),
  },
  { meta: { id: 'percentileOperation', title: METRIC_OP_TITLES.percentile } }
);

export const percentileRanksOperationSchema = fieldBasedOperationSharedSchema.extends(
  {
    operation: schema.literal('percentile_rank'),
    rank: schema.number({
      meta: { description: 'Percentile Rank' },
      defaultValue: LENS_PERCENTILE_RANK_DEFAULT_VALUE,
    }),
  },
  { meta: { id: 'percentileRanksOperation', title: METRIC_OP_TITLES.percentileRanks } }
);

export const fieldMetricOperationsSchema = schema.oneOf(
  [
    countMetricOperationSchema,
    uniqueCountMetricOperationSchema,
    metricOperationSchema,
    sumMetricOperationSchema,
    lastValueOperationSchema,
    percentileOperationSchema,
    percentileRanksOperationSchema,
  ],
  { meta: { id: 'fieldMetricOperations', title: 'Field Metric Operations' } }
);

export const differencesOperationSchema = metricOperationSharedSchema.extends(
  {
    operation: schema.literal('differences'),
    of: fieldMetricOperationsSchema,
  },
  { meta: { id: 'differencesOperation', title: METRIC_OP_TITLES.differences } }
);

export const movingAverageOperationSchema = metricOperationSharedSchema.extends(
  {
    operation: schema.literal('moving_average'),
    of: fieldMetricOperationsSchema,
    window: schema.number({
      meta: { description: 'Window' },
      defaultValue: LENS_MOVING_AVERAGE_DEFAULT_WINDOW,
    }),
  },
  { meta: { id: 'movingAverageOperation', title: METRIC_OP_TITLES.movingAverage } }
);

export const cumulativeSumOperationSchema = metricOperationSharedSchema.extends(
  {
    operation: schema.literal('cumulative_sum'),
    field: schema.maybe(
      schema.string({
        meta: {
          description:
            'Field to cumulatively sum. When omitted, cumulative sum is applied to the count of records.',
        },
      })
    ),
  },
  { meta: { id: 'cumulativeSumOperation', title: METRIC_OP_TITLES.cumulativeSum } }
);

export const counterRateOperationSchema = fieldBasedOperationSharedSchema.extends(
  {
    operation: schema.literal('counter_rate'),
  },
  { meta: { id: 'counterRateOperation', title: METRIC_OP_TITLES.counterRate } }
);

export const metricOperationDefinitionSchema = schema.oneOf(
  [
    formulaOperationDefinitionSchema,
    staticOperationDefinitionSchema,
    fieldMetricOperationsSchema,
    differencesOperationSchema,
    movingAverageOperationSchema,
    cumulativeSumOperationSchema,
    counterRateOperationSchema,
    countMetricOperationSchema,
    uniqueCountMetricOperationSchema,
    lastValueOperationSchema,
    percentileOperationSchema,
    percentileRanksOperationSchema,
  ],
  {
    meta: {
      title: 'Metric Operation',
      description:
        'Metric dimension configuration, supporting field-based aggregations (count, sum, average, median, standard deviation, unique count, last value), percentile operations, time-series operations (differences, moving average, cumulative sum, counter rate), and mathematical formulas.',
    },
  }
);

export type LensApiAllMetricOperations = TypeOf<typeof metricOperationDefinitionSchema>;
export const fieldMetricOrFormulaOperationDefinitionSchema = schema.oneOf(
  [fieldMetricOperationsSchema, formulaOperationDefinitionSchema],
  {
    meta: {
      title: 'Field Metric or Formula Operation',
      description: 'Metric dimension using a field-based aggregation or a mathematical formula.',
    },
  }
);

export const fieldMetricOrStaticOrFormulaOperationDefinitionSchema = schema.oneOf(
  [fieldMetricOperationsSchema, staticOperationDefinitionSchema, formulaOperationDefinitionSchema],
  {
    meta: {
      title: 'Field Metric, Static Value, or Formula Operation',
      description:
        'Metric dimension using a field-based aggregation, a static value, or a mathematical formula.',
    },
  }
);

export type LensApiReferableMetricOperations =
  | LensApiCountMetricOperation
  | LensApiUniqueCountMetricOperation
  | LensApiMetricOperation
  | LensApiSumMetricOperation
  | LensApiLastValueOperation
  | LensApiPercentileOperation
  | LensApiPercentileRanksOperation;
export type LensApiFieldMetricOperations = TypeOf<typeof fieldMetricOperationsSchema>;

export type LensApiCountMetricOperation = TypeOf<typeof countMetricOperationSchema>;
export type LensApiUniqueCountMetricOperation = TypeOf<typeof uniqueCountMetricOperationSchema>;
export type LensApiMetricOperation = TypeOf<typeof metricOperationSchema>;
export type LensApiSumMetricOperation = TypeOf<typeof sumMetricOperationSchema>;
export type LensApiLastValueOperation = TypeOf<typeof lastValueOperationSchema>;
export type LensApiPercentileOperation = TypeOf<typeof percentileOperationSchema>;
export type LensApiPercentileRanksOperation = TypeOf<typeof percentileRanksOperationSchema>;
export type LensApiDifferencesOperation = TypeOf<typeof differencesOperationSchema>;
export type LensApiMovingAverageOperation = TypeOf<typeof movingAverageOperationSchema>;
export type LensApiCumulativeSumOperation = TypeOf<typeof cumulativeSumOperationSchema>;
export type LensApiCounterRateOperation = TypeOf<typeof counterRateOperationSchema>;
export type LensApiFormulaOperation = TypeOf<typeof formulaOperationDefinitionSchema>;
export type LensApiStaticValueOperation = TypeOf<typeof staticOperationDefinitionSchema>;

export type LensApiFieldMetricOrFormulaOperation =
  | LensApiFieldMetricOperations
  | LensApiFormulaOperation;

export type LensApiFieldMetricOrStaticOrFormulaOperation =
  | LensApiFieldMetricOperations
  | LensApiStaticValueOperation
  | LensApiFormulaOperation;

export type LensApiAllMetricOrFormulaOperations =
  | LensApiFieldMetricOperations
  | LensApiFormulaOperation
  | LensApiDifferencesOperation
  | LensApiMovingAverageOperation
  | LensApiCumulativeSumOperation
  | LensApiCounterRateOperation;

export type LensApiESQLColumn = TypeOf<typeof esqlColumnSchema>;
export type LensApiESQLColumnWithFormat = TypeOf<typeof esqlColumnWithFormatSchema>;
