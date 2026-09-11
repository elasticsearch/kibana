/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { timeRangeSchema } from '@kbn/es-query-server';
import {
  asCodeMetaSchema,
  asCodePaginationResponseMetaSchema,
  getAsCodeTagsSchema,
  PAGINATION_MAX_SIZE,
} from '@kbn/as-code-shared-schemas';
import { accessControlSchema } from '@kbn/as-code-dashboard-schema';

export const searchResponseBodySchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id: z.string().meta({ description: 'The dashboard ID.' }),
            data: z
              .object({
                description: z
                  .string()
                  .optional()
                  .meta({ description: 'A short description of the dashboard.' }),
                tags: getAsCodeTagsSchema(
                  'Tag IDs associated with this dashboard.',
                  100
                ).optional(),
                time_range: timeRangeSchema.optional(),
                title: z.string().meta({ description: 'The dashboard title.' }),
                access_control: accessControlSchema,
              })
              .strict(),
            meta: asCodeMetaSchema,
          })
          .strict()
      )
      .max(PAGINATION_MAX_SIZE)
      .meta({
        description:
          'List of dashboards matching the query. Each entry includes summary fields but not the full panel layout.',
      }),
    meta: asCodePaginationResponseMetaSchema,
  })
  .strict();
