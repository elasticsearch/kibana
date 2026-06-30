/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const componentTemplateSchema = schema.object({
  name: schema.string({ maxLength: 1000 }),
  template: schema.object({
    settings: schema.maybe(schema.object({}, { unknowns: 'allow' })),
    aliases: schema.maybe(schema.object({}, { unknowns: 'allow' })),
    mappings: schema.maybe(schema.object({}, { unknowns: 'allow' })),
    lifecycle: schema.maybe(
      schema.object({
        enabled: schema.boolean(),
        data_retention: schema.maybe(schema.string({ maxLength: 1000 })),
        frozen_after: schema.maybe(schema.string({ maxLength: 1000 })),
      })
    ),
    // Allowing unknowns here to support data stream options that are not yet defined in the schema
    data_stream_options: schema.maybe(schema.object({}, { unknowns: 'allow' })),
  }),
  version: schema.maybe(schema.number()),
  _meta: schema.maybe(schema.object({}, { unknowns: 'allow' })),
  _kbnMeta: schema.object({
    usedBy: schema.arrayOf(schema.string({ maxLength: 1000 }), { maxSize: 1000 }),
    isManaged: schema.boolean(),
  }),
  deprecated: schema.maybe(schema.boolean()),
});
