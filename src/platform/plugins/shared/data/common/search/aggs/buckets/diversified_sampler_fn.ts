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
import type { AggExpressionFunctionArgs, AggExpressionType, BUCKET_TYPES } from '..';
import { DIVERSIFIED_SAMPLER_AGG_NAME } from './diversified_sampler';

export const aggDiversifiedSamplerFnName = 'aggDiversifiedSampler';

type Input = unknown;
type Arguments = AggExpressionFunctionArgs<typeof BUCKET_TYPES.DIVERSIFIED_SAMPLER>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggDiversifiedSamplerFnName,
  Input,
  Arguments,
  Output
>;

export const aggDiversifiedSampler = (): FunctionDefinition => ({
  name: aggDiversifiedSamplerFnName,
  help: i18n.translate('data.search.aggs.function.buckets.diversifiedSampler.help', {
    defaultMessage: 'Generates a serialized agg config for a Diversified sampler agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.diversifiedSampler.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.diversifiedSampler.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.diversifiedSampler.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    shard_size: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.diversifiedSampler.shardSize.help', {
        defaultMessage:
          'The shard_size parameter limits how many top-scoring documents are collected in the sample processed on each shard.',
      }),
    },
    max_docs_per_value: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.diversifiedSampler.maxDocsPerValue.help', {
        defaultMessage:
          'Limits how many documents are permitted per choice of de-duplicating value.',
      }),
    },
    field: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.diversifiedSampler.field.help', {
        defaultMessage: 'Used to provide values used for de-duplication.',
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
        type: DIVERSIFIED_SAMPLER_AGG_NAME,
        params: {
          ...rest,
        },
      },
    };
  },
});
