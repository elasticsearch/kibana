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

export const aggTopHitFnName = 'aggTopHit';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof METRIC_TYPES.TOP_HITS>;
type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggTopHitFnName,
  Input,
  AggArgs,
  Output
>;

export const aggTopHit = (): FunctionDefinition => ({
  name: aggTopHitFnName,
  help: i18n.translate('data.search.aggs.function.metrics.top_hit.help', {
    defaultMessage: 'Generates a serialized agg config for a Top Hit agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.top_hit.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.metrics.top_hit.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.top_hit.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.metrics.top_hit.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    aggregate: {
      types: ['string'],
      required: true,
      options: ['min', 'max', 'sum', 'average', 'concat'],
      help: i18n.translate('data.search.aggs.metrics.top_hit.aggregate.help', {
        defaultMessage: 'Aggregate type',
      }),
    },
    size: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.metrics.top_hit.size.help', {
        defaultMessage: 'Max number of buckets to retrieve',
      }),
    },
    sortOrder: {
      types: ['string'],
      options: ['desc', 'asc'],
      help: i18n.translate('data.search.aggs.metrics.top_hit.sortOrder.help', {
        defaultMessage: 'Order in which to return the results: asc or desc',
      }),
    },
    sortField: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.top_hit.sortField.help', {
        defaultMessage: 'Field to order results by',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.top_hit.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.top_hit.customLabel.help', {
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
        type: METRIC_TYPES.TOP_HITS,
        params: {
          ...rest,
        },
      },
    };
  },
});
