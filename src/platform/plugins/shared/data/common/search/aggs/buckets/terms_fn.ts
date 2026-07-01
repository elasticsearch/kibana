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
import { BUCKET_TYPES } from '..';

export const aggTermsFnName = 'aggTerms';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.TERMS>;

// Since the orderAgg param is an agg nested in a subexpression, we need to
// overwrite the param type to expect a value of type AggExpressionType.
type Arguments = Assign<AggArgs, { orderAgg?: AggExpressionType }>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggTermsFnName,
  Input,
  Arguments,
  Output
>;

export const aggTerms = (): FunctionDefinition => ({
  name: aggTermsFnName,
  help: i18n.translate('data.search.aggs.function.buckets.terms.help', {
    defaultMessage: 'Generates a serialized agg config for a Terms agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.terms.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.terms.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.terms.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.buckets.terms.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    order: {
      types: ['string'],
      options: ['asc', 'desc'],
      help: i18n.translate('data.search.aggs.buckets.terms.order.help', {
        defaultMessage: 'Order in which to return the results: asc or desc',
      }),
    },
    orderBy: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.terms.orderBy.help', {
        defaultMessage: 'Field to order results by',
      }),
    },
    orderAgg: {
      types: ['agg_type'],
      help: i18n.translate('data.search.aggs.buckets.terms.orderAgg.help', {
        defaultMessage: 'Agg config to use for ordering results',
      }),
    },
    size: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.terms.size.help', {
        defaultMessage: 'Max number of buckets to retrieve',
      }),
    },
    shardSize: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.terms.shardSize.help', {
        defaultMessage: 'Number of terms to evaluate during the aggregation.',
      }),
    },
    missingBucket: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.terms.missingBucket.help', {
        defaultMessage: 'When set to true, groups together any buckets with missing fields',
      }),
    },
    missingBucketLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.terms.missingBucketLabel.help', {
        defaultMessage: 'Default label used in charts when documents are missing a field.',
      }),
    },
    otherBucket: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.terms.otherBucket.help', {
        defaultMessage: 'When set to true, groups together any buckets beyond the allowed size',
      }),
    },
    otherBucketLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.terms.otherBucketLabel.help', {
        defaultMessage: 'Default label used in charts for documents in the Other bucket',
      }),
    },
    exclude: {
      types: ['string', 'number'],
      help: i18n.translate('data.search.aggs.buckets.terms.exclude.help', {
        defaultMessage: 'Specific bucket values to exclude from results',
      }),
      multi: true,
    },
    include: {
      types: ['string', 'number'],
      help: i18n.translate('data.search.aggs.buckets.terms.include.help', {
        defaultMessage: 'Specific bucket values to include in results',
      }),
      multi: true,
    },
    includeIsRegex: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.terms.includeIsRegex.help', {
        defaultMessage: 'When set to true, the include property is handled as regex',
      }),
    },
    excludeIsRegex: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.terms.excludeIsRegex.help', {
        defaultMessage: 'When set to true, the exclude property is handled as regex',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.terms.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
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
        type: BUCKET_TYPES.TERMS,
        params: {
          ...rest,
          orderAgg: args.orderAgg?.value,
        },
      },
    };
  },
});
