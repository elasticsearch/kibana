/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const getConnectorSpecParamsSchema = schema.object({
  id: schema.string({
    minLength: 1,
    maxLength: 64,
    meta: {
      description: 'The connector type identifier.',
    },
  }),
});
