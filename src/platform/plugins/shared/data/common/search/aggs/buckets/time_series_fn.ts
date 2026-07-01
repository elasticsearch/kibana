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
import { BUCKET_TYPES } from '..';

export const aggTimeSeriesFnName = 'aggTimeSeries';

type Input = unknown;
type Output = AggExpressionType;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.TIME_SERIES>;

type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggTimeSeriesFnName,
  Input,
  AggArgs,
  Output
>;

export const aggTimeSeries = (): FunctionDefinition => ({
  name: aggTimeSeriesFnName,
  help: i18n.translate('data.search.aggs.function.buckets.timeSeries.help', {
    defaultMessage: 'Generates a serialized agg config for a Time Series agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.timeSeries.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.timeSeries.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.timeSeries.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.terms.customLabel.help', {
        defaultMessage: 'Represents a custom label for this aggregation',
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
        type: BUCKET_TYPES.TIME_SERIES,
        params: {
          ...rest,
        },
      },
    };
  },
});
