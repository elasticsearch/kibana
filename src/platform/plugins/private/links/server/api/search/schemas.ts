/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  asCodeMetaSchema,
  asCodePaginationResponseMetaSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_ID_LENGTH,
  MAX_TITLE_LENGTH,
  PAGINATION_MAX_SIZE,
} from '@kbn/as-code-shared-schemas';
import { schema } from '@kbn/config-schema';

export const searchResponseBodySchema = schema.object({
  data: schema.arrayOf(
    schema.object({
      id: schema.string({ maxLength: MAX_ID_LENGTH }),
      data: schema.object({
        description: schema.maybe(
          schema.string({
            maxLength: MAX_DESCRIPTION_LENGTH,
            meta: { description: 'A short description of the links library item.' },
          })
        ),
        title: schema.string({
          maxLength: MAX_TITLE_LENGTH,
          meta: { description: 'The links library item title.' },
        }),
      }),
      meta: asCodeMetaSchema,
    }),
    {
      minSize: 0,
      maxSize: PAGINATION_MAX_SIZE,
      meta: {
        description: 'List of links library items matching the query.',
      },
    }
  ),
  meta: asCodePaginationResponseMetaSchema,
});
