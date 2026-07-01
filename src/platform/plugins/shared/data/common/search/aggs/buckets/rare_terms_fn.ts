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

export const aggRareTermsFnName = 'aggRareTerms';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.RARE_TERMS>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggRareTermsFnName,
  Input,
  AggArgs,
  Output
>;

export const aggRareTerms = (): FunctionDefinition => ({
  name: aggRareTermsFnName,
  help: i18n.translate('data.search.aggs.function.buckets.rareTerms.help', {
    defaultMessage: 'Generates a serialized agg config for a Rare-Terms agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.rareTerms.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.rareTerms.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.rareTerms.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.buckets.rareTerms.fields.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    max_doc_count: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.rareTerms.maxDocCount.help', {
        defaultMessage: 'Maximum number of times a term is allowed to occur to qualify as rare',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.multiTerms.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
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
        type: BUCKET_TYPES.RARE_TERMS,
        params: {
          ...rest,
        },
      },
    };
  },
});
