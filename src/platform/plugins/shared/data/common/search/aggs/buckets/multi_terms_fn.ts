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

export const aggMultiTermsFnName = 'aggMultiTerms';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.MULTI_TERMS>;

// Since the orderAgg param is an agg nested in a subexpression, we need to
// overwrite the param type to expect a value of type AggExpressionType.
type Arguments = Assign<AggArgs, { orderAgg?: AggExpressionType }>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggMultiTermsFnName,
  Input,
  Arguments,
  Output
>;

export const aggMultiTerms = (): FunctionDefinition => ({
  name: aggMultiTermsFnName,
  help: i18n.translate('data.search.aggs.function.buckets.multiTerms.help', {
    defaultMessage: 'Generates a serialized agg config for a Multi-Terms agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.multiTerms.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    fields: {
      types: ['string'],
      multi: true,
      required: true,
      help: i18n.translate('data.search.aggs.buckets.multiTerms.fields.help', {
        defaultMessage: 'Fields to use for this aggregation',
      }),
    },
    order: {
      types: ['string'],
      options: ['asc', 'desc'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.order.help', {
        defaultMessage: 'Order in which to return the results: asc or desc',
      }),
    },
    orderBy: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.orderBy.help', {
        defaultMessage: 'Field to order results by',
      }),
    },
    orderAgg: {
      types: ['agg_type'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.orderAgg.help', {
        defaultMessage: 'Agg config to use for ordering results',
      }),
    },
    size: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.size.help', {
        defaultMessage: 'Max number of buckets to retrieve',
      }),
    },
    shardSize: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.terms.shardSize.help', {
        defaultMessage: 'Number of terms to evaluate during the aggregation.',
      }),
    },
    otherBucket: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.otherBucket.help', {
        defaultMessage: 'When set to true, groups together any buckets beyond the allowed size',
      }),
    },
    otherBucketLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.otherBucketLabel.help', {
        defaultMessage: 'Default label used in charts for documents in the Other bucket',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.customLabel.help', {
        defaultMessage: 'Represents a custom label for this aggregation',
      }),
    },
    separatorLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.separatorLabel.help', {
        defaultMessage: 'The separator label used to join each term combination',
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
        type: BUCKET_TYPES.MULTI_TERMS,
        params: {
          ...rest,
          orderAgg: args.orderAgg?.value,
        },
      },
    };
  },
});
