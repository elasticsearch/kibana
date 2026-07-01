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

import type { GeoBoundingBoxOutput, KibanaQueryOutput } from '../../expressions';
import type { AggExpressionType, AggExpressionFunctionArgs } from '..';
import { BUCKET_TYPES } from '..';

export const aggFilterFnName = 'aggFilter';

type Input = unknown;
type AggArgs = AggExpressionFunctionArgs<typeof BUCKET_TYPES.FILTER>;

type Arguments = Assign<
  AggArgs,
  { geo_bounding_box?: GeoBoundingBoxOutput; filter?: KibanaQueryOutput }
>;

type Output = AggExpressionType;
type FunctionDefinition = ExpressionFunctionDefinition<
  typeof aggFilterFnName,
  Input,
  Arguments,
  Output
>;

export const aggFilter = (): FunctionDefinition => ({
  name: aggFilterFnName,
  help: i18n.translate('data.search.aggs.function.buckets.filter.help', {
    defaultMessage: 'Generates a serialized agg config for a Filter agg',
  }),
  type: 'agg_type',
  args: {
    id: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.filter.id.help', {
        defaultMessage: 'ID for this aggregation',
      }),
    },
    enabled: {
      types: ['boolean'],
      default: true,
      help: i18n.translate('data.search.aggs.buckets.filter.enabled.help', {
        defaultMessage: 'Specifies whether this aggregation should be enabled',
      }),
    },
    schema: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.filter.schema.help', {
        defaultMessage: 'Schema to use for this aggregation',
      }),
    },
    geo_bounding_box: {
      types: ['geo_bounding_box'],
      help: i18n.translate('data.search.aggs.buckets.filter.geoBoundingBox.help', {
        defaultMessage: 'Filter results based on a point location within a bounding box',
      }),
    },
    filter: {
      types: ['kibana_query'],
      help: i18n.translate('data.search.aggs.buckets.filter.filter.help', {
        defaultMessage:
          'Filter results based on a kql or lucene query. Do not use together with geo_bounding_box',
      }),
    },
    timeWindow: {
      types: ['string'],
      help: '',
    },
    timeShift: {
      types: ['string'],
      help: '',
    },
    json: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.filter.json.help', {
        defaultMessage: 'Advanced json to include when the agg is sent to Elasticsearch',
      }),
    },
    customLabel: {
      types: ['string'],
      help: i18n.translate('data.search.aggs.buckets.filter.customLabel.help', {
        defaultMessage: 'Represents a custom label for this aggregation',
      }),
    },
  },
  fn: (input, { id, enabled, schema, geo_bounding_box: geoBoundingBox, filter, ...params }) => {
    if (geoBoundingBox && filter) {
      throw new Error("filter and geo_bounding_box can't be used together");
    }

    return {
      type: 'agg_type',
      value: {
        id,
        enabled,
        schema,
        params: {
          ...params,
          geo_bounding_box: geoBoundingBox && omit(geoBoundingBox, 'type'),
          filter: filter && omit(filter, 'type'),
        },
        type: BUCKET_TYPES.FILTER,
      },
    };
  },
});
