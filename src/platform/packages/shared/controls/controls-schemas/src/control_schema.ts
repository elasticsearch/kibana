/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema, type Type } from '@kbn/config-schema';
import { ControlValuesSource, DEFAULT_DATA_CONTROL_STATE } from '@kbn/controls-constants';

export const controlTitleSchema = schema.object({
  title: schema.maybe(
    schema.string({
      meta: { description: 'A human-readable title for the control.' },
    })
  ),
});

const sharedDataControlProps = {
  ...controlTitleSchema.getPropSchemas(),
  use_global_filters: schema.boolean({
    defaultValue: DEFAULT_DATA_CONTROL_STATE.use_global_filters,
    meta: {
      description:
        "When `true`, the control's available options are narrowed by the page's active filters. Defaults to `true`.",
    },
  }),
  ignore_validations: schema.boolean({
    defaultValue: DEFAULT_DATA_CONTROL_STATE.ignore_validations,
    meta: {
      description:
        'When `true`, the control skips selection validation and does not report which selections are responsible for returning zero results. Defaults to `false`.',
    },
  }),
};

/**
 * This uses a oneOf with only one option so we can provide a default value for backwards compat
 */
export const dataControlFieldValuesSourceSchema = schema.oneOf(
  [schema.literal(ControlValuesSource.FIELD)],
  {
    defaultValue: ControlValuesSource.FIELD,
    meta: {
      description:
        'The source of the field options for this control. Defaults to `field` for legacy controls.',
    },
  }
) as Type<ControlValuesSource.FIELD>; // Cast this to be equivalent to schema.literal to avoid confusing Typescript downstream

export const dataControlFieldVariantProps = {
  ...sharedDataControlProps,
  values_source: dataControlFieldValuesSourceSchema,
  data_view_id: schema.string({
    meta: { description: 'The ID of the data view that provides field options for this control.' }, // this will generate a reference
    minLength: 1,
  }),
  field_name: schema.string({
    meta: { description: 'The name of the field in the data view that this control filters on.' },
    minLength: 1,
  }),
};

export const dataControlEsqlVariantProps = {
  ...sharedDataControlProps,
  values_source: schema.literal(ControlValuesSource.ESQL),
  esql_query: schema.string({
    meta: { description: 'The ES|QL query that provides field options for this control' },
    minLength: 1,
  }),
};

export const dataControlSchema = schema.discriminatedUnion(
  'values_source',
  [schema.object(dataControlEsqlVariantProps), schema.object(dataControlFieldVariantProps)],
  {
    meta: {
      description:
        'The source of the field options for this control, either `field` for all possible values of a field, or `esql` for the results of an ES|QL query. Defaults to `field`',
    },
  }
);
