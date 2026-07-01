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
import type { AggExpressionType, AggConfigSerialized } from '..';
import type { AggParamsShardDelay } from './shard_delay';
import { SHARD_DELAY_AGG_NAME } from './shard_delay';

export const aggShardDelayFnName = 'aggShardDelay';

type Input = unknown;
type Arguments = AggParamsShardDelay & Pick<AggConfigSerialized, 'id' | 'enabled' | 'schema'>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggShardDelayFnName,
  Input,
  Arguments,
  Output
>;

export const aggShardDelay = (): FunctionDefinition => ({
  name: aggShardDelayFnName,
  help: i18n.translate('data.search.aggs.function.buckets.shardDelay.help', {
    defaultMessage: 'Generates a serialized agg config for a Shard Delay agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.shardDelay.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.shardDelay.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.shardDelay.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    delay: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.shardDelay.delay.help', {
        defaultMessage: 'Delay between shards to process. Example: "5s".',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.shardDelay.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.shardDelay.customLabel.help', {
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
        type: SHARD_DELAY_AGG_NAME,
        params: {
          ...rest,
        },
      },
    };
  },
});
