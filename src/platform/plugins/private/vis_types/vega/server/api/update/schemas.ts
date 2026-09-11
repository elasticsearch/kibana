/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { asCodeIdSchema, asCodeMetaSchema } from '@kbn/as-code-shared-schemas';
import { vegaLibraryItemSchema } from '../schema';
import { VEGA_LIBRARY_ITEM_ID_DESCRIPTION } from '../constants';

export const updateRequestParamsSchema = z.object({
  id: asCodeIdSchema,
});

export const updateRequestBodySchema = vegaLibraryItemSchema;

export const updateResponseBodySchema = z
  .object({
    id: z.string().meta({ description: VEGA_LIBRARY_ITEM_ID_DESCRIPTION }),
    data: vegaLibraryItemSchema,
    meta: asCodeMetaSchema,
  })
  .strict();
