/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { DEFAULT_RANGE_SLIDER_STATE } from '@kbn/controls-constants';
import { dataControlEsqlVariantProps, dataControlFieldVariantProps } from './control_schema';

export const rangeValueSchema = schema.arrayOf(schema.string(), {
  minSize: 2,
  maxSize: 2,
  meta: {
    description:
      'The selected range as a two-element array of strings representing the lower and upper bound values, for example `["10", "50"]`.',
  },
});

const rangeSliderExtras = {
  value: schema.maybe(rangeValueSchema),
  step: schema.number({
    defaultValue: DEFAULT_RANGE_SLIDER_STATE.step,
    min: 0,
    meta: {
      description: 'The step size between selectable range values.',
    },
  }),
};

export const rangeSliderControlSchema = schema.discriminatedUnion('values_source', [
  schema.object(
    { ...dataControlEsqlVariantProps, ...rangeSliderExtras },
    {
      meta: {
        id: 'kbn-controls-schemas-range-slider-control-schema-esql',
        title: 'EsqlRangeSliderControl',
        description: "A range slider control whose values come from an ES|QL query's results.",
      },
    }
  ),
  schema.object(
    { ...dataControlFieldVariantProps, ...rangeSliderExtras },
    {
      meta: {
        id: 'kbn-controls-schemas-range-slider-control-schema-field',
        title: 'FieldRangeSliderControl',
        description: 'A range slider control whose values come from a numeric data view field.',
      },
    }
  ),
]);
