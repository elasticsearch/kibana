/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import {
  asCodeMetaSchema,
  asCodePaginationResponseMetaSchema,
  asCodeSearchRequestSchema,
  PAGINATION_MAX_SIZE,
} from '@kbn/as-code-shared-schemas';

export const searchRequestQuerySchema = asCodeSearchRequestSchema;

export const searchResponseBodySchema = schema.object({
  data: schema.arrayOf(
    schema.object({
      id: schema.string({ meta: { description: 'The markdown library item ID.' } }),
      data: schema.object({
        description: schema.maybe(
          schema.string({ meta: { description: 'The markdown library item description.' } })
        ),
        title: schema.string({ meta: { description: 'The markdown library item title.' } }),
      }),
      meta: asCodeMetaSchema,
    }),
    {
      minSize: 0,
      maxSize: PAGINATION_MAX_SIZE,
      meta: { description: 'List of markdown library items matching the query.' },
    }
  ),
  meta: asCodePaginationResponseMetaSchema,
});
