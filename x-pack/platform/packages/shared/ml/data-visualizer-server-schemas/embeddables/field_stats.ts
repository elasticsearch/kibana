/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';
import {
  serializedTimeRangeSchema,
  serializedTitlesSchema,
} from '@kbn/presentation-publishing-schemas';

const baseProps = {
  ...serializedTitlesSchema.getPropSchemas(),
  ...serializedTimeRangeSchema.getPropSchemas(),
  show_distributions: schema.boolean({
    defaultValue: false,
    meta: { description: 'Whether to show the distribution mini-charts in the table.' },
  }),
};

const fieldStatsDataViewSchema = schema.object({
  ...baseProps,
  view_type: schema.literal('dataview'),
  data_view_id: schema.string({
    minLength: 1,
    maxLength: 1000,
    meta: { description: 'Data view ID (stored as a panel reference).' },
  }),
});

const fieldStatsEsqlSchema = schema.object({
  ...baseProps,
  view_type: schema.literal('esql'),
  query: schema.object(
    { esql: schema.string({ maxLength: 1000, meta: { description: 'The ES|QL query string.' } }) },
    { meta: { description: 'ES|QL query.' } }
  ),
});

export const fieldStatsTableEmbeddableSchema = schema.oneOf(
  [fieldStatsDataViewSchema, fieldStatsEsqlSchema],
  {
    meta: {
      id: 'data_visualizer_field_stats',
      description: 'Field statistics table embeddable schema',
    },
  }
);

export type FieldStatsTableEmbeddableState = TypeOf<typeof fieldStatsTableEmbeddableSchema>;
