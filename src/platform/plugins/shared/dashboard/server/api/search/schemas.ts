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
import {
  asCodeMetaSchema,
  asCodePaginationParamsSchema,
  asCodePaginationResponseMetaSchema,
  PAGINATION_MAX_SIZE,
} from '@kbn/as-code-shared-schemas';
import { accessControlSchema } from '../dashboard_state_schemas';

export const legacySearchRequestParamsSchema = schema.object({
  page: schema.maybe(
    schema.number({
      meta: {
        description: 'The page of results to return. Defaults to `1`.',
      },
    })
  ),
  per_page: schema.maybe(
    schema.number({
      meta: {
        description: 'The number of results to return per page. Defaults to `20`.',
      },
    })
  ),
  query: schema.maybe(
    schema.string({
      meta: {
        description:
          'Filters results by `title` and `description` using Elasticsearch [`simple_query_string`](https://www.elastic.co/docs/reference/query-languages/query-dsl/simple-query-string-query) syntax. Multi-word terms require all words to match.',
      },
    })
  ),
  tags: schema.maybe(
    schema.oneOf([schema.string(), schema.arrayOf(schema.string(), { maxSize: 100 })], {
      meta: {
        description:
          'A tag ID to include. Accepts a single tag ID or multiple tag IDs. When multiple are specified, dashboards matching any of the tag IDs are included.',
      },
    })
  ),
  excluded_tags: schema.maybe(
    schema.oneOf([schema.string(), schema.arrayOf(schema.string(), { maxSize: 100 })], {
      meta: {
        description:
          'A tag ID to exclude. Accepts a single tag ID or multiple tag IDs. When multiple are specified, dashboards matching any of the tag IDs are excluded.',
      },
    })
  ),
});

export const searchRequestParamsSchema = schema.object({
  ...asCodePaginationParamsSchema.getPropSchemas(),
  query: schema.maybe(
    schema.string({
      meta: {
        description:
          'Filters results by `title` and `description` using Elasticsearch [`simple_query_string`](https://www.elastic.co/docs/reference/query-languages/query-dsl/simple-query-string-query) syntax. Multi-word terms require all words to match.',
      },
    })
  ),
  tags: schema.maybe(
    schema.oneOf([schema.string(), schema.arrayOf(schema.string(), { maxSize: 100 })], {
      meta: {
        description:
          'A tag ID to include. Accepts a single tag ID or multiple tag IDs. When multiple are specified, dashboards matching any of the tag IDs are included.',
      },
    })
  ),
  excluded_tags: schema.maybe(
    schema.oneOf([schema.string(), schema.arrayOf(schema.string(), { maxSize: 100 })], {
      meta: {
        description:
          'A tag ID to exclude. Accepts a single tag ID or multiple tag IDs. When multiple are specified, dashboards matching any of the tag IDs are excluded.',
      },
    })
  ),
});

export const legacySearchResponseBodySchema = schema.object({
  dashboards: schema.arrayOf(
    schema.object({
      id: schema.string({
        meta: { description: 'The dashboard ID.' },
      }),
      data: schema.object({
        description: schema.maybe(
          schema.string({ meta: { description: 'A short description of the dashboard.' } })
        ),
        tags: schema.maybe(
          schema.arrayOf(schema.string(), {
            maxSize: 100,
            meta: { description: 'Tag IDs associated with this dashboard.' },
          })
        ),
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
  page: schema.number({
    meta: {
      description: 'The page of results returned.',
    },
  }),
  total: schema.number({
    meta: {
      description: 'The total number of dashboards matching the query.',
    },
  }),
});

export const searchResponseBodySchema = schema.object({
  data: schema.arrayOf(
    schema.object({
      id: schema.string({
        meta: { description: 'The dashboard ID.' },
      }),
      data: schema.object({
        description: schema.maybe(
          schema.string({ meta: { description: 'A short description of the dashboard.' } })
        ),
        tags: schema.maybe(
          schema.arrayOf(schema.string(), {
            maxSize: 100,
            meta: { description: 'Tag IDs associated with this dashboard.' },
          })
        ),
        time_range: schema.maybe(timeRangeSchema),
        title: schema.string({ meta: { description: 'The dashboard title.' } }),
        access_control: accessControlSchema,
      }),
      meta: asCodeMetaSchema,
    }),
    {
      maxSize: PAGINATION_MAX_SIZE,
      meta: {
        description:
          'List of dashboards matching the query. Each entry includes summary fields but not the full panel layout.',
      },
    }
  ),
  meta: asCodePaginationResponseMetaSchema,
});
