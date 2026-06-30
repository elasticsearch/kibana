/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

export const EndpointSuggestionsSchema = {
  body: schema.object({
    field: schema.string({ maxLength: 1024 }),
    query: schema.string({ maxLength: 2048 }),
    filters: schema.maybe(
      schema.arrayOf(schema.object({}, { unknowns: 'allow' }), { maxSize: 50 })
    ),
    fieldMeta: schema.maybe(schema.any()),
  }),
  params: schema.object({
    suggestion_type: schema.oneOf([
      schema.literal('eventFilters'),
      schema.literal('endpoints'),
      schema.literal('endpointExceptions'),
      schema.literal('trustedApps'),
      schema.literal('trustedDevices'),
    ]),
  }),
};

export type EndpointSuggestionsBody = TypeOf<typeof EndpointSuggestionsSchema.body>;
export type EndpointSuggestionsParams = TypeOf<typeof EndpointSuggestionsSchema.params>;
