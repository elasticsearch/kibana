/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import { i18n } from '@kbn/i18n';
import type { Assign } from '@kbn/utility-types';
import type { ExpressionFunctionDefinition } from '@kbn/expressions-plugin/common';
import type { ExtendedBoundsOutput } from '../../expressions';
import type { AggExpressionType, AggExpressionFunctionArgs } from '..';
import { BUCKET_TYPES } from '..';

export const aggHistogramFnName = 'aggHistogram';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.HISTOGRAM>;

type Arguments = Assign<AggArgs, { extended_bounds?: ExtendedBoundsOutput }>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggHistogramFnName,
  Input,
  Arguments,
  Output
>;

export const aggHistogram = (): FunctionDefinition => ({
  name: aggHistogramFnName,
  help: i18n.translate('data.search.aggs.function.buckets.histogram.help', {
    defaultMessage: 'Generates a serialized agg config for a Histogram agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.histogram.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.histogram.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.histogram.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.buckets.histogram.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    interval: {
      types: ['number', 'string'],
      required: true,
      help: i18n.translate('data.search.aggs.buckets.histogram.interval.help', {
        defaultMessage: 'Interval to use for this aggregation',
      }),
    },
    intervalBase: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.histogram.intervalBase.help', {
        defaultMessage: 'IntervalBase to use for this aggregation',
      }),
    },
    min_doc_count: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.histogram.minDocCount.help', {
        defaultMessage: 'Specifies whether to use min_doc_count for this aggregation',
      }),
    },
    maxBars: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.histogram.maxBars.help', {
        defaultMessage: 'Calculate interval to get approximately this many bars',
      }),
    },
    autoExtendBounds: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.histogram.autoExtendBounds.help', {
        defaultMessage:
          'Set to true to extend bounds to the domain of the data. This makes sure each interval bucket within these bounds will create a separate table row',
      }),
    },
    has_extended_bounds: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.histogram.hasExtendedBounds.help', {
        defaultMessage: 'Specifies whether to use has_extended_bounds for this aggregation',
      }),
    },
    extended_bounds: {
      types: ['extended_bounds'],
      help: i18n.translate('data.search.aggs.buckets.histogram.extendedBounds.help', {
        defaultMessage:
          'With extended_bounds setting, you now can "force" the histogram aggregation to start building buckets on a specific min value and also keep on building buckets up to a max value ',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.histogram.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.histogram.customLabel.help', {
        defaultMessage: 'Represents a custom label for this aggregation',
      }),
    },
  },
  fn: (input, { id, enabled, schema, extended_bounds: extendedBounds, ...params }) => {
    return {
      type: 'agg_type',
      value: {
        id,
        enabled,
        schema,
        params: {
          ...params,
          extended_bounds: extendedBounds && omit(extendedBounds, 'type'),
        },
        type: BUCKET_TYPES.HISTOGRAM,
      },
    };
  },
});
