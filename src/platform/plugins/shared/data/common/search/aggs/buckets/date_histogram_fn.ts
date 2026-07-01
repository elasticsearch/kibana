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
import type { ExtendedBoundsOutput, KibanaTimerangeOutput } from '../../expressions';
import type { AggExpressionType, AggExpressionFunctionArgs } from '..';
import { BUCKET_TYPES } from '..';

export const aggDateHistogramFnName = 'aggDateHistogram';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.DATE_HISTOGRAM>;

type Arguments = Assign<
  AggArgs,
  { timeRange?: KibanaTimerangeOutput; extended_bounds?: ExtendedBoundsOutput }
>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggDateHistogramFnName,
  Input,
  Arguments,
  Output
>;

export const aggDateHistogram = (): FunctionDefinition => ({
  name: aggDateHistogramFnName,
  help: i18n.translate('data.search.aggs.function.buckets.dateHistogram.help', {
    defaultMessage: 'Generates a serialized agg config for a Histogram agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    useNormalizedEsInterval: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.useNormalizedEsInterval.help', {
        defaultMessage: 'Specifies whether to use useNormalizedEsInterval for this aggregation',
      }),
    },
    time_zone: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.timeZone.help', {
        defaultMessage: 'Time zone to use for this aggregation',
      }),
    },
    format: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.format.help', {
        defaultMessage: 'Format to use for this aggregation',
      }),
    },
    scaleMetricValues: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.scaleMetricValues.help', {
        defaultMessage: 'Specifies whether to use scaleMetricValues for this aggregation',
      }),
    },
    interval: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.interval.help', {
        defaultMessage: 'Interval to use for this aggregation',
      }),
    },
    timeRange: {
      types: ['timerange'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.timeRange.help', {
        defaultMessage: 'Time Range to use for this aggregation',
      }),
    },
    min_doc_count: {
      types: ['number'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.minDocCount.help', {
        defaultMessage: 'Minimum document count to use for this aggregation',
      }),
    },
    drop_partials: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.dropPartials.help', {
        defaultMessage: 'Specifies whether to use drop_partials for this aggregation',
      }),
    },
    extended_bounds: {
      types: ['extended_bounds'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.extendedBounds.help', {
        defaultMessage:
          'With extended_bounds setting, you now can "force" the histogram aggregation to start building buckets on a specific min value and also keep on building buckets up to a max value ',
      }),
    },
    extendToTimeRange: {
      types: ['boolean'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.extendToTimeRange.help', {
        defaultMessage:
          'Auto-sets the extended bounds to the currently applied time range. Is ignored if extended_bounds is set',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.dateHistogram.customLabel.help', {
        defaultMessage: 'Represents a custom label for this aggregation',
      }),
    },
  },
  fn: (input, { id, enabled, schema, timeRange, extended_bounds: extendedBounds, ...params }) => {
    return {
      type: 'agg_type',
      value: {
        id,
        enabled,
        schema,
        params: {
          ...params,
          timeRange: timeRange && omit(timeRange, 'type'),
          extended_bounds: extendedBounds && omit(extendedBounds, 'type'),
        },
        type: BUCKET_TYPES.DATE_HISTOGRAM,
      },
    };
  },
});
