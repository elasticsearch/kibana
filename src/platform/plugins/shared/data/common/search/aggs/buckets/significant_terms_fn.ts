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

export const aggSignificantTermsFnName = 'aggSignificantTerms';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.SIGNIFICANT_TERMS>;

type Arguments = AggArgs;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggSignificantTermsFnName,
  Input,
  Arguments,
  Output
>;

export const aggSignificantTerms = (): FunctionDefinition => ({
  name: aggSignificantTermsFnName,
  help: i18n.translate('data.search.aggs.function.buckets.significantTerms.help', {
    defaultMessage: 'Generates a serialized agg config for a Significant Terms agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.significantTerms.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.significantTerms.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.significantTerms.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.buckets.significantTerms.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    size: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.significantTerms.size.help', {
        defaultMessage: 'Max number of buckets to retrieve',
      }),
    },
    shardSize: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.significantTerms.shardSize.help', {
        defaultMessage: 'Number of terms provided by each shard and returned to coordinating node',
      }),
    },
    exclude: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.significantTerms.exclude.help', {
        defaultMessage: 'Specific bucket values to exclude from results',
      }),
      multi: true,
    },
    include: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.significantTerms.include.help', {
        defaultMessage: 'Specific bucket values to include in results',
      }),
      multi: true,
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.significantTerms.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.significantTerms.customLabel.help', {
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
        type: BUCKET_TYPES.SIGNIFICANT_TERMS,
        params: {
          ...rest,
        },
      },
    };
  },
});
