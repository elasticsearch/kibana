/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import {
  asCodeMetaSchema,
  asCodePaginationResponseMetaSchema,
  asCodeSearchRequestSchema,
  getAsCodeTagsSchema,
  PAGINATION_MAX_SIZE,
} from '@kbn/as-code-shared-schemas';
import type { discoverSessionControlPanelsSchema } from '@kbn/as-code-discover-schema';
import { discoverSessionApiDataSchema } from '@kbn/as-code-discover-schema';
import {
  MAX_DISCOVER_SESSION_TAGS,
  MAX_SEARCH_QUERY_LENGTH,
} from '@kbn/discover-session-constants';

export const discoverSessionApiResponseSchema = z
  .object({
    id: z.string().meta({ description: 'The Discover session ID.' }),
    data: discoverSessionApiDataSchema,
    meta: asCodeMetaSchema,
  })
  .strict();

/* Shared context for warnings produced while transforming a Discover session tab. */
const discoverSessionWarningBaseSchema = z.object({
  message: z.string().meta({ description: 'Why stored content was omitted from the response.' }),
  tab_id: z.string().meta({ description: 'The ID of the affected tab.' }),
});

/* Reports one invalid panel while allowing the other panels in the tab to be returned. */
const discoverSessionDroppedPanelWarningSchema = discoverSessionWarningBaseSchema
  .extend({
    type: z.literal('dropped_panel'),
    panel_id: z.string().meta({ description: 'The ID of the omitted control panel.' }),
  })
  .strict();

/* Reports a tab property that could not be returned as a whole. */
const discoverSessionDroppedPropertyWarningSchema = discoverSessionWarningBaseSchema
  .extend({
    type: z.literal('dropped_property'),
    key: z.string().meta({ description: 'The name of the property omitted from the response.' }),
  })
  .strict();

/* Allows GET responses to preserve valid session data while reporting what was dropped. */
export const discoverSessionWarningsSchema = z
  .array(
    z.union([discoverSessionDroppedPanelWarningSchema, discoverSessionDroppedPropertyWarningSchema])
  )
  .meta({
    description:
      'Warnings generated when stored Discover session content cannot be fully represented in the API response.',
  });

export const discoverSessionGetResponseSchema = discoverSessionApiResponseSchema.extend({
  warnings: discoverSessionWarningsSchema.optional(),
});

export const discoverSessionSanitizeResponseSchema = z
  .object({
    data: discoverSessionApiDataSchema,
    warnings: discoverSessionWarningsSchema.optional(),
  })
  .strict();

export const discoverSessionSearchParamsSchema = asCodeSearchRequestSchema.extend({
  query: z
    .string()
    .max(MAX_SEARCH_QUERY_LENGTH)
    .meta({
      description:
        'Full-text search (`simple_query_string`) over `title` and `description`. All terms must match.',
    })
    .optional(),
});

const discoverSessionSearchItemSchema = z
  .object({
    id: z.string().meta({ description: 'The Discover session ID.' }),
    data: z
      .object({
        title: z.string().meta({ description: 'Discover session title.' }),
        description: z.string().optional().meta({ description: 'Discover session description.' }),
        tags: getAsCodeTagsSchema(
          'Tag IDs associated with this Discover session.',
          MAX_DISCOVER_SESSION_TAGS
        ).optional(),
      })
      .strict(),
    meta: asCodeMetaSchema,
  })
  .strict();

export const discoverSessionSearchResponseSchema = z
  .object({
    data: z
      .array(discoverSessionSearchItemSchema)
      // Mirror the request's production-enforced `per_page` maximum in OAS and dev response validation.
      .max(PAGINATION_MAX_SIZE)
      .meta({
        description: 'List of matching Discover sessions (summaries, not the full session state).',
      }),
    meta: asCodePaginationResponseMetaSchema,
  })
  .strict();

export type DiscoverSessionApiData = z.output<typeof discoverSessionApiDataSchema>;
export type DiscoverSessionApiResponse = z.output<typeof discoverSessionApiResponseSchema>;
export type DiscoverSessionGetResponse = z.output<typeof discoverSessionGetResponseSchema>;
export type DiscoverSessionSanitizeResponse = z.output<
  typeof discoverSessionSanitizeResponseSchema
>;
export type DiscoverSessionWarning = z.output<typeof discoverSessionWarningsSchema>[number];
export type DiscoverSessionSearchParams = z.output<typeof discoverSessionSearchParamsSchema>;
export type DiscoverSessionSearchResponse = z.output<typeof discoverSessionSearchResponseSchema>;
export type DiscoverSessionControlPanels = z.output<typeof discoverSessionControlPanelsSchema>;

// Input types (shape accepted by the API, before defaults applied)
export type DiscoverSessionApiDataInput = z.input<typeof discoverSessionApiDataSchema>;
