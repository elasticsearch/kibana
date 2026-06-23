/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const createFilterSchema = schema.object({
  filterId: schema.string({ maxLength: 10000 }),
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  items: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
});

export const updateFilterSchema = schema.object({
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  addItems: schema.maybe(schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })),
  removeItems: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })
  ),
});

export const filterIdSchema = schema.object({
  filterId: schema.string({ maxLength: 10000, meta: { description: 'ID of the filter' } }),
});
