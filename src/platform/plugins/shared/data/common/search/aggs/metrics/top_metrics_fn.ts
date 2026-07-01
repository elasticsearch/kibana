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

export const aggTopMetricsFnName = 'aggTopMetrics';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof METRIC_TYPES.TOP_METRICS>;
type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggTopMetricsFnName,
  Input,
  AggArgs,
  Output
>;

export const aggTopMetrics = (): FunctionDefinition => ({
  name: aggTopMetricsFnName,
  help: i18n.translate('data.search.aggs.function.metrics.topMetrics.help', {
    defaultMessage: 'Generates a serialized aggregation configuration for Top metrics.',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.topMetrics.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.metrics.topMetrics.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.topMetrics.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.metrics.topMetrics.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    size: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.metrics.topMetrics.size.help', {
        defaultMessage: 'Number of top values to retrieve',
      }),
    },
    sortOrder: {
      types: ['string'],
      options: ['desc', 'asc'],
      help: i18n.translate('data.search.aggs.metrics.topMetrics.sortOrder.help', {
        defaultMessage: 'Order in which to return the results: asc or desc',
      }),
    },
    sortField: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.topMetrics.sortField.help', {
        defaultMessage: 'Field to order results by',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.topMetrics.json.help', {
        defaultMessage: 'Advanced JSON to include when the aggregation is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.metrics.topMetrics.customLabel.help', {
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
        type: METRIC_TYPES.TOP_METRICS,
        params: {
          ...rest,
        },
      },
    };
  },
});
