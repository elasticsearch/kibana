/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { groupBy, isEmpty, isNil, map, mapValues, omit, omitBy } from 'lodash';
import { i18n } from '@kbn/i18n';
import type { Assign } from '@kbn/utility-types';
import type { ExpressionFunctionDefinition } from '@kbn/expressions-plugin/common';
import type { AggExpressionType, AggExpressionFunctionArgs } from '..';
import { BUCKET_TYPES } from '..';
import type { CidrOutput, IpRangeOutput } from '../../expressions';

export const aggIpRangeFnName = 'aggIpRange';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.IP_RANGE>;

type Arguments = Assign<
  AggArgs,
  { ranges?: Array<CidrOutput | IpRangeOutput>; ipRangeType?: string }
>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggIpRangeFnName,
  Input,
  Arguments,
  Output
>;

export const aggIpRange = (): FunctionDefinition => ({
  name: aggIpRangeFnName,
  help: i18n.translate('data.search.aggs.function.buckets.ipRange.help', {
    defaultMessage: 'Generates a serialized agg config for a Ip Range agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.ipRange.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.ipRange.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.ipRange.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    field: {
      types: ['string'],
      required: true,
      help: i18n.translate('data.search.aggs.buckets.ipRange.field.help', {
        defaultMessage: 'Field to use for this aggregation',
      }),
    },
    ipRangeType: {
      types: ['string'],
      options: ['mask', 'fromTo'],
      help: i18n.translate('data.search.aggs.buckets.ipRange.ipRangeType.help', {
        defaultMessage:
          'IP range type to use for this aggregation. Takes one of the following values: mask, fromTo.',
      }),
    },
    ranges: {
      types: ['cidr', 'ip_range'],
      multi: true,
      help: i18n.translate('data.search.aggs.buckets.ipRange.ranges.help', {
        defaultMessage: 'Ranges to use for this aggregation.',
      }),
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.ipRange.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.ipRange.customLabel.help', {
        defaultMessage: 'Represents a custom label for this aggregation',
      }),
    },
  },
  fn: (input, { id, enabled, schema, ranges, ...params }) => {
    const { ip_range: fromTo, cidr: mask } = mapValues(groupBy(ranges, 'type'), (items) =>
      map(items, (item) => omit(item, 'type'))
    );
    const rangesParam = omitBy({ fromTo, mask }, isNil);

    return {
      type: 'agg_type',
      value: {
        id,
        enabled,
        schema,
        type: BUCKET_TYPES.IP_RANGE,
        params: {
          ...params,
          ranges: isEmpty(rangesParam) ? undefined : rangesParam,
        },
      },
    };
  },
});
