/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { ExpressionFunctionDefinition } from '@kbn/expressions-plugin/common';
import type { AggExpressionType, AggExpressionFunctionArgs } from '..';
import { METRIC_TYPES } from '..';

export const aggSinglePercentileRankFnName = 'aggSinglePercentileRank';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof METRIC_TYPES.SINGLE_PERCENTILE_RANK>;
type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggSinglePercentileRankFnName,
  Input,
  AggArgs,
  Output
>;

export const aggSinglePercentileRank = (): FunctionDefinition => ({
  name: aggSinglePercentileRankFnName,
  help: i18n.translate('data.search.aggs.function.metrics.singlePercentileRank.help', {
    defaultMessage: 'Generates a serialized agg config for a single percentile rank agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.singlePercentileRank.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.metrics.singlePercentileRank.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.singlePercentileRank.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.metrics.singlePercentileRank.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    value: {
      types: ['number'],
      required: true,
      help: i18n.translate('data.search.aggs.metrics.singlePercentileRank.value.help', {
        defaultMessage: 'Percentile rank value to fetch',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.singlePercentileRank.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.singlePercentileRank.customLabel.help', {
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
        type: METRIC_TYPES.SINGLE_PERCENTILE_RANK,
        params: {
          ...rest,
        },
      },
    };
  },
});
