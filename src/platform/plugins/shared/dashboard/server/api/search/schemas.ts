/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { timeRangeSchema } from '@kbn/es-query-server';
import { asCodeMetaSchema, getAsCodeTagsSchema } from '@kbn/as-code-shared-schemas';
import { accessControlSchema } from '../dashboard_state_schemas';

export const searchResponseBodySchema = schema.object({
  dashboards: schema.arrayOf(
    schema.object({
      id: schema.string({
        meta: { description: 'The dashboard ID.' },
      }),
      data: schema.object({
        description: schema.maybe(
          schema.string({ meta: { description: 'A short description of the dashboard.' } })
        ),
        tags: getAsCodeTagsSchema('Tag IDs associated with this dashboard.'),
        time_range: schema.maybe(timeRangeSchema),
        title: schema.string({ meta: { description: 'The dashboard title.' } }),
        access_control: accessControlSchema,
      }),
      meta: asCodeMetaSchema,
    }),
    {
      meta: {
        description:
          'List of dashboards matching the query. Each entry includes summary fields but not the full panel layout.',
      },
    }
  ),
  total: schema.number({
    meta: { description: 'The total number of dashboards matching the query.' },
  }),
  page: schema.number({
    meta: { description: 'The current page number.' },
  }),
});
