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

export const aggPercentileRanksFnName = 'aggPercentileRanks';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof METRIC_TYPES.PERCENTILE_RANKS>;
type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggPercentileRanksFnName,
  Input,
  AggArgs,
  Output
>;

export const aggPercentileRanks = (): FunctionDefinition => ({
  name: aggPercentileRanksFnName,
  help: i18n.translate('data.search.aggs.function.metrics.percentile_ranks.help', {
    defaultMessage: 'Generates a serialized agg config for a Percentile Ranks agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.percentile_ranks.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.metrics.percentile_ranks.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.percentile_ranks.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.metrics.percentile_ranks.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    values: {
      types: ['number'],
      multi: true,
      help: i18n.translate('data.search.aggs.metrics.percentile_ranks.values.help', {
        defaultMessage: 'Range of percentiles ranks',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.percentile_ranks.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.percentile_ranks.customLabel.help', {
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
        type: METRIC_TYPES.PERCENTILE_RANKS,
        params: {
          ...rest,
        },
      },
    };
  },
});
