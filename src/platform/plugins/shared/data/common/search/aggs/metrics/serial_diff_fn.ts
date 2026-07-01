/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { Assign } from '@kbn/utility-types';
import type { ExpressionFunctionDefinition } from '@kbn/expressions-plugin/common';
import type { AggExpressionType, AggExpressionFunctionArgs } from '..';
import { METRIC_TYPES } from '..';

export const aggSerialDiffFnName = 'aggSerialDiff';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof METRIC_TYPES.SERIAL_DIFF>;
type Arguments = Assign<AggArgs, { customMetric?: AggExpressionType }>;
type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggSerialDiffFnName,
  Input,
  Arguments,
  Output
>;

export const aggSerialDiff = (): FunctionDefinition => ({
  name: aggSerialDiffFnName,
  help: i18n.translate('data.search.aggs.function.metrics.serial_diff.help', {
    defaultMessage: 'Generates a serialized agg config for a Serial Differencing agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.serial_diff.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.metrics.serial_diff.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.serial_diff.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    metricAgg: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.serial_diff.metricAgg.help', {
        defaultMessage:
          'Id for finding agg config to use for building parent pipeline aggregations',
      }),
    },
    customMetric: {
      types: ['agg_type'],
      help: i18n.translate('data.search.aggs.metrics.serial_diff.customMetric.help', {
        defaultMessage: 'Agg config to use for building parent pipeline aggregations',
      }),
    },
    buckets_path: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.serial_diff.buckets_path.help', {
        defaultMessage: 'Path to the metric of interest',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.serial_diff.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.serial_diff.customLabel.help', {
        defaultMessage: 'Represents a custom label for this aggregation',
      }),
    },
    timeShift: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.timeShift.help', {
        defaultMessage:
          'Shift the time range for the metric by a set time, for example 1h or 7d. "previous" will use the closest time range from the date histogram or time range filter.',
      }),
    },
  },
  fn: (input, args) => {
    const { id, enabled, schema, ...rest } = args;

    return {
      type: 'agg_type',
      value: {
        id,
        enabled,
        schema,
        type: METRIC_TYPES.SERIAL_DIFF,
        params: {
          ...rest,
          customMetric: args.customMetric?.value,
        },
      },
    };
  },
});
