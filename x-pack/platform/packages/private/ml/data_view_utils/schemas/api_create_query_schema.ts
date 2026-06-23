/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';

export const dataViewCreateQuerySchema = schema.object({
  createDataView: schema.boolean({ defaultValue: false }),
  timeFieldName: schema.maybe(schema.string({ maxLength: 10000 })),
});

export type DataViewCreateQuerySchema = TypeOf<typeof dataViewCreateQuerySchema>;
