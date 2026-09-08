/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { Version } from '@kbn/object-versioning';
import { versionSchema } from './constants';

import type { ProcedureSchemas } from './types';

export const searchQuerySchema = schema.oneOf([
  schema.object(
    {
      text: schema.maybe(schema.string()),
      tags: schema.maybe(
        schema.object({
          included: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
          excluded: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
        })
      ),
      limit: schema.maybe(schema.number()),
      cursor: schema.maybe(schema.string()),
      sort: schema.maybe(
        schema.object({
          field: schema.string(),
          direction: schema.oneOf([schema.literal('asc'), schema.literal('desc')]),
        })
      ),
      createdBy: schema.maybe(
        schema.object({
          included: schema.maybe(schema.arrayOf(schema.string())),
          excluded: schema.maybe(schema.arrayOf(schema.string())),
          includeNoCreator: schema.maybe(schema.boolean()),
        })
      ),
      favorites: schema.maybe(
        schema.object({
          only: schema.maybe(schema.boolean()),
          ids: schema.maybe(schema.arrayOf(schema.string())),
        })
      ),
      facets: schema.maybe(
        schema.object({
          tags: schema.maybe(
            schema.object({
              size: schema.maybe(schema.number()),
              includeMissing: schema.maybe(schema.boolean()),
            })
          ),
          createdBy: schema.maybe(
            schema.object({
              size: schema.maybe(schema.number()),
              includeMissing: schema.maybe(schema.boolean()),
            })
          ),
        })
      ),
    },
    {
      unknowns: 'forbid',
    }
  ),
]);

export const searchResultSchema = schema.object({
  // codeql[js/kibana/unbounded-array-in-schema] output schema — server controls the response size
  hits: schema.arrayOf(schema.any()),
  pagination: schema.object({
    total: schema.number(),
    cursor: schema.maybe(schema.string()),
  }),
  facets: schema.maybe(
    schema.object({
      tags: schema.maybe(
        schema.arrayOf(
          schema.object({
            key: schema.string(),
            doc_count: schema.number(),
          })
        )
      ),
      createdBy: schema.maybe(
        schema.arrayOf(
          schema.object({
            key: schema.string(),
            doc_count: schema.number(),
          })
        )
      ),
    })
  ),
});

export const searchSchemas = {
  in: schema.object(
    {
      contentTypeId: schema.string(),
      version: versionSchema,
      query: searchQuerySchema,
      options: schema.maybe(schema.object({}, { unknowns: 'allow' })),
    },
    { unknowns: 'forbid' }
  ),
  out: schema.object(
    {
      contentTypeId: schema.string(),
      result: searchResultSchema,
      meta: schema.maybe(schema.object({}, { unknowns: 'allow' })),
    },
    { unknowns: 'forbid' }
  ),
} satisfies ProcedureSchemas;

export interface SearchQuery {
  /** The text to search for */
  text?: string;
  /** List of tags id to include and exclude */
  tags?: {
    included?: string[];
    excluded?: string[];
  };
  /** The number of result to return */
  limit?: number;
  /** The cursor for this query. Can be a page number or a cursor */
  cursor?: string;
  /** Sorting support */
  sort?: {
    /** Field to sort by (e.g., 'title', 'updatedAt', 'createdAt') */
    field: string;
    /** Sort direction */
    direction: 'asc' | 'desc';
  };
  /** User/creator filtering */
  createdBy?: {
    /** User profile UIDs to include */
    included?: string[];
    /** User profile UIDs to exclude */
    excluded?: string[];
    /** Include items with no creator (null/undefined createdBy) */
    includeNoCreator?: boolean;
  };
  /** Favorites filtering */
  favorites?: {
    /** Only return favorited items for current user */
    only?: boolean;
    /** Pre-fetched favorite IDs (client-provided optimization) */
    ids?: string[];
  };
  /** Facet requests */
  facets?: {
    /** Request tag facet counts */
    tags?: { size?: number; includeMissing?: boolean };
    /** Request creator facet counts */
    createdBy?: { size?: number; includeMissing?: boolean };
  };
}

export interface SearchIn<T extends string = string, Options extends void | object = object> {
  contentTypeId: T;
  query: SearchQuery;
  version?: Version;
  options?: Options;
}

export type SearchResult<T = unknown, M = void> = M extends void
  ? {
      hits: T[];
      pagination: {
        total: number;
        /** Page number or cursor */
        cursor?: string;
      };
      /** Facet results */
      facets?: {
        tags?: Array<{ key: string; doc_count: number }>;
        createdBy?: Array<{ key: string; doc_count: number }>;
      };
    }
  : {
      hits: T[];
      pagination: {
        total: number;
        /** Page number or cursor */
        cursor?: string;
      };
      meta: M;
      /** Facet results */
      facets?: {
        tags?: Array<{ key: string; doc_count: number }>;
        createdBy?: Array<{ key: string; doc_count: number }>;
      };
    };
