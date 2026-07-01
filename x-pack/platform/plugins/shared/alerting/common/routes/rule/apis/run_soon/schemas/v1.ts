/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { MAX_ID_LENGTH } from '../../../../../constants';

export const runSoonRequestParamsSchema = schema.object({
  id: schema.string({ maxLength: MAX_ID_LENGTH }),
});

export const runSoonRequestQuerySchema = schema.maybe(
  schema.object({
    force: schema.maybe(schema.boolean({ defaultValue: false })),
  })
);
